import { prepareCameraPhoto, CAMERA_UPLOAD_MAX_BYTES } from './cameraPhoto';

function base64ForBytes(bytes: number): string {
  return 'A'.repeat(Math.ceil(bytes / 3) * 4);
}

describe('prepareCameraPhoto', () => {
  it('resizes and recompresses a camera capture until it fits private storage', async () => {
    const manipulate = jest.fn()
      .mockResolvedValueOnce({ uri: 'file:///first.jpg', width: 1800, height: 1350, base64: base64ForBytes(CAMERA_UPLOAD_MAX_BYTES + 20_000) })
      .mockResolvedValueOnce({ uri: 'file:///second.jpg', width: 1600, height: 1200, base64: base64ForBytes(CAMERA_UPLOAD_MAX_BYTES - 20_000) });

    const result = await prepareCameraPhoto({
      uri: 'file:///camera.heic', fileName: 'invoice.heic', width: 4032, height: 3024,
    }, manipulate);

    expect(manipulate).toHaveBeenCalledTimes(2);
    expect(manipulate.mock.calls[0]?.[1]).toEqual([{ resize: { width: 1800 } }]);
    expect(manipulate.mock.calls[1]?.[1]).toEqual([{ resize: { width: 1600 } }]);
    expect(result).toMatchObject({
      uri: 'file:///second.jpg', filename: 'invoice.jpg', contentType: 'image/jpeg',
    });
    expect(result.sizeBytes).toBeLessThanOrEqual(CAMERA_UPLOAD_MAX_BYTES);
  });

  it('reports a useful error if every legible camera preset is still too large', async () => {
    const manipulate = jest.fn(async () => ({
      uri: 'file:///large.jpg', width: 1200, height: 900,
      base64: base64ForBytes(CAMERA_UPLOAD_MAX_BYTES + 1),
    }));

    await expect(prepareCameraPhoto({ uri: 'file:///camera.jpg', width: 4032, height: 3024 }, manipulate))
      .rejects.toThrow('The photo is still too large');
    expect(manipulate).toHaveBeenCalledTimes(4);
  });
});
