import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReceiptScanner } from './ReceiptScanner';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { objectsApi } from '@/features/storage/api/objectsApi';
import { scanReceiptImage } from '@/features/ai/api/receiptScanApi';
jest.mock('expo-image-picker',()=>({requestCameraPermissionsAsync:async()=>({status:'granted'}),requestMediaLibraryPermissionsAsync:async()=>({status:'granted'}),launchCameraAsync:async()=>({canceled:false,assets:[{uri:'file://receipt.jpg',width:900,height:1200}]}),launchImageLibraryAsync:async()=>({canceled:false,assets:[{uri:'file://receipt.jpg',width:900,height:1200}]})}));
jest.mock('@/features/invoice-import/cameraPhoto',()=>({prepareCameraPhoto:async()=>({uri:'file://prepared.jpg',filename:'receipt.jpg',contentType:'image/jpeg',contentBase64:'abc'})}));
jest.mock('@/services/capabilitiesService',()=>({getServerCapabilities:jest.fn()}));
jest.mock('@/features/storage/api/objectsApi',()=>({objectsApi:{upload:jest.fn()}}));
jest.mock('@/features/ai/api/receiptScanApi',()=>({aiApiEnabled:()=>true,scanReceiptImage:jest.fn()}));
describe('mobile receipt capture',()=>{
 beforeEach(()=>{jest.clearAllMocks();jest.mocked(objectsApi.upload).mockResolvedValue({url:'/api/objects?key=receipt'} as never);jest.mocked(getServerCapabilities).mockResolvedValue({ai:'unavailable'} as never)});
 it('captures and uploads while unavailable, offers manual entry, and preserves the same attachment',async()=>{
  const complete=jest.fn();const screen=render(<ReceiptScanner visible onClose={jest.fn()} onScanComplete={complete}/>);
  expect(screen.getByText('Capture receipt')).toBeTruthy();fireEvent.press(screen.getByText('Take photo'));
  await waitFor(()=>expect(screen.getByText('Enter manually with receipt')).toBeTruthy());expect(scanReceiptImage).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Enter manually with receipt'));
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({total:null,tax:null}),'/api/objects?key=receipt');
 });
 it('auto-scans when available and keeps an uploaded receipt after failure for retry or manual entry',async()=>{
  jest.mocked(getServerCapabilities).mockResolvedValue({ai:'available'} as never);jest.mocked(scanReceiptImage).mockRejectedValueOnce(Error('Unreadable'));
  const screen=render(<ReceiptScanner visible onClose={jest.fn()} onScanComplete={jest.fn()}/>);fireEvent.press(screen.getByText('Take photo'));
  await waitFor(()=>expect(screen.getByText("Couldn't read this receipt. Retry or enter the details manually.")).toBeTruthy());expect(objectsApi.upload).toHaveBeenCalledTimes(1);expect(screen.getByText('Enter manually with receipt')).toBeTruthy();
 });
});
