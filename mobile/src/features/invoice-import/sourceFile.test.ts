import { readDocumentBase64 } from './sourceFile';

describe('readDocumentBase64', () => {
  it('uses the document picker base64 payload on web', async () => {
    await expect(readDocumentBase64({ uri: 'blob:demo', base64: 'cGRm' }, 'web')).resolves.toBe('cGRm');
  });

  it('encodes the web File when the picker does not provide base64', async () => {
    const file = { arrayBuffer: async () => Uint8Array.from([112, 100, 102]).buffer };
    await expect(readDocumentBase64({ uri: 'blob:demo', file }, 'web')).resolves.toBe('cGRm');
  });
});
