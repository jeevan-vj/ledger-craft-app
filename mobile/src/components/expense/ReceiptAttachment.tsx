import React, { useState } from 'react';
import { View, Text, Modal, Image, Platform, StyleSheet } from 'react-native';
import { encode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch, rejectFailedResponse } from '@/features/auth/api/http';
import { ModernButton } from '@/components/ui/ModernButton';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { SafeAreaView } from 'react-native-safe-area-context';
export function ReceiptAttachment({ url }: { url: string }) {
 const { colors } = useTheme(); const [busy,setBusy] = useState(false); const [uri,setUri] = useState<string>(); const [error,setError] = useState('');
 async function open() {
  setBusy(true);setError('');
  try {
   // Private files must use the authenticated transport, never an external browser with no session.
   if (!url.startsWith('/api/objects?key=')) throw new Error('This older receipt link needs to be reattached before it can be opened securely.');
   const response=await apiFetch(url,{method:'GET'});if(!response.ok)await rejectFailedResponse(response);
   const type=response.headers.get('content-type')?.split(';')[0] ?? '';
   const bytes=await response.arrayBuffer();
   if (type.startsWith('image/')) {setUri(`data:${type};base64,${encode(bytes)}`);return;}
   if (type!=='application/pdf') throw new Error('This receipt file type cannot be previewed.');
   if(Platform.OS==='web') {const blobUri=URL.createObjectURL(new Blob([bytes],{type}));const anchor=document.createElement('a');anchor.href=blobUri;anchor.download='receipt.pdf';anchor.click();setTimeout(()=>URL.revokeObjectURL(blobUri),30_000);return;}
   if(!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))throw new Error('File sharing is unavailable on this device.');
   const file=`${FileSystem.cacheDirectory}receipt-${Date.now()}.pdf`;await FileSystem.writeAsStringAsync(file,encode(bytes),{encoding:FileSystem.EncodingType.Base64});await Sharing.shareAsync(file,{mimeType:type});
  }catch(caught){setError(caught instanceof Error?caught.message:'Receipt could not be opened.');}finally{setBusy(false);}
 }
 return <View style={styles.controls}><ModernButton variant="outline" loading={busy} onPress={()=>void open()}>Open attached receipt</ModernButton>{!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}<Modal visible={!!uri} animationType="slide" onRequestClose={()=>setUri(undefined)}><SafeAreaView style={[styles.preview,{backgroundColor:colors.background}]}>{uri&&<Image source={{uri}} accessibilityLabel="Attached receipt preview" resizeMode="contain" style={styles.image}/>}<ModernButton onPress={()=>setUri(undefined)}>Close receipt preview</ModernButton></SafeAreaView></Modal></View>;
}
const styles=StyleSheet.create({controls:{gap:space.sm},preview:{flex:1,padding:space.lg,gap:space.md},image:{flex:1,width:'100%'}});
