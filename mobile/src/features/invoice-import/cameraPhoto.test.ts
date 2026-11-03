import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { prepareCameraPhoto, CAMERA_UPLOAD_MAX_BYTES } from './cameraPhoto';

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;

const landscape = { uri: 'file:///camera.heic', fileName: 'invoice.heic', width: 4032, height: 3024 };

function jpegSave(compress: number) {
  return {
    base64: false,
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  };
}

describe('prepareCameraPhoto', () => {
  beforeEach(() => {
    getInfoAsync.mockReset();
    readAsStringAsync.mockReset();
  });

  it('recompresses as JPEG and reads base64 only after the file fits the upload ceiling', async () => {
    getInfoAsync
      .mockResolvedValueOnce({ exists: true, size: CAMERA_UPLOAD_MAX_BYTES + 20_000, uri: 'file:///first.jpg', isDirectory: false })
      .mockResolvedValueOnce({ exists: true, size: 120_000, uri: 'file:///second.jpg', isDirectory: false });
    readAsStringAsync.mockResolvedValue('c21hbGw=');
    const manipulate = jest.fn()
      .mockResolvedValueOnce({ uri: 'file:///first.jpg', width: 1800, height: 1350 })
      .mockResolvedValueOnce({ uri: 'file:///second.jpg', width: 1600, height: 1200 });

    const result = await prepareCameraPhoto(landscape, manipulate);

    expect(manipulate).toHaveBeenCalledTimes(2);
    expect(manipulate.mock.calls[0]?.[1]).toEqual([{ resize: { width: 1800 } }]);
    expect(manipulate.mock.calls[1]?.[1]).toEqual([{ resize: { width: 1600 } }]);
    expect(manipulate.mock.calls[0]?.[2]).toEqual(jpegSave(0.82));
    expect(manipulate.mock.calls[1]?.[2]).toEqual(jpegSave(0.72));
    expect(readAsStringAsync).toHaveBeenCalledTimes(1);
    expect(readAsStringAsync).toHaveBeenCalledWith('file:///second.jpg', { encoding: FileSystem.EncodingType.Base64 });
    expect(result).toMatchObject({
      uri: 'file:///second.jpg',
      filename: 'invoice.jpg',
      contentType: 'image/jpeg',
      contentBase64: 'c21hbGw=',
    });
    expect(result.sizeBytes).toBeLessThanOrEqual(CAMERA_UPLOAD_MAX_BYTES);
  });

  it('stops at the JPEG quality floor when every preset is still too large', async () => {
    getInfoAsync.mockResolvedValue({
      exists: true, size: CAMERA_UPLOAD_MAX_BYTES + 1, uri: 'file:///large.jpg', isDirectory: false,
    });
    const manipulate = jest.fn(async (_uri: string, _actions: unknown, _options: unknown) => ({
      uri: 'file:///large.jpg', width: 1200, height: 900,
    }));

    await expect(prepareCameraPhoto({ uri: 'file:///camera.jpg', width: 4032, height: 3024 }, manipulate))
      .rejects.toThrow('The photo is still too large');
    expect(manipulate).toHaveBeenCalledTimes(4);
    expect(manipulate.mock.calls.map((call) => call[2])).toEqual([
      jpegSave(0.82),
      jpegSave(0.72),
      jpegSave(0.62),
      jpegSave(0.52),
    ]);
    expect(readAsStringAsync).not.toHaveBeenCalled();
  });

  it('reports a missing camera file as a read error instead of a size error', async () => {
    getInfoAsync.mockResolvedValue({ exists: false, uri: 'file:///missing.jpg', isDirectory: false });
    const manipulate = jest.fn(async (_uri: string, _actions: unknown, _options: unknown) => ({
      uri: 'file:///missing.jpg', width: 800, height: 600,
    }));

    await expect(prepareCameraPhoto({ uri: 'file:///camera.jpg', width: 800, height: 1200 }, manipulate))
      .rejects.toThrow('could not be read');
    expect(manipulate).toHaveBeenCalledTimes(1);
    expect(manipulate.mock.calls[0]?.[2]).toEqual(jpegSave(0.82));
    expect(readAsStringAsync).not.toHaveBeenCalled();
  });

  it('does not read base64 when the compressed file reports no size', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 0, uri: 'file:///zero.jpg', isDirectory: false });
    const manipulate = jest.fn(async () => ({ uri: 'file:///zero.jpg', width: 800, height: 600 }));

    await expect(prepareCameraPhoto({ uri: 'file:///camera.jpg', width: 800, height: 600 }, manipulate))
      .rejects.toThrow('could not be read');
    expect(readAsStringAsync).not.toHaveBeenCalled();
  });

  it('reports an empty base64 read as a read error instead of a size error', async () => {
    getInfoAsync.mockResolvedValue({ exists: true, size: 100, uri: 'file:///empty.jpg', isDirectory: false });
    readAsStringAsync.mockResolvedValue('');
    const manipulate = jest.fn(async () => ({ uri: 'file:///empty.jpg', width: 800, height: 600 }));

    await expect(prepareCameraPhoto({ uri: 'file:///camera.jpg', width: 800, height: 600 }, manipulate))
      .rejects.toThrow('could not be read');
    expect(manipulate).toHaveBeenCalledTimes(1);
    expect(readAsStringAsync).toHaveBeenCalledTimes(1);
  });
});
