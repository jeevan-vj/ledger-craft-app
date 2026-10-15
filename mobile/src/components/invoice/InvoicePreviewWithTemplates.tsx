import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Dimensions,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { Invoice, BusinessProfile } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import TemplateSelector from './TemplateSelector';
import { getTemplateHTML } from '@/utils/invoiceTemplates';
import { shareInvoicePDF } from '@/utils/pdfUtils';
import { ProfileCompletenessBanner } from '@/components/invoice/ProfileCompletenessBanner';

interface InvoicePreviewWithTemplatesProps {
  invoice: Invoice;
  businessProfile?: BusinessProfile;
  initialTemplate?: InvoiceTemplateId;
  onClose?: () => void;
  onCompleteProfile?: () => void;
}

const { height: screenHeight } = Dimensions.get('window');

export default function InvoicePreviewWithTemplates({
  invoice,
  businessProfile,
  initialTemplate = 'classic',
  onClose,
  onCompleteProfile,
}: InvoicePreviewWithTemplatesProps) {
  const webViewRef = useRef<WebView>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplateId>(
    invoice.templateName as InvoiceTemplateId || initialTemplate
  );
  const [isLoadingWebView, setIsLoadingWebView] = useState(true);
  const [isSharingPDF, setIsSharingPDF] = useState(false);
  const [webViewError, setWebViewError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0); // Default 100% for proper readability
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  // Zoom control functions
  const zoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.1, 2.0));
  };

  const zoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.1, 0.8));
  };

  const resetZoom = () => {
    setZoomLevel(1.0);
  };

  // Generate zoom injection script
  const getZoomScript = (zoom: number) => `
    (function() {
      try {
        var viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
          viewport = document.createElement('meta');
          viewport.name = 'viewport';
          document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=${zoom}, maximum-scale=3.0, minimum-scale=0.8, user-scalable=yes';
        
        // Apply zoom to document root for better compatibility
        document.documentElement.style.zoom = '${zoom}';
        
        // Also apply to body
        if (document.body) {
          document.body.style.zoom = '${zoom}';
        }
      } catch (e) {
        console.error('Zoom script error:', e);
      }
    })();
    true;
  `;

  // Update zoom when level changes
  useEffect(() => {
    if (webViewRef.current && !isLoadingWebView) {
      webViewRef.current.injectJavaScript(getZoomScript(zoomLevel));
    }
  }, [zoomLevel]);

  const handleTemplateSelect = (templateId: InvoiceTemplateId) => {
    setSelectedTemplate(templateId);
    setIsLoadingWebView(true);
    setWebViewError(null);
    setHasAutoFitted(false); // Reset auto-fit for new template
  };

  // Calculate optimal zoom to fit content in screen
  const autoFitContent = () => {
    if (!webViewRef.current || hasAutoFitted) return;

    const autoFitScript = `
      (function() {
        try {
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          const contentWidth = document.body.scrollWidth;
          const contentHeight = document.body.scrollHeight;
          
          // For mobile, we want to fit the width perfectly
          const widthZoom = screenWidth / contentWidth;
          
          // Don't scale down too much for height
          const heightZoom = contentHeight > screenHeight 
            ? (screenHeight * 0.98) / contentHeight 
            : 1.0;
          
          // Use width-based zoom primarily, but cap if content is too tall
          let optimalZoom = Math.min(widthZoom, 1.2); // Allow slight zoom in up to 120%
          
          // If content is very tall, use height zoom instead
          if (heightZoom < optimalZoom) {
            optimalZoom = Math.max(heightZoom, 0.85);
          }
          
          // Clamp between 0.85 and 1.2 for good readability
          const finalZoom = Math.max(0.85, Math.min(optimalZoom, 1.2));
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'autoFitZoom',
            zoom: finalZoom,
            contentWidth: contentWidth,
            contentHeight: contentHeight,
            screenWidth: screenWidth,
            screenHeight: screenHeight
          }));
        } catch (e) {
          console.error('Auto-fit error:', e);
        }
      })();
      true;
    `;

    webViewRef.current.injectJavaScript(autoFitScript);
  };

  // Handle messages from WebView
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'autoFitZoom' && !hasAutoFitted) {
        console.log('Auto-fitting zoom:', data.zoom, 'Content:', data.contentWidth, 'x', data.contentHeight);
        setZoomLevel(data.zoom);
        setHasAutoFitted(true);
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  };

  const handleSharePDF = async () => {
    try {
      setIsSharingPDF(true);
      await shareInvoicePDF(invoice, businessProfile, selectedTemplate);
    } catch (error) {
      console.error('Error sharing PDF:', error);
      Alert.alert('Error', 'Failed to share PDF. Please try again.');
    } finally {
      setIsSharingPDF(false);
    }
  };

  const handleWebViewError = () => {
    setWebViewError('Failed to load preview');
    setIsLoadingWebView(false);
  };

  const handleRetry = () => {
    setWebViewError(null);
    setIsLoadingWebView(true);
  };

  const htmlContent = getTemplateHTML(selectedTemplate, invoice, businessProfile);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E2875" />
      {/* Dark Blue Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Invoice Preview</Text>
            <Text style={styles.headerSubtitle}>{invoice.invoiceNumber}</Text>
          </View>
          {onClose && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.sharePDFButton,
              isSharingPDF && styles.sharePDFButtonDisabled,
            ]}
            onPress={handleSharePDF}
            disabled={isSharingPDF}
            activeOpacity={0.8}
          >
            {isSharingPDF ? (
              <ActivityIndicator size="small" color="#1E2875" />
            ) : (
              <Text style={styles.sharePDFButtonText}>Share PDF</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <ProfileCompletenessBanner
          profile={businessProfile}
          onCompleteProfile={onCompleteProfile}
        />
      </View>

      {/* Template Selector */}
      <TemplateSelector
        selectedTemplate={selectedTemplate}
        onSelectTemplate={handleTemplateSelect}
      />

      {/* Preview */}
      <View style={styles.previewContainer}>
        {webViewError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>!</Text>
            <Text style={styles.errorText}>{webViewError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {isLoadingWebView && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#163300" />
                <Text style={styles.loadingText}>Loading preview...</Text>
              </View>
            )}
            <WebView
              ref={webViewRef}
              source={{ html: htmlContent }}
              style={styles.webView}
              onLoad={() => {
                setIsLoadingWebView(false);
                // Auto-fit content after ensuring rendering is complete
                setTimeout(() => autoFitContent(), 500);
              }}
              onError={handleWebViewError}
              onHttpError={handleWebViewError}
              onMessage={handleWebViewMessage}
              originWhitelist={['*']}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scalesPageToFit={true}
              showsVerticalScrollIndicator={true}
              showsHorizontalScrollIndicator={false}
              injectedJavaScript={getZoomScript(zoomLevel)}
            />
          </>
        )}
      </View>

      {/* Zoom Controls */}
      {!webViewError && !isLoadingWebView && (
        <View style={styles.zoomControls}>
          <TouchableOpacity
            onPress={zoomOut}
            style={[styles.zoomButton, zoomLevel <= 0.8 && styles.zoomButtonDisabled]}
            disabled={zoomLevel <= 0.8}
            activeOpacity={0.7}
          >
            <Text style={styles.zoomIcon}>−</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={resetZoom}
            style={[styles.zoomButton, styles.zoomButtonReset]}
            activeOpacity={0.7}
          >
            <Text style={styles.zoomPercentage}>{Math.round(zoomLevel * 100)}%</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={zoomIn}
            style={[styles.zoomButton, zoomLevel >= 2.0 && styles.zoomButtonDisabled]}
            disabled={zoomLevel >= 2.0}
            activeOpacity={0.7}
          >
            <Text style={styles.zoomIcon}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#1E2875',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sharePDFButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  sharePDFButtonDisabled: {
    opacity: 0.6,
  },
  sharePDFButtonText: {
    color: '#1E2875',
    fontSize: 15,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeButtonText: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#163300',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  zoomControls: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    flexDirection: 'column',
    gap: 12,
    zIndex: 20,
  },
  zoomButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(91, 114, 238, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  zoomButtonReset: {
    backgroundColor: 'rgba(100, 116, 139, 0.95)',
  },
  zoomButtonDisabled: {
    backgroundColor: 'rgba(203, 213, 225, 0.8)',
    opacity: 0.5,
  },
  zoomIcon: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  zoomPercentage: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

