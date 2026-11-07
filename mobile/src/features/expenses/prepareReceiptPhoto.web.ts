import * as ImageManipulator from 'expo-image-manipulator';
import { CAMERA_UPLOAD_MAX_BYTES, CAMERA_CAPTURE_QUALITY } from '@/features/invoice-import/cameraPhoto';
/** Expo web has no native filesystem; use the manipulator's bounded JPEG result. */
export async function prepareReceiptPhoto(asset: {uri:string;width:number;height:number;fileName?:string|null}) {
 for(const [maxDimension,compress] of [[1800,CAMERA_CAPTURE_QUALITY],[1600,0.72],[1400,0.62],[1200,0.52]] as const) {
  const resize=asset.width>=asset.height?{width:Math.min(asset.width,maxDimension)}:{height:Math.min(asset.height,maxDimension)};
  const result=await ImageManipulator.manipulateAsync(asset.uri,[{resize}],{base64:true,compress,format:ImageManipulator.SaveFormat.JPEG});
  const contentBase64=result.base64; if(!contentBase64)throw new Error('The photo could not be read. Choose another receipt image.');
  const padding=contentBase64.endsWith('==')?2:contentBase64.endsWith('=')?1:0;const sizeBytes=Math.floor(contentBase64.length*3/4)-padding;
  if(sizeBytes<=CAMERA_UPLOAD_MAX_BYTES)return{uri:result.uri,filename:`${asset.fileName?.replace(/\.[^.]+$/,'')||'receipt'}.jpg`,contentType:'image/jpeg' as const,contentBase64,sizeBytes};
 }
 throw new Error('The receipt photo is still too large. Choose a smaller image and try again.');
}
