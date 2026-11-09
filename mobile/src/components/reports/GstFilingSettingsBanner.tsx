import React from 'react';
import { Text, View } from 'react-native';
import { AppPressable } from '@/components/ui/AppPressable';
import { radius, space, useTheme } from '@/theme';

export function GstFilingSettingsBanner({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: theme.colors.accentFill }}>
      <Text style={theme.type.headline}>Confirm GST settings</Text>
      <Text style={theme.type.body}>This business is GST registered, but the accounting basis, filing frequency and period-ending month are not saved. Tax invoices stay drafts until you confirm them.</Text>
      <AppPressable accessibilityRole="button" accessibilityLabel="Open GST settings" onPress={onOpen} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[theme.type.headline, { color: theme.colors.accentText }]}>Open GST settings</Text>
      </AppPressable>
    </View>
  );
}
