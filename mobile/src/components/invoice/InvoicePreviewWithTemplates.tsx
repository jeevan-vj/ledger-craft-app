import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { generateInvoiceHTML } from '@/utils/invoiceTemplates';
import { shareInvoicePDF } from '@/utils/pdfUtils';
import { control, radius, space } from '@/theme/tokens';
import TemplateSelector from './TemplateSelector';
import { ProfileCompletenessBanner } from './ProfileCompletenessBanner';
import { AppPressable } from '@/components/ui/AppPressable';
import { useTheme } from '@/theme';

interface InvoicePreviewWithTemplatesProps {
  invoice: Invoice;
  businessProfile?: BusinessProfile;
  initialTemplate?: InvoiceTemplateId;
  onClose?: () => void;
  onCompleteProfile?: () => void;
}

export default function InvoicePreviewWithTemplates({
  invoice,
  businessProfile,
  initialTemplate = 'classic',
  onClose,
  onCompleteProfile,
}: InvoicePreviewWithTemplatesProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplateId>(
    (invoice.templateName as InvoiceTemplateId | undefined) ?? initialTemplate,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const html = useMemo(
    () => generateInvoiceHTML(invoice, businessProfile, selectedTemplate),
    [businessProfile, invoice, selectedTemplate],
  );

  const selectTemplate = (templateId: InvoiceTemplateId) => {
    setSelectedTemplate(templateId);
    setError(null);
    setIsLoading(true);
  };

  const showWebViewError = (event: WebViewErrorEvent | WebViewHttpErrorEvent) => {
    const description = 'description' in event.nativeEvent ? event.nativeEvent.description : undefined;
    setError(description || 'The invoice preview could not be loaded.');
    setIsLoading(false);
  };

  const retry = () => {
    setError(null);
    setIsLoading(true);
    setReloadKey((value) => value + 1);
  };

  const sharePDF = async () => {
    try {
      setIsSharing(true);
      await shareInvoicePDF(invoice, businessProfile, selectedTemplate);
    } catch (shareError) {
      Alert.alert(
        'Unable to share PDF',
        shareError instanceof Error ? shareError.message : 'Please try again.',
      );
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, space.md) }]}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>Invoice preview</Text>
          <Text style={styles.subtitle}>{invoice.invoiceNumber}</Text>
        </View>
        <View style={styles.headerActions}>
          <AppPressable
            onPress={sharePDF}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel={`Share invoice ${invoice.invoiceNumber} as PDF`}
            accessibilityState={{ busy: isSharing, disabled: isSharing }}
            style={({ pressed }) => [
              styles.headerButton,
              styles.shareButton,
              pressed && styles.pressed,
              isSharing && styles.disabled,
            ]}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={palette.accentForeground} />
            ) : (
              <>
                <Feather name="share" size={17} color={palette.accentForeground} />
                <Text style={styles.shareLabel}>Share</Text>
              </>
            )}
          </AppPressable>
          {onClose ? (
            <AppPressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close invoice preview"
              hitSlop={8}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Feather name="x" size={22} color={palette.text} />
            </AppPressable>
          ) : null}
        </View>
      </View>

      <View style={styles.profileBanner}>
        <ProfileCompletenessBanner
          profile={businessProfile}
          onCompleteProfile={onCompleteProfile}
        />
      </View>

      <TemplateSelector selectedTemplate={selectedTemplate} onSelectTemplate={selectTemplate} />

      <View style={styles.previewContainer}>
        {error ? (
          <View style={styles.stateContainer} accessibilityLiveRegion="assertive">
            <Feather name="alert-circle" size={36} color={palette.danger} />
            <Text selectable style={styles.stateTitle}>Preview unavailable</Text>
            <Text selectable style={styles.stateMessage}>{error}</Text>
            <AppPressable
              onPress={retry}
              accessibilityRole="button"
              accessibilityLabel="Retry loading invoice preview"
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </AppPressable>
          </View>
        ) : (
          <>
            <WebView
              key={`${selectedTemplate}-${reloadKey}`}
              source={{ html }}
              style={styles.webView}
              originWhitelist={['*']}
              javaScriptEnabled={false}
              domStorageEnabled={false}
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onError={showWebViewError}
              onHttpError={showWebViewError}
              scalesPageToFit
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator
              setSupportMultipleWindows={false}
              accessibilityLabel={`${selectedTemplate} template preview for invoice ${invoice.invoiceNumber}`}
            />
            {isLoading ? (
              <View
                style={styles.loadingOverlay}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading invoice preview"
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator size="large" color={palette.accent} />
                <Text style={styles.loadingText}>Loading preview</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    minHeight: 76,
    paddingHorizontal: space.screen,
    paddingBottom: space.md,
    backgroundColor: palette.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  titleGroup: {
    flex: 1,
    paddingRight: space.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: palette.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerButton: {
    minWidth: control.touchTarget,
    minHeight: control.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.md,
  },
  shareButton: {
    backgroundColor: palette.accent,
  },
  shareLabel: {
    color: palette.accentForeground,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.5,
  },
  profileBanner: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  previewContainer: {
    flex: 1,
    margin: space.md,
    marginTop: space.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.separator,
  },
  webView: {
    flex: 1,
    backgroundColor: palette.surface,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    gap: space.md,
  },
  loadingText: {
    color: palette.textSecondary,
    fontSize: 15,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
  },
  stateTitle: {
    marginTop: space.md,
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
  },
  stateMessage: {
    marginTop: space.sm,
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: space.xl,
    minHeight: 48,
    minWidth: 132,
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  retryLabel: {
    color: palette.accentForeground,
    fontSize: 16,
    fontWeight: '600',
  },
});
