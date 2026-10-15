import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useReceiptScanning } from '@/hooks/useReceiptScanning';
import { ReceiptScanResult } from '@/types/receipt';
import { ModernButton } from '@/components/ui/ModernButton';

interface ReceiptScannerProps {
  visible: boolean;
  onScanComplete: (result: ReceiptScanResult, receiptUrl?: string) => void;
  onClose: () => void;
}

export function ReceiptScanner({ visible, onScanComplete, onClose }: ReceiptScannerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null);
  
  const {
    isScanning,
    isUploading,
    scanResult,
    error,
    isAvailable,
    scanReceipt,
    uploadReceipt,
    clearResult,
    clearError,
  } = useReceiptScanning();

  const requestPermissions = async (type: 'camera' | 'library'): Promise<boolean> => {
    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera permissions to take a photo of your receipt.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant photo library permissions to select a receipt image.',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  };

  const pickImageFromGallery = async () => {
    const hasPermission = await requestPermissions('library');
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        clearResult();
        clearError();
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions('camera');
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        clearResult();
        clearError();
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const showImagePickerOptions = () => {
    Alert.alert('Select Receipt', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Gallery', onPress: pickImageFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleScan = async () => {
    if (!selectedImage) return;
    
    clearError();
    
    try {
      // First, scan the receipt with AI
      await scanReceipt(selectedImage);
      
      // If scanning was successful, upload the receipt to storage
      if (!error && scanResult) {
        console.log('Scanning successful, starting upload...');
        try {
          const uploadResult = await uploadReceipt(selectedImage);
          if (uploadResult) {
            setUploadedReceiptUrl(uploadResult);
            console.log('Receipt uploaded successfully to:', uploadResult);
          } else {
            console.warn('Receipt upload failed but scan was successful');
          }
        } catch (uploadError) {
          console.error('Receipt upload failed:', uploadError);
          // Continue - scan was successful even if upload failed
        }
      }
    } catch (scanError) {
      console.error('Scanning failed:', scanError);
    }
  };

  const handleAcceptResult = () => {
    if (scanResult) {
      console.log('Accepting scan result:', scanResult);
      console.log('With receipt URL:', uploadedReceiptUrl);
      onScanComplete(scanResult, uploadedReceiptUrl || undefined);
      handleClose();
    }
  };

  const handleRetry = () => {
    clearResult();
    clearError();
    setSelectedImage(null);
    setUploadedReceiptUrl(null);
  };

  const handleClose = () => {
    clearResult();
    clearError();
    setSelectedImage(null);
    setUploadedReceiptUrl(null);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {!isAvailable && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                Receipt scanning is not available. Please configure your OpenAI API key.
              </Text>
            </View>
          )}

          {!selectedImage && (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderIcon}>Receipt</Text>
              <Text style={styles.placeholderText}>Select a receipt image to scan</Text>
              <ModernButton
                onPress={showImagePickerOptions}
                variant="primary"
                style={styles.selectButton}
              >
                Select Image
              </ModernButton>
            </View>
          )}

          {selectedImage && !scanResult && (
            <View style={styles.previewContainer}>
              <Image source={{ uri: selectedImage }} style={styles.previewImage} />
              
              <View style={styles.actionContainer}>
                <ModernButton
                  onPress={showImagePickerOptions}
                  variant="outline"
                  style={styles.actionButton}
                >
                  Change Image
                </ModernButton>
                <ModernButton
                  onPress={handleScan}
                  loading={isScanning}
                  variant="primary"
                  style={styles.actionButton}
                  disabled={!isAvailable}
                >
                  {isScanning ? 'Scanning...' : 'Scan Receipt'}
                </ModernButton>
              </View>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <ModernButton
                onPress={handleRetry}
                variant="outline"
                style={styles.retryButton}
              >
                Try Again
              </ModernButton>
            </View>
          )}

          {isScanning && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#163300" />
              <Text style={styles.loadingText}>Analyzing receipt with AI...</Text>
            </View>
          )}

          {scanResult && (
            <View style={styles.resultContainer}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultHeaderText}>Scan complete</Text>
                <Text style={styles.confidenceText}>
                  Confidence: {scanResult.confidence}%
                </Text>
              </View>

              <View style={styles.resultCard}>
                {scanResult.merchantName && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Merchant:</Text>
                    <Text style={styles.resultValue}>{scanResult.merchantName}</Text>
                  </View>
                )}
                
                {scanResult.date && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Date:</Text>
                    <Text style={styles.resultValue}>{scanResult.date}</Text>
                  </View>
                )}
                
                {scanResult.total !== null && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Total:</Text>
                    <Text style={styles.resultValue}>${scanResult.total.toFixed(2)}</Text>
                  </View>
                )}
                
                {scanResult.tax !== null && scanResult.tax > 0 && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Tax:</Text>
                    <Text style={styles.resultValue}>${scanResult.tax.toFixed(2)}</Text>
                  </View>
                )}
                
                {scanResult.paymentMethod && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Payment:</Text>
                    <Text style={styles.resultValue}>
                      {scanResult.paymentMethod.charAt(0).toUpperCase() + scanResult.paymentMethod.slice(1)}
                    </Text>
                  </View>
                )}
                
                {scanResult.suggestedCategory && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Category:</Text>
                    <Text style={styles.resultValue}>{scanResult.suggestedCategory}</Text>
                  </View>
                )}
              </View>

              {isUploading && (
                <View style={styles.uploadingContainer}>
                  <ActivityIndicator size="small" color="#163300" />
                  <Text style={styles.uploadingText}>Uploading receipt...</Text>
                </View>
              )}

              <View style={styles.actionContainer}>
                <ModernButton
                  onPress={handleRetry}
                  variant="outline"
                  style={styles.actionButton}
                >
                  Scan Again
                </ModernButton>
                <ModernButton
                  onPress={handleAcceptResult}
                  variant="primary"
                  style={styles.actionButton}
                  disabled={isUploading}
                >
                  Use This Data
                </ModernButton>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 24,
    backgroundColor: '#1E2875',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  warningContainer: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningText: {
    color: '#92400E',
    fontSize: 14,
  },
  placeholderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 24,
    textAlign: 'center',
  },
  selectButton: {
    minWidth: 200,
  },
  previewContainer: {
    marginBottom: 24,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
    resizeMode: 'contain',
    backgroundColor: '#FFFFFF',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: 'flex-start',
  },
  resultContainer: {
    marginTop: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  confidenceText: {
    fontSize: 14,
    color: '#64748B',
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  resultValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  uploadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#64748B',
  },
});

