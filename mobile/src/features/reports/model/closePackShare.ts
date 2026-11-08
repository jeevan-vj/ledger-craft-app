import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { encode } from 'base64-arraybuffer';
import { isShareSheetDismissal } from '@/utils/shareSheet';
import { fetchClosePack } from './closePackDownload';
export async function shareClosePack(from: string, to: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable.');
  const file = await fetchClosePack(from, to); const uri = `${FileSystem.cacheDirectory}${file.filename}`;
  await FileSystem.writeAsStringAsync(uri, encode(file.bytes), { encoding: FileSystem.EncodingType.Base64 });
  try { await Sharing.shareAsync(uri, { mimeType: 'application/zip', UTI: 'com.pkware.zip-archive', dialogTitle: 'Accountant close pack' }); }
  catch (error) { if (!isShareSheetDismissal(error)) throw error; }
}
