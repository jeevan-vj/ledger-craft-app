import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { documentImportApi } from '@/features/invoice-import/api/documentImportApi';
import { prepareCameraPhoto } from '@/features/invoice-import/cameraPhoto';
import { readDocumentBase64 } from '@/features/invoice-import/sourceFile';
import type { RootStackParamList } from '@/navigation/types';
import { useStore } from '@/store';
import ImportCaptureScreen from './ImportCaptureScreen';

jest.mock('@/features/invoice-import/api/documentImportApi', () => ({
  documentImportApi: { upload: jest.fn(), extract: jest.fn() },
}));

jest.mock('@/features/invoice-import/cameraPhoto', () => ({
  ...jest.requireActual('@/features/invoice-import/cameraPhoto'),
  prepareCameraPhoto: jest.fn(),
}));

jest.mock('@/features/invoice-import/sourceFile', () => ({
  readDocumentBase64: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'ImportCapture'>;

const upload = documentImportApi.upload as jest.Mock;
const extract = documentImportApi.extract as jest.Mock;
const prepare = prepareCameraPhoto as jest.Mock;
const readFile = readDocumentBase64 as jest.Mock;
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;

function renderScreen() {
  const navigation = { replace: jest.fn(), goBack: jest.fn() } as unknown as Props['navigation'];
  const route = { key: 'import', name: 'ImportCapture', params: { entry: 'invoices' } } as Props['route'];
  const screen = render(<ImportCaptureScreen navigation={navigation} route={route} />);
  return { ...screen, navigation };
}

async function selectPreviousFile() {
  pickDocument.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///old.pdf', name: 'old.pdf', mimeType: 'application/pdf' }],
  });
  readFile.mockResolvedValueOnce('b2xkcGRm');
  upload.mockRejectedValueOnce(new Error('The previous file failed to upload'));
}

describe('ImportCaptureScreen', () => {
  beforeEach(() => {
    upload.mockReset();
    extract.mockReset();
    prepare.mockReset();
    readFile.mockReset();
    pickDocument.mockReset();
    launchCamera.mockReset();
    useStore.setState({ permissions: ['invoices.import'] });
    launchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///new.jpg', width: 1600, height: 1200, fileName: 'new.jpg' }],
    });
  });

  it('shows import choices before a document is selected', () => {
    const screen = renderScreen();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('shows upload progress while a prepared photo is still uploading', async () => {
    prepare.mockResolvedValue({
      uri: 'file:///new.jpg', filename: 'new.jpg', contentType: 'image/jpeg', contentBase64: 'bmV3', sizeBytes: 3,
    });
    upload.mockReturnValue(new Promise(() => undefined));
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    expect(await screen.findByText('Uploading securely')).toBeTruthy();
    expect(screen.getByText('new.jpg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose a file' })).toBeNull();
  });

  it('opens review after a prepared photo uploads and extracts', async () => {
    prepare.mockResolvedValue({
      uri: 'file:///new.jpg', filename: 'new.jpg', contentType: 'image/jpeg', contentBase64: 'bmV3', sizeBytes: 3,
    });
    upload.mockResolvedValue({
      documents: [{ id: 'doc-1', originalFilename: 'new.jpg', mimeType: 'image/jpeg' }],
    });
    extract.mockResolvedValue({});
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledWith('ImportReview', {
      importId: 'doc-1', filename: 'new.jpg', mimeType: 'image/jpeg', localUri: 'file:///new.jpg',
    }));
    expect(extract).toHaveBeenCalledWith('doc-1');
  });

  it('hides import choices while a camera photo is being prepared', async () => {
    prepare.mockReturnValue(new Promise(() => undefined));
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    expect(await screen.findByText('Preparing photo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose a file' })).toBeNull();
  });

  it('clears the previously selected file when camera preparation fails', async () => {
    await selectPreviousFile();
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
    expect(await screen.findByText('Retry')).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toMatchObject({ filename: 'old.pdf' });

    prepare.mockRejectedValue(new Error('The photo is still too large after resizing. Move closer to the document and try again.'));
    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    expect(await screen.findByText(/still too large/i)).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('The previous file failed to upload')).toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(launchCamera).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.82 });
  });

  it('keeps the previously selected file when the camera is dismissed', async () => {
    await selectPreviousFile();
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
    expect(await screen.findByText('Retry')).toBeTruthy();

    launchCamera.mockResolvedValue({ canceled: true, assets: [] });
    fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    await waitFor(() => expect(launchCamera).toHaveBeenCalled());
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(prepare).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('clears the previously selected file when the next chosen file cannot be read', async () => {
    await selectPreviousFile();
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));
    expect(await screen.findByText('Retry')).toBeTruthy();

    pickDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///next.pdf', name: 'next.pdf', mimeType: 'application/pdf' }],
    });
    readFile.mockRejectedValueOnce(new Error('unreadable'));
    fireEvent.press(screen.getByRole('button', { name: 'Choose a file' }));

    expect(await screen.findByText(/could not be read/i)).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
