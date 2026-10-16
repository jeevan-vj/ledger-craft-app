import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { PillButton } from './PillButton';

interface Props { title: string; description: string; actionLabel?: string; onPress?: () => void; icon?: React.ComponentProps<typeof Feather>['name']; }
export function DashedSetupCard({ title, description, actionLabel = 'Set up', onPress, icon = 'sliders' }: Props) {
  const theme = useTheme();
  return <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.space.xl, backgroundColor: theme.colors.surface }}>
    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: theme.space.lg }}>
      <Feather name={icon} size={20} color={theme.colors.text} />
      <View style={{ position: 'absolute', right: -2, top: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.colors.surface }}><Feather name="plus" size={11} color={theme.colors.accentForeground} /></View>
    </View>
    <Text style={[theme.type.headline, { marginBottom: theme.space.xs }]}>{title}</Text>
    <Text style={[theme.type.subhead, { lineHeight: 21, marginBottom: onPress ? theme.space.lg : 0 }]}>{description}</Text>
    {onPress ? <PillButton label={actionLabel} variant="secondary" onPress={onPress} style={{ alignSelf: 'flex-start' }} /> : null}
  </View>;
}
