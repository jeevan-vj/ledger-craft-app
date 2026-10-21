import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppPressable } from '@/components/ui/AppPressable';
import type { InvoiceStackParamList } from '@/navigation/types';
import { radius, space } from '@/theme/tokens';
import { selectionHaptic } from '@/utils/haptics';
import { useTheme } from '@/theme';

type Value = 'invoices' | 'quotes';

export function SalesDocumentSwitch({ value }: { value: Value }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<NativeStackNavigationProp<InvoiceStackParamList>>();

  const select = (next: Value) => {
    if (next === value) return;
    selectionHaptic();
    navigation.navigate(next === 'invoices' ? 'InvoiceList' : 'QuoteList');
  };

  return (
    <View style={styles.track} accessibilityRole="tablist">
      {(['invoices', 'quotes'] as const).map((option) => {
        const selected = option === value;
        const label = option === 'invoices' ? 'Invoices' : 'Quotes';
        return (
          <AppPressable
            key={option}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => select(option)}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
          </AppPressable>
        );
      })}
    </View>
  );
}

const createStyles = ({ colors: palette, type, control: controlTokens }: ReturnType<typeof useTheme>) => StyleSheet.create({
  track: {
    flexDirection: 'row',
    marginHorizontal: space.screen,
    marginTop: space.sm,
    marginBottom: space.sm,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.fill,
  },
  option: {
    flex: 1,
    minHeight: controlTokens.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  selected: {
    backgroundColor: palette.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...type.callout,
    color: palette.textSecondary,
  },
  selectedLabel: {
    color: palette.text,
    fontWeight: '700',
  },
});
