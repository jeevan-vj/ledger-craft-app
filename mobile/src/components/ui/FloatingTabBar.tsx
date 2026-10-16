import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { selectionHaptic } from '@/utils/haptics';

export interface FloatingTabItem { key: string; label: string; icon: React.ComponentProps<typeof Feather>['name']; }
export function FloatingTabBar({ items, activeKey, onSelect }: { items: FloatingTabItem[]; activeKey: string; onSelect: (key: string) => void }) {
  const theme = useTheme();
  return <View style={{ flexDirection: 'row', padding: 6, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
    {items.map((item) => { const active = item.key === activeKey; return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => { selectionHaptic(); onSelect(item.key); }} style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: theme.radius.lg, backgroundColor: active ? theme.colors.accentFill : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}><Feather name={item.icon} size={19} color={active ? theme.colors.accentText : theme.colors.textSecondary} /><Text style={{ color: active ? theme.colors.accentText : theme.colors.textSecondary, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{item.label}</Text></Pressable>; })}
  </View>;
}
