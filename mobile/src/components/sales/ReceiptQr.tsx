import React, { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

/** Integer-sized modules and the four-module quiet zone keep this scannable on native and web. */
export function ReceiptQr({ value }: { value: string }) {
  const qr = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    return code;
  }, [value]);
  const count = qr.getModuleCount();
  const cell = Math.max(1, Math.floor(248 / (count + 8)));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Receipt QR code" style={{ padding: cell * 4, backgroundColor: '#fff', alignSelf: 'center' }}>
      {Array.from({ length: count }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row', height: cell }}>
          {Array.from({ length: count }, (_, col) => (
            <View key={col} style={{ width: cell, height: cell, backgroundColor: qr.isDark(row, col) ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}
