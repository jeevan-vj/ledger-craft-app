import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShareInvoiceResponse } from '@ledgercraft/contracts';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { AppPressable } from '@/components/ui/AppPressable';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { invoiceService } from '@/services/invoiceService';
import {
  buildInvoiceShareMessage,
  buildPublicInvoiceUrl,
  shareLinkSummary,
} from '@/features/invoices/invoiceSharing';
import { downloadInvoicePDF, shareInvoicePDF } from '@/utils/pdfUtils';
import { isShareSheetDismissal } from '@/utils/shareSheet';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type Action = 'link' | 'download' | 'pdf' | 'replace' | 'revoke' | null;

interface InvoiceShareActionsProps {
  readonly visible: boolean;
  readonly invoice: Invoice;
  readonly businessProfile?: BusinessProfile;
  readonly canManageShares?: boolean;
  readonly onClose: () => void;
}

export default function InvoiceShareActions(props: InvoiceShareActionsProps) {
  return props.visible ? <ShareActions key={`${props.invoice.id}:${props.invoice.templateName ?? 'classic'}`} {...props} /> : null;
}

function ShareActions({
  visible,
  invoice,
  businessProfile,
  canManageShares = true,
  onClose,
}: InvoiceShareActionsProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const palette = theme.colors;
  const template = (invoice.templateName as InvoiceTemplateId | undefined) ?? 'classic';
  const [busy, setBusy] = useState<Action>(null);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const queryKey = ['invoice-shares', invoice.id];
  const lock = useRef(false);
  const links = useQuery({
    queryKey,
    queryFn: () => invoiceService.listShareLinks(invoice.id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: () => !lock.current,
    refetchOnReconnect: () => !lock.current,
  });
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const isActive = (share: ShareInvoiceResponse) => share.isActive && (!share.expiresAt || new Date(share.expiresAt).getTime() > now);
  const current = links.data?.find((share) => share.templateName === template && isActive(share));
  const shareUrl = current ? buildPublicInvoiceUrl(current.shareToken) : null;
  const linkDisabled = busy !== null || links.isPending || links.isFetching || links.isError;

  const run = async (action: Exclude<Action, null>, work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    setError(null);
    try {
      if (action === 'link' || action === 'replace' || action === 'revoke') await queryClient.cancelQueries({ queryKey });
      await work();
    } catch {
      // API/native exceptions may contain the private link; never display or log them.
      setError('Unable to complete action. Please try again.');
      // The server may have committed even if its response was lost. Reconcile
      // before another action; a failed refresh keeps link controls disabled.
      if (action === 'link' || action === 'replace' || action === 'revoke') {
        await queryClient.invalidateQueries({ queryKey });
      }
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const remember = async (share: ShareInvoiceResponse, replace = false) => {
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<ShareInvoiceResponse[]>(queryKey, (previous) => [
      share, ...(replace ? [] : (previous ?? []).filter((item) => item.shareToken !== share.shareToken)),
    ]);
    setRevoked(false);
    setNow(Date.now());
  };
  const createLink = async (): Promise<string> => {
    if (current && (!current.expiresAt || new Date(current.expiresAt).getTime() > Date.now())) {
      return buildPublicInvoiceUrl(current.shareToken);
    }
    if (!canManageShares) {
      throw new Error('You do not have permission to create a share link');
    }
    const share = await invoiceService.createShareLink(invoice.id, template);
    await remember(share);
    return buildPublicInvoiceUrl(share.shareToken);
  };

  const replaceLink = () => Alert.alert(
    'Replace link?',
    'Publish the current invoice and business details with no expiry. All existing links for this invoice will stop working.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace link', style: 'destructive', onPress: () => void run('replace', async () => {
      const share = await invoiceService.createShareLink(invoice.id, template, { replace: true, expiresAt: null });
      await remember(share, true);
    }) }],
  );
  const revokeLinks = () => Alert.alert(
    'Revoke all links?',
    'All existing links for this invoice, including other templates, will stop working. Copies already downloaded cannot be recalled.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Revoke all links', style: 'destructive', onPress: () => void run('revoke', async () => {
      await invoiceService.revokeShareLinks(invoice.id);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, []);
      setRevoked(true);
    }) }],
  );

  const shareLink = () => run('link', async () => {
    const url = await createLink();
    try {
      await Share.share({
        title: `Invoice ${invoice.invoiceNumber}`,
        message: buildInvoiceShareMessage({
          invoiceNumber: invoice.invoiceNumber,
          businessName: businessProfile?.name,
          url,
        }),
        url,
      });
    } catch (error) {
      if (isShareSheetDismissal(error)) return;
      throw error;
    }
  });

  const copyLink = () => run('link', async () => {
    await Clipboard.setStringAsync(await createLink());
    Alert.alert('Link copied', 'The public invoice link is ready to paste.');
  });

  const openLink = () => run('link', async () => {
    await Linking.openURL(await createLink());
  });

  const savePdf = () => run('download', async () => {
    const saved = await downloadInvoicePDF(invoice, businessProfile, template);
    if (saved) Alert.alert('PDF ready', 'The invoice PDF was saved or exported successfully.');
  });

  const sharePdf = () => run('pdf', async () => {
    await shareInvoicePDF(invoice, businessProfile, template);
  });

  const rows = [
    { key: 'link' as const, icon: 'link-2' as const, title: 'Share link', subtitle: 'Anyone with the link can view the invoice', onPress: shareLink },
    { key: 'download' as const, icon: 'download' as const, title: 'Download PDF', subtitle: 'Save or export a PDF copy', onPress: savePdf },
    { key: 'pdf' as const, icon: 'share' as const, title: 'Share PDF', subtitle: 'Attach the PDF to another app', onPress: sharePdf },
  ].filter((row) => row.key !== 'link' || canManageShares || Boolean(current));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <AppPressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close share actions" />
      <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.handle} />
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.title}>Share invoice</Text>
            <Text style={styles.subtitle}>{invoice.invoiceNumber}</Text>
          </View>
          <AppPressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close share actions"
            style={styles.close}
          >
            <Feather name="x" size={20} color={palette.text} />
          </AppPressable>
        </View>

        <View style={styles.group}>
          {rows.map((row) => (
            <AppPressable
              key={row.key}
              onPress={row.onPress}
              disabled={row.key === 'link' ? linkDisabled : busy !== null}
              accessibilityRole="button"
              accessibilityLabel={row.title}
              accessibilityHint={row.subtitle}
              accessibilityState={{ busy: busy === row.key, disabled: row.key === 'link' ? linkDisabled : busy !== null }}
              style={styles.row}
            >
              <View style={styles.iconWell}>
                {busy === row.key ? (
                  <ActivityIndicator size="small" color={palette.accentText} />
                ) : (
                  <Feather name={row.icon} size={19} color={palette.accentText} />
                )}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={palette.textTertiary} />
            </AppPressable>
          ))}
        </View>

        <ShareStatus
          links={links}
          current={current}
          revoked={revoked}
          error={error}
          busy={busy}
          linkDisabled={linkDisabled}
          onReplace={replaceLink}
          onRevoke={revokeLinks}
          canManageShares={canManageShares}
        />

        {shareUrl ? (
          <View style={styles.linkCard}>
            <Text numberOfLines={2} selectable style={styles.link}>{shareUrl}</Text>
            <View style={styles.linkActions}>
              <AppPressable disabled={linkDisabled} onPress={copyLink} accessibilityRole="button" accessibilityLabel="Copy link" style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Copy link</Text>
              </AppPressable>
              <AppPressable disabled={linkDisabled} onPress={openLink} accessibilityRole="link" accessibilityLabel="Open link" style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Open link</Text>
              </AppPressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

function shareStatusLabel(current: ShareInvoiceResponse | undefined, hasLinks: boolean): string {
  if (!current) return hasLinks ? 'No active link for this template' : 'No active link';
  if (!current.expiresAt) return 'Active · No expiry';
  return `Active · Expires ${new Date(current.expiresAt).toLocaleString()}`;
}

interface ShareStatusProps {
  readonly links: UseQueryResult<ShareInvoiceResponse[], Error>;
  readonly current: ShareInvoiceResponse | undefined;
  readonly revoked: boolean;
  readonly error: string | null;
  readonly busy: Action;
  readonly linkDisabled: boolean;
  readonly onReplace: () => void;
  readonly onRevoke: () => void;
  readonly canManageShares: boolean;
}

function ShareStatus({ links, current, revoked, error, busy, linkDisabled, onReplace, onRevoke, canManageShares }: ShareStatusProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const palette = theme.colors;
  return (
    <View style={styles.linkCard}>
      {links.isPending ? <Text style={styles.subtitle}>Loading sharing status…</Text> : null}
      {links.isError ? <>
        <Text accessibilityRole="alert" style={styles.subtitle}>Unable to load sharing status. Please retry.</Text>
        <AppPressable accessibilityRole="button" accessibilityLabel="Retry sharing status" disabled={links.isFetching || busy !== null} onPress={() => void links.refetch()} style={styles.linkButton}><Text style={styles.linkButtonText}>Retry</Text></AppPressable>
      </> : null}
      {links.isSuccess ? <>
        <Text style={styles.rowTitle}>{shareStatusLabel(current, links.data.length > 0)}</Text>
        {links.data.map((share) => (
          <Text key={share.shareToken} style={styles.rowSubtitle}>{shareLinkSummary(share)}</Text>
        ))}
        {revoked ? <Text style={styles.subtitle}>Access revoked. Existing links no longer work.</Text> : null}
        <Text style={styles.rowSubtitle}>Links keep the invoice and business details from when they were created. Replace a link to publish current details.</Text>
        {canManageShares && links.data.length > 0 ? (
          <View style={styles.linkActions}>
            <AppPressable accessibilityRole="button" accessibilityLabel="Replace link" disabled={linkDisabled} onPress={onReplace} style={styles.linkButton}><Text style={styles.linkButtonText}>Replace link</Text></AppPressable>
            <AppPressable accessibilityRole="button" accessibilityLabel="Revoke all links" disabled={linkDisabled} onPress={onRevoke} style={styles.linkButton}><Text style={styles.linkButtonText}>Revoke all links</Text></AppPressable>
          </View>
        ) : null}
      </> : null}
      {error ? <Text accessibilityRole="alert" style={styles.subtitle}>{error}</Text> : null}
      {busy === 'replace' || busy === 'revoke' ? <ActivityIndicator accessibilityLabel="Updating sharing access" color={palette.accentText} /> : null}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.scrim },
  sheet: {
    backgroundColor: palette.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    maxHeight: '90%',
    flexGrow: 0,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: palette.separator, alignSelf: 'center', marginBottom: space.lg },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  title: { ...type.title },
  subtitle: { ...type.subhead, marginTop: 2 },
  close: { width: control.touchTarget, height: control.touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.fill },
  group: { alignSelf: 'stretch', backgroundColor: palette.surfaceRaised, borderRadius: radius.group, overflow: 'hidden', borderWidth: 1, borderColor: palette.border },
  row: { width: '100%', minHeight: 72, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator },
  iconWell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentFill, marginRight: space.md },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
  rowSubtitle: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  linkCard: { marginTop: space.lg, padding: space.md, borderRadius: radius.group, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
  link: { fontSize: 13, lineHeight: 18, color: palette.textSecondary },
  linkActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  linkButton: { minHeight: control.touchTarget, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: palette.fill },
  linkButtonText: { color: palette.accentText, fontWeight: '600' },
});
