import { ReceiptAttachment } from './ReceiptAttachment';
import React, { useRef, useState } from 'react';
import { View, Text, Modal, Image, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ModernButton } from '@/components/ui/ModernButton';
import { useTheme } from '@/theme';
import { space, radius } from '@/theme/tokens';
import { prepareReceiptPhoto } from '@/features/expenses/prepareReceiptPhoto';
import { objectsApi } from '@/features/storage/api/objectsApi';
import { scanReceiptImage } from '@/features/ai/api/receiptScanApi';
import { getServerCapabilities } from '@/services/capabilitiesService';
import type { ReceiptScanResult } from '@/types/receipt';
const manual: ReceiptScanResult = { merchantName: null, date: null, total: null, tax: null, subtotal: null, items: [], paymentMethod: null, suggestedCategory: null, confidence: 0, notes: null };
type Prepared = Awaited<ReturnType<typeof prepareReceiptPhoto>>;
export function ReceiptScanner({ visible, onScanComplete, onClose }: { visible: boolean; onScanComplete: (result: ReceiptScanResult, receiptUrl?: string) => void; onClose: () => void }) {
 const { colors } = useTheme(); const [photo, setPhoto] = useState<Prepared>(); const [receiptUrl, setReceiptUrl] = useState<string>(); const [receiptHash, setReceiptHash] = useState<string>(); const [proposal, setProposal] = useState<ReceiptScanResult>(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [failed, setFailed] = useState(false); const lock = useRef(false); const generation = useRef(0);
 function close() { generation.current += 1; setPhoto(undefined); setReceiptUrl(undefined); setReceiptHash(undefined); setProposal(undefined); setMessage(''); setFailed(false); setBusy(false); lock.current = false; onClose(); }
 async function process(prepared: Prepared, uploaded?: string) {
  const current = generation.current; setFailed(false); setMessage('Uploading receipt…');
  try {
   let url = uploaded;
   if (!url) { const stored = await objectsApi.upload({ kind: 'receipt', filename: prepared.filename, contentType: prepared.contentType, contentBase64: prepared.contentBase64 }); url = stored.url; if (current === generation.current) setReceiptHash(stored.sha256); }
   if (current !== generation.current) return; setReceiptUrl(url);
   const capabilities = await getServerCapabilities(); if (current !== generation.current) return;
   if (capabilities.ai !== 'available') { setMessage('Automatic scanning is unavailable. Enter the details manually with this receipt attached.'); return; }
   setMessage('Reading receipt…'); const result = await scanReceiptImage(prepared.contentBase64, prepared.contentType);
   if (current !== generation.current) return; setProposal(result); setMessage('Review every suggested amount and GST treatment before saving the expense.');
  } catch { if (current === generation.current) { setFailed(true); setMessage("Couldn't read this receipt. Retry or enter the details manually."); } }
 }
 async function pick(camera: boolean) {
  if (lock.current) return; lock.current = true; setBusy(true); setFailed(false); setMessage(''); setProposal(undefined); setReceiptUrl(undefined);
  const current = ++generation.current;
  try {
   const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
   if (permission.status !== 'granted') { setMessage('Allow camera or photo-library access in device settings, or enter the expense manually.'); return; }
   const result = camera ? await ImagePicker.launchCameraAsync({ quality: 0.82, allowsEditing: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82, allowsEditing: false });
   if (result.canceled || !result.assets[0] || current !== generation.current) return;
   const prepared = await prepareReceiptPhoto(result.assets[0]); if (current !== generation.current) return; setPhoto(prepared); await process(prepared);
  } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Photo could not be prepared. Try again.'); }
  finally { if (current === generation.current) { lock.current = false; setBusy(false); } }
 }
 async function retry() { if (!photo || lock.current) return; lock.current = true; setBusy(true); try { await process(photo, receiptUrl); } finally { setBusy(false); lock.current = false; } }
 function accept(result: ReceiptScanResult) { if (!receiptUrl || busy) return; onScanComplete({...result, ...(receiptHash ? {receiptHash} : {})}, receiptUrl); close(); }
 if (!visible) return null;
 return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}><ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>Capture receipt</Text>
  <Text style={{ color: colors.textSecondary }}>Take a photo or choose an image. It is attached first; automatic scanning suggests editable details when available. Nothing saves an expense until you review and save.</Text>
  <ModernButton disabled={busy} onPress={() => void pick(true)}>Take photo</ModernButton><ModernButton disabled={busy} variant="outline" onPress={() => void pick(false)}>Choose photo</ModernButton>
  {photo && <Image source={{ uri: photo.uri }} accessibilityLabel="Selected receipt" style={styles.image} resizeMode="contain" />}
  {busy && <ActivityIndicator accessibilityLabel="Processing receipt" color={colors.accent} />}
  {!!message && <Text accessibilityRole={failed ? 'alert' : undefined} style={{ color: failed ? colors.danger : colors.textSecondary }}>{message}</Text>}
  {receiptUrl && <ReceiptAttachment url={receiptUrl}/>}
  {proposal && <View style={[styles.result, { backgroundColor: colors.surface }]}><Text style={{ color: colors.text, fontWeight: '700' }}>{proposal.merchantName || 'Merchant needs review'}</Text><Text style={{ color: colors.text }}>Total: {proposal.total ?? 'Not read'} · GST: {proposal.tax ?? 'Not read'}</Text><Text style={{ color: colors.textSecondary }}>{proposal.date || 'Date needs review'} · {proposal.confidence}% confidence</Text>{proposal.provider === 'workers-ai' && <Text style={{ color: colors.warning }}>Workers AI suggestion: check carefully.</Text>}</View>}
  {failed && photo && <ModernButton disabled={busy} variant="outline" onPress={() => void retry()}>Retry reading receipt</ModernButton>}
  {proposal && receiptUrl && <ModernButton disabled={busy} onPress={() => accept(proposal)}>Review suggested details</ModernButton>}
  {receiptUrl && <ModernButton disabled={busy} variant="outline" onPress={() => accept(manual)}>Enter manually with receipt</ModernButton>}
  <ModernButton variant="ghost" onPress={close}>Close receipt capture</ModernButton>
 </ScrollView></Modal>;
}
const styles = StyleSheet.create({ content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md }, image: { height: 240, width: '100%', borderRadius: radius.lg }, result: { padding: space.md, gap: space.sm, borderRadius: radius.lg } });
