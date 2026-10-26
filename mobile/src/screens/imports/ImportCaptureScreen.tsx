import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import type { InvoiceImportMimeType } from '@ledgercraft/contracts';
import { AppPressable, EmptyState, ModernButton } from '@/components/ui';
import { canImportInvoices } from '@/features/auth/invoiceAccess';
import { documentImportApi } from '@/features/invoice-import/api/documentImportApi';
import { OFFLINE_MESSAGE } from '@/features/auth/api/http';
import type { RootStackParamList } from '@/navigation/types';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { control, radius, space } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportCapture'>;
type SelectedSource = { uri: string; filename: string; contentType: InvoiceImportMimeType; contentBase64: string };

function contentType(name: string, declared?: string | null): InvoiceImportMimeType {
  const value = declared?.toLowerCase();
  if (value === 'application/pdf' || value === 'image/jpeg' || value === 'image/png' || value === 'image/webp' || value === 'image/heic' || value === 'image/heif') return value;
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return 'image/jpeg';
}

export default function ImportCaptureScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const allowed = useStore((state) => canImportInvoices(state.permissions));
  const [source, setSource] = useState<SelectedSource | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (selected: SelectedSource) => {
    setSource(selected); setStatus('uploading'); setProgress(0); setError(null);
    try {
      const created = await documentImportApi.upload({ filename: selected.filename, contentType: selected.contentType, contentBase64: selected.contentBase64 }, setProgress);
      const document = created.documents[0];
      setStatus('processing');
      await documentImportApi.extract(document.id);
      navigation.replace('ImportReview', { importId: document.id, filename: document.originalFilename, mimeType: document.mimeType, localUri: selected.uri });
    } catch (caught) {
      setStatus('failed');
      setError(caught instanceof Error ? caught.message : OFFLINE_MESSAGE);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access to photograph an invoice or bill.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) { setError('The photo could not be read. Try again.'); return; }
    await upload({ uri: asset.uri, filename: asset.fileName ?? `invoice-${Date.now()}.jpg`, contentType: contentType(asset.fileName ?? 'invoice.jpg', asset.mimeType), contentBase64: asset.base64 });
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const contentBase64 = await new File(asset.uri).base64();
      await upload({ uri: asset.uri, filename: asset.name, contentType: contentType(asset.name, asset.mimeType), contentBase64 });
    } catch {
      setStatus('failed'); setError('The selected file could not be read. Choose a PDF, JPG or PNG and try again.');
    }
  };

  if (!allowed) return <View style={styles.state}><EmptyState title="Import access restricted" description="You don't have permission to import invoices. Ask an owner or administrator for invoice import access." actionLabel="Go back" onAction={() => navigation.goBack()} /></View>;

  const busy = status === 'uploading' || status === 'processing';
  return <ScrollView style={styles.canvas} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={styles.heroIcon}><Feather name="file-plus" size={28} color={theme.colors.accentText} /></View>
    <Text style={styles.title}>Bring in an invoice or bill</Text>
    <Text style={styles.subtitle}>{route.params.entry === 'purchases' ? 'Start with a supplier document' : 'Start with a sales or supplier document'}. You will choose Sales or Purchase after extraction.</Text>

    {!busy ? <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Import source">
      <SourceChoice icon="camera" title="Take a photo" detail="Use your camera for a paper document" onPress={() => void takePhoto()} />
      <SourceChoice icon="upload" title="Choose a file" detail="PDF, JPG, PNG, WebP or HEIC" onPress={() => void chooseFile()} />
    </View> : <View style={styles.progressCard} accessibilityLiveRegion="polite">
      {source?.contentType.startsWith('image/') ? <Image source={{ uri: source.uri }} style={styles.thumb} accessibilityLabel={`Selected document ${source.filename}`} /> : <View style={styles.pdfThumb}><Feather name="file-text" size={30} color={theme.colors.accentText} /><Text style={styles.pdfLabel}>PDF</Text></View>}
      <View style={styles.progressCopy}><Text style={styles.progressTitle}>{status === 'uploading' ? 'Uploading securely' : 'Extracting and checking'}</Text><Text style={styles.progressText}>{source?.filename}</Text><View style={styles.track}><View style={[styles.fill, { width: status === 'processing' ? '100%' : `${Math.max(8, progress * 100)}%` }]} /></View></View>
      <ActivityIndicator color={theme.colors.accent} accessibilityLabel={status === 'uploading' ? 'Uploading document' : 'Processing document'} />
    </View>}

    {error ? <View style={styles.error} accessibilityRole="alert"><Text style={styles.errorTitle}>Upload failed</Text><Text style={styles.errorText}>{error === OFFLINE_MESSAGE ? OFFLINE_MESSAGE : error}</Text>{source ? <ModernButton fullWidth variant="secondary" onPress={() => void upload(source)}>Retry</ModernButton> : null}</View> : null}
    <Text style={styles.privacy}>The original stays linked to the draft for your records. Nothing is sent, paid, posted or journalled by this import.</Text>
  </ScrollView>;
}

function SourceChoice({ icon, title, detail, onPress }: { icon: 'camera' | 'upload'; title: string; detail: string; onPress: () => void }) {
  const theme = useTheme(); const styles = createStyles(theme);
  return <AppPressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} onPress={onPress} style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
    <View style={styles.choiceIcon}><Feather name={icon} size={23} color={theme.colors.accentText} /></View><View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceDetail}>{detail}</Text></View><Feather name="chevron-right" size={20} color={theme.colors.textTertiary} />
  </AppPressable>;
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.background }, content: { padding: space.screen, paddingBottom: 48, flexGrow: 1 }, state: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: space.screen },
  heroIcon: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: space.sm },
  title: { ...type.title, textAlign: 'center', marginTop: space.lg }, subtitle: { ...type.subhead, textAlign: 'center', lineHeight: 21, marginTop: space.sm, marginBottom: space.xxl }, choices: { gap: space.md },
  choice: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.group, backgroundColor: colors.surface }, pressed: { backgroundColor: colors.fillMuted },
  choiceIcon: { width: control.default, height: control.default, borderRadius: radius.pill, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' }, choiceCopy: { flex: 1 }, choiceTitle: { ...type.headline }, choiceDetail: { ...type.footnote, marginTop: 2 },
  progressCard: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.group, padding: space.lg }, thumb: { width: 64, height: 78, borderRadius: radius.sm, resizeMode: 'cover' }, pdfThumb: { width: 64, height: 78, borderRadius: radius.sm, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' }, pdfLabel: { ...type.caption, color: colors.accentText, marginTop: 2 },
  progressCopy: { flex: 1, minWidth: 0 }, progressTitle: { ...type.callout }, progressText: { ...type.footnote, marginTop: 2 }, track: { height: 6, backgroundColor: colors.fill, borderRadius: radius.pill, marginTop: space.md, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: colors.accent, borderRadius: radius.pill },
  error: { marginTop: space.lg, padding: space.lg, borderRadius: radius.group, backgroundColor: colors.dangerFill, gap: space.sm }, errorTitle: { ...type.headline, color: colors.danger }, errorText: { ...type.footnote, color: colors.danger, marginBottom: space.sm }, privacy: { ...type.footnote, textAlign: 'center', marginTop: 'auto', paddingTop: space.xxl, lineHeight: 18 },
});
