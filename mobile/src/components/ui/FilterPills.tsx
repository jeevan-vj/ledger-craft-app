import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet, View } from 'react-native';
import { control, palette, radius, space } from '@/theme/tokens';
import { selectionHaptic } from '@/utils/haptics';

interface FilterPillsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  labels,
}: FilterPillsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroller}
    >
      <View style={styles.track}>
        {options.map((option) => {
          const active = option === value;
          const label = labels?.[option] ?? option.charAt(0).toUpperCase() + option.slice(1);
          return (
            <Pressable
              key={option}
              onPress={() => {
                if (!active) selectionHaptic();
                onChange(option);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.pill,
                active && styles.pillActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: {
    flexGrow: 0,
  },
  row: {
    paddingHorizontal: space.screen,
    paddingVertical: space.sm,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fill,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  pill: {
    minHeight: control.touchTarget,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: palette.surface,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  labelActive: {
    color: palette.text,
  },
});
