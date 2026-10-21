import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppPressable } from '@/components/ui/AppPressable';
import { EmptyState } from '@/components/ui/EmptyState';
import { GroupedSection } from '@/components/ui/GroupedSection';
import { ListRow } from '@/components/ui/ListRow';
import { ModernButton } from '@/components/ui/ModernButton';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import {
  QUOTE_EMAIL_UNAVAILABLE,
  availableQuoteActions,
  createSingleFlight,
  isInvalidQuoteTransition,
  mutationFailureMessage,
  needsAcceptBeforeConvert,
  quoteConvertFollowUp,
  quoteKindLabel,
  quoteStatusLabel,
  quoteTemplateId,
  quoteToPreviewInvoice,
} from '@/features/quotes/quoteModel';
import { buildPublicQuoteUrl, buildQuoteShareMessage } from '@/features/quotes/quoteSharing';
import type { InvoiceStackParamList } from '@/navigation/types';
import { businessProfileService } from '@/services/businessProfileService';
import { space } from '@/theme/tokens';
import { quoteDocumentLabels } from '@/utils/invoiceTemplates';
import { downloadInvoicePDF } from '@/utils/pdfUtils';
import { formatMoney } from '@/utils/money';
import { useTheme } from '@/theme';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';

type Navigation = NativeStackNavigationProp<InvoiceStackParamList, 'QuoteDetail'>;
type Route = RouteProp<InvoiceStackParamList, 'QuoteDetail'>;
type ResponseAction = 'accept' | 'decline' | 'acceptAndConvert';

export default function QuoteDetailScreen() {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const { bottomPadding } = useTabScreenInsets();
  const navigation = useNavigation<Navigation>();
  const { quoteId } = useRoute<Route>().params;
  const queryClient = useQueryClient();
  const convertFlight = useRef(createSingleFlight());
  const [busy, setBusy] = useState<string | null>(null);
  const [responseAction, setResponseAction] = useState<ResponseAction | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const quoteQuery = useQuery({ queryKey: ['quotes', 'detail', quoteId], queryFn: () => quotesApi.get(quoteId) });
  const profileQuery = useQuery({ queryKey: ['business-profile'], queryFn: () => businessProfileService.getBusinessProfile() });
  const quote = quoteQuery.data;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['quotes'] });
  };

  const run = async (action: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    try {
      await work();
      await refresh();
    } catch (error) {
      Alert.alert('Could not update quote', mutationFailureMessage(error, onlineManager.isOnline()));
    } finally {
      setBusy(null);
    }
  };

  const share = () => run('share', async () => {
    if (!quote) return;
    const result = await quotesApi.share(quote.id, quote.templateName);
    const url = buildPublicQuoteUrl(result.shareToken);
    await Share.share({
      title: `${quoteKindLabel(quote.kind)} ${quote.quoteNumber}`,
      message: buildQuoteShareMessage({
        kind: quote.kind,
        quoteNumber: quote.quoteNumber,
        businessName: profileQuery.data?.name,
        url,
      }),
    });
  });

  const convert = async (acceptedName?: string, acceptedNote?: string) => {
    if (!quote || busy) return;
    if (quote.convertedInvoiceId) {
      navigation.navigate('InvoiceDetail', { invoiceId: quote.convertedInvoiceId });
      return;
    }
    const key = convertFlight.current.claim();
    if (!key) return;
    setBusy('convert');
    try {
      let current = quote;
      if (needsAcceptBeforeConvert(current.status)) {
        try {
          current = await quotesApi.setStatus(current.id, {
            status: 'accepted',
            name: acceptedName?.trim() || undefined,
            note: acceptedNote?.trim() || undefined,
          });
        } catch (error) {
          if (!isInvalidQuoteTransition(error)) throw error;
          current = await quotesApi.get(quote.id);
          const followUp = quoteConvertFollowUp(current);
          if (followUp === 'stop') throw error;
          if (followUp === 'open' && current.convertedInvoiceId) {
            await refresh();
            navigation.navigate('InvoiceDetail', { invoiceId: current.convertedInvoiceId });
            return;
          }
        }
      }
      if (current.convertedInvoiceId) {
        await refresh();
        navigation.navigate('InvoiceDetail', { invoiceId: current.convertedInvoiceId });
        return;
      }
      const result = await quotesApi.convert(current.id, key);
      await refresh();
      navigation.navigate('InvoiceDetail', { invoiceId: result.invoiceId });
    } catch (error) {
      convertFlight.current.release();
      await refresh();
      Alert.alert('Could not convert quote', mutationFailureMessage(error, onlineManager.isOnline()));
    } finally {
      setBusy(null);
    }
  };

  const submitResponse = async () => {
    if (!responseAction) return;
    const action = responseAction;
    setResponseAction(null);
    if (action === 'acceptAndConvert') {
      await convert(name, note);
      return;
    }
    await run(action, async () => {
      await quotesApi.setStatus(quoteId, {
        status: action === 'accept' ? 'accepted' : 'declined',
        name: name.trim() || undefined,
        note: note.trim() || undefined,
      });
    });
  };

  if (quoteQuery.isLoading && !quote) {
    return <View style={styles.center}><ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading quote" /></View>;
  }

  if (!quote) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Quote unavailable"
          description={mutationFailureMessage(quoteQuery.error, onlineManager.isOnline())}
          actionLabel="Try again"
          onAction={() => quoteQuery.refetch()}
        />
      </View>
    );
  }

  const actions = availableQuoteActions(quote.status);
  const label = quoteKindLabel(quote.kind);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={quoteQuery.isRefetching} onRefresh={() => quoteQuery.refetch()} tintColor={palette.accent} colors={[palette.accent]} />}
      >
        <Text style={type.caption}>{label.toUpperCase()}</Text>
        <Text style={type.title}>{quote.quoteNumber}</Text>
        <Text style={styles.status}>{quoteStatusLabel(quote.status)} · revision {quote.revision}</Text>
        <Text style={styles.total}>{formatMoney(quote.total, quote.currency)}</Text>
        <Text style={styles.meta}>{quote.customerName || 'No customer'} · valid until {quote.expiryDate}</Text>
        <Text style={styles.meta}>Subtotal {formatMoney(quote.subtotal, quote.currency)} · GST {formatMoney(quote.taxAmount, quote.currency)}</Text>

        {quote.respondedByName ? (
          <Text style={styles.note}>{quoteStatusLabel(quote.status)} by {quote.respondedByName}{quote.responseNote ? `. ${quote.responseNote}` : ''}</Text>
        ) : null}

        <GroupedSection title="Lines">
          {quote.items.map((item) => (
            <ListRow
              key={item.id}
              label={item.description}
              subtitle={`${item.quantity} ${item.unit} × ${formatMoney(item.rate, quote.currency)}`}
              value={formatMoney(item.total, quote.currency)}
              showChevron={false}
            />
          ))}
        </GroupedSection>

        <View style={styles.actions}>
          {actions.includes('edit') ? <ModernButton fullWidth onPress={() => navigation.navigate('QuoteEdit', { quoteId: quote.id })}>Edit</ModernButton> : null}
          {actions.includes('markSent') ? <ModernButton fullWidth variant="secondary" loading={busy === 'sent'} disabled={busy !== null} onPress={() => run('sent', async () => { await quotesApi.markSent(quote.id); })}>Mark sent</ModernButton> : null}
          {actions.includes('share') ? <ModernButton fullWidth variant="secondary" loading={busy === 'share'} disabled={busy !== null} onPress={share}>Share link</ModernButton> : null}
          {actions.includes('accept') ? <ModernButton fullWidth variant="secondary" disabled={busy !== null} onPress={() => { setName(''); setNote(''); setResponseAction('accept'); }}>Mark accepted</ModernButton> : null}
          {actions.includes('decline') ? <ModernButton fullWidth variant="secondary" disabled={busy !== null} onPress={() => { setName(''); setNote(''); setResponseAction('decline'); }}>Mark declined</ModernButton> : null}
          {actions.includes('acceptAndConvert') ? <ModernButton fullWidth loading={busy === 'convert'} disabled={busy !== null} onPress={() => { setName(''); setNote(''); setResponseAction('acceptAndConvert'); }}>Mark accepted and convert</ModernButton> : null}
          {actions.includes('convert') ? <ModernButton fullWidth loading={busy === 'convert'} disabled={busy !== null} onPress={() => convert()}>Convert to invoice</ModernButton> : null}
          {actions.includes('openInvoice') && quote.convertedInvoiceId ? <ModernButton fullWidth onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: quote.convertedInvoiceId! })}>Open {quote.convertedInvoiceNumber || 'invoice'}</ModernButton> : null}
          {actions.includes('revise') ? <ModernButton fullWidth variant="secondary" disabled={busy !== null} onPress={() => Alert.alert('Revise this quote?', 'It returns to draft and old share links stop working. A customer can no longer accept the previous version.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Revise', style: 'destructive', onPress: () => run('revise', async () => { await quotesApi.revise(quote.id); }) },
          ])}>Revise</ModernButton> : null}
          <ModernButton fullWidth variant="secondary" disabled={busy !== null} onPress={() => run('duplicate', async () => {
            const copy = await quotesApi.duplicate(quote.id);
            navigation.navigate('QuoteDetail', { quoteId: copy.id });
          })}>Duplicate</ModernButton>
          <ModernButton fullWidth variant="outline" disabled={busy !== null} onPress={() => run('pdf', async () => {
            await downloadInvoicePDF(quoteToPreviewInvoice(quote), profileQuery.data ?? undefined, quoteTemplateId(quote.templateName), {
              labels: quoteDocumentLabels(quote.kind),
              filePrefix: label,
            });
          })}>Save PDF</ModernButton>
          {actions.includes('delete') ? <AppPressable accessibilityRole="button" accessibilityLabel="Delete draft" disabled={busy !== null} onPress={() => Alert.alert('Delete this draft?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => run('delete', async () => { await quotesApi.remove(quote.id); navigation.goBack(); }) },
          ])} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}><Text style={styles.deleteLabel}>Delete draft</Text></AppPressable> : null}
        </View>

        <View style={styles.email} accessibilityRole="text" accessibilityLabel={QUOTE_EMAIL_UNAVAILABLE}>
          <Feather name="mail" size={18} color={palette.textTertiary} />
          <View style={styles.emailCopy}>
            <Text style={styles.emailTitle}>Send email</Text>
            <Text style={styles.meta}>{QUOTE_EMAIL_UNAVAILABLE}</Text>
          </View>
        </View>
      </ScrollView>
      <ResponseSheet
        visible={responseAction !== null}
        title={responseAction === 'decline' ? 'Mark declined' : 'Mark accepted'}
        name={name}
        note={note}
        onChangeName={setName}
        onChangeNote={setNote}
        onClose={() => setResponseAction(null)}
        onSubmit={submitResponse}
      />
    </>
  );
}

function ResponseSheet({
  visible,
  title,
  name,
  note,
  onChangeName,
  onChangeNote,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  name: string;
  note: string;
  onChangeName: (value: string) => void;
  onChangeNote: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={theme.type.headline}>{title}</Text>
          <Text style={styles.meta}>Name is optional for a response you record yourself.</Text>
          <TextInput value={name} onChangeText={onChangeName} placeholder="Name" placeholderTextColor={theme.colors.textTertiary} style={styles.input} accessibilityLabel="Response name" />
          <TextInput value={note} onChangeText={onChangeNote} placeholder="Note" placeholderTextColor={theme.colors.textTertiary} style={[styles.input, styles.noteInput]} accessibilityLabel="Response note" multiline />
          <ModernButton fullWidth onPress={onSubmit}>Save</ModernButton>
          <ModernButton fullWidth variant="ghost" onPress={onClose}>Cancel</ModernButton>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background, padding: space.screen },
  content: { padding: space.screen },
  status: { ...type.subhead, marginTop: 4 },
  total: { ...type.display, marginTop: space.md, fontVariant: ['tabular-nums'] },
  meta: { ...type.footnote, marginTop: 4 },
  note: { ...type.body, marginTop: space.md },
  actions: { gap: space.sm, marginTop: space.lg },
  delete: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { ...type.callout, color: palette.danger },
  pressed: { opacity: 0.7 },
  email: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: space.lg, opacity: 0.7 },
  emailCopy: { flex: 1 },
  emailTitle: { ...type.callout, color: palette.textSecondary },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.screen, gap: space.sm },
  input: { ...type.body, minHeight: 48, borderRadius: 12, backgroundColor: palette.fill, paddingHorizontal: space.lg, color: palette.text },
  noteInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
});
