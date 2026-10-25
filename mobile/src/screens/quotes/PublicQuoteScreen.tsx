import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModernButton } from '@/components/ui/ModernButton';
import { quotesApi } from '@/features/quotes/api/quotesApi';
import { isQuoteAlreadyResponded, quoteKindLabel, quoteStatusLabel, quoteTemplateId, quoteToPreviewInvoice } from '@/features/quotes/quoteModel';
import type { RootStackParamList } from '@/navigation/types';
import { space } from '@/theme/tokens';
import { generateInvoiceHTML, quoteDocumentLabels } from '@/utils/invoiceTemplates';
import { downloadInvoicePDF } from '@/utils/pdfUtils';
import { useTheme } from '@/theme';

type PublicQuoteRoute = RouteProp<RootStackParamList, 'PublicQuote'>;

export default function PublicQuoteScreen() {
  const route = useRoute<PublicQuoteRoute>();
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const queryClient = useQueryClient();
  const token = route.params.shareToken;
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | 'pdf' | null>(null);
  const snapshot = useQuery({
    queryKey: ['quotes', 'public', token],
    queryFn: () => quotesApi.getPublic(token),
  });
  const ready = snapshot.data && snapshot.data !== 'inactive' ? snapshot.data : null;

  const quote = ready?.quote;
  const kind = quote?.kind ?? 'quote';
  const template = quoteTemplateId(ready?.templateName ?? quote?.templateName);
  const html = useMemo(() => {
    if (!quote || !ready) return '';
    return generateInvoiceHTML(
      quoteToPreviewInvoice(quote),
      ready.businessProfile,
      template,
      quoteDocumentLabels(quote.kind),
    );
  }, [quote, ready, template]);

  const respond = async (action: 'accept' | 'decline') => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Enter your name to respond.');
      return;
    }
    setNameError(null);
    setBusy(action);
    try {
      await quotesApi.respond(token, { action, name: trimmed, note: note.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: ['quotes', 'public', token] });
    } catch (error) {
      if (isQuoteAlreadyResponded(error)) {
        await queryClient.invalidateQueries({ queryKey: ['quotes', 'public', token] });
        return;
      }
      Alert.alert(
        'Could not send response',
        error instanceof Error ? error.message : 'Check the link and try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  if (snapshot.isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading shared quote" />
        <Text style={styles.loading}>Loading shared quote</Text>
      </SafeAreaView>
    );
  }

  if (snapshot.data === 'inactive') {
    return (
      <SafeAreaView style={styles.center}>
        <EmptyState
          icon={<Feather name="file-minus" size={34} color={palette.textSecondary} />}
          title="Link no longer active"
          description="This link is no longer active."
        />
      </SafeAreaView>
    );
  }

  if (snapshot.isError) {
    return (
      <SafeAreaView style={styles.center}>
        <EmptyState
          icon={<Feather name="file-minus" size={34} color={palette.textSecondary} />}
          title="Quote unavailable"
          description="The shared quote could not be loaded. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => snapshot.refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!ready || !quote) {
    return (
      <SafeAreaView style={styles.center}>
        <EmptyState
          icon={<Feather name="file-minus" size={34} color={palette.textSecondary} />}
          title="Quote not found"
          description="This quote link could not be found."
        />
      </SafeAreaView>
    );
  }

  const liveStatus = ready.status;
  const canRespond = liveStatus === 'sent' || liveStatus === 'viewed';
  const title = quoteKindLabel(kind);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={type.headline}>{title} {quote.quoteNumber}</Text>
        <Text style={styles.subtitle}>From {ready.businessProfile.name} · {quoteStatusLabel(liveStatus)} · valid until {ready.expiryDate}</Text>
        {ready.respondedByName ? (
          <Text style={styles.subtitle}>
            {quoteStatusLabel(liveStatus)} by {ready.respondedByName}
            {ready.responseNote ? `. ${ready.responseNote}` : ''}
          </Text>
        ) : null}
      </View>
      <WebView
        source={{ html }}
        style={styles.preview}
        originWhitelist={['*']}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        allowFileAccess={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        accessibilityLabel={`${title} ${quote.quoteNumber}`}
      />
      <View style={styles.actions}>
        {canRespond ? (
          <>
            <TextInput
              value={name}
              onChangeText={(value) => { setName(value); setNameError(null); }}
              placeholder="Your name"
              placeholderTextColor={palette.textTertiary}
              style={[styles.input, nameError ? styles.inputError : null]}
              accessibilityLabel="Your name"
            />
            {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor={palette.textTertiary}
              style={[styles.input, styles.note]}
              accessibilityLabel="Note"
              multiline
            />
            <ModernButton fullWidth loading={busy === 'accept'} disabled={busy !== null} onPress={() => respond('accept')}>Accept</ModernButton>
            <ModernButton fullWidth variant="secondary" loading={busy === 'decline'} disabled={busy !== null} onPress={() => respond('decline')}>Decline</ModernButton>
          </>
        ) : (
          <Text style={styles.outcome}>{outcomeCopy(liveStatus, ready.respondedByName)}</Text>
        )}
        <ModernButton
          fullWidth
          variant="outline"
          loading={busy === 'pdf'}
          disabled={busy !== null}
          onPress={async () => {
            setBusy('pdf');
            try {
              await downloadInvoicePDF(quoteToPreviewInvoice(quote), ready.businessProfile, template, {
                labels: quoteDocumentLabels(quote.kind),
                filePrefix: title,
              });
            } catch (error) {
              Alert.alert('Unable to save PDF', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setBusy(null);
            }
          }}
        >
          Download PDF
        </ModernButton>
      </View>
    </SafeAreaView>
  );
}

function outcomeCopy(status: string, name: string | null): string {
  if (status === 'accepted') return name ? `${name} accepted this quote.` : 'This quote has been accepted.';
  if (status === 'declined') return name ? `${name} declined this quote.` : 'This quote has been declined.';
  if (status === 'expired') return 'This quote has expired.';
  if (status === 'converted') return 'This quote has already been turned into an invoice.';
  return `This quote is ${status}.`;
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background, padding: space.screen },
  loading: { ...type.subhead, marginTop: space.md },
  header: { paddingHorizontal: space.screen, paddingVertical: space.md, backgroundColor: palette.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator },
  subtitle: { ...type.footnote, marginTop: 2 },
  preview: { flex: 1, backgroundColor: palette.surface },
  actions: { gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.md, backgroundColor: palette.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator },
  input: { ...type.body, minHeight: 48, borderRadius: 12, backgroundColor: palette.fill, paddingHorizontal: space.lg, color: palette.text },
  note: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
  inputError: { borderWidth: 1, borderColor: palette.danger },
  error: { ...type.footnote, color: palette.danger },
  outcome: { ...type.body },
});
