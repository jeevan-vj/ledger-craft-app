import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import { encode } from 'base64-arraybuffer';

type PickedDocument = {
  uri: string;
  base64?: string | null;
  file?: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
};

export async function readDocumentBase64(asset: PickedDocument, platform: string = Platform.OS): Promise<string> {
  if (platform === 'web') {
    if (asset.base64) return asset.base64;
    if (asset.file) return encode(await asset.file.arrayBuffer());
    throw new Error('The browser did not provide the selected file contents.');
  }
  return new ExpoFile(asset.uri).base64();
}
