export function randomId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const nibble = (Math.random() * 16) | 0;
    const value = char === 'x' ? nibble : (nibble & 0x3) | 0x8;
    return value.toString(16);
  });
}
