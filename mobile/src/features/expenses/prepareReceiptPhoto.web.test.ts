import { prepareReceiptPhoto } from './prepareReceiptPhoto.web';
import * as ImageManipulator from 'expo-image-manipulator';
jest.mock('expo-image-manipulator',()=>({manipulateAsync:jest.fn(),SaveFormat:{JPEG:'jpeg'}}));
jest.mock('@/features/invoice-import/cameraPhoto',()=>({CAMERA_UPLOAD_MAX_BYTES:950000,CAMERA_CAPTURE_QUALITY:0.82}));
describe('Expo web receipt photo preparation',()=>{
 it('uses bounded JPEG base64 directly without unavailable native filesystem methods',async()=>{
  jest.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({uri:'blob:prepared',width:100,height:200,base64:'YWJj'});
  const result=await prepareReceiptPhoto({uri:'blob:photo',width:100,height:200,fileName:'source.png'});
  expect(result).toMatchObject({uri:'blob:prepared',filename:'source.jpg',contentType:'image/jpeg',contentBase64:'YWJj',sizeBytes:3});
 });
 it('refuses a prepared photo that remains over the existing private file limit',async()=>{
  jest.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({uri:'blob:large',width:100,height:200,base64:'a'.repeat(1_300_000)});
  await expect(prepareReceiptPhoto({uri:'blob:photo',width:100,height:200})).rejects.toThrow('too large');
 });
});
