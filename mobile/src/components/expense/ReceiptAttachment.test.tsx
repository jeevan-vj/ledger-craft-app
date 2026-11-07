import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReceiptAttachment } from './ReceiptAttachment';
import { apiFetch } from '@/features/auth/api/http';
jest.mock('@/features/auth/api/http',()=>({apiFetch:jest.fn(),rejectFailedResponse:jest.fn()}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',writeAsStringAsync:jest.fn(),EncodingType:{Base64:'base64'}}));
jest.mock('expo-sharing',()=>({isAvailableAsync:async()=>true,shareAsync:jest.fn()}));
describe('private receipt attachment',()=>{
 it('downloads with authenticated API transport before showing the receipt, retaining no public credential URL',async()=>{
  jest.mocked(apiFetch).mockResolvedValue({ok:true,headers:{get:()=> 'image/png'},arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer} as never);
  const screen=render(<ReceiptAttachment url="/api/objects?key=receipt"/>);fireEvent.press(screen.getByText('Open attached receipt'));
  await waitFor(()=>expect(screen.getByLabelText('Attached receipt preview')).toBeTruthy());expect(apiFetch).toHaveBeenCalledWith('/api/objects?key=receipt',{method:'GET'});
 });
});
