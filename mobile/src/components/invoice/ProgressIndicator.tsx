import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, space } from '@/theme/tokens';

interface ProgressIndicatorProps {
  steps: {
    label: string;
    completed: boolean;
  }[];
}

export function ProgressIndicator({ steps }: ProgressIndicatorProps) {
  const completedCount = steps.filter((s) => s.completed).length;
  const current = steps.find((s) => !s.completed)?.label ?? steps[steps.length - 1]?.label;
  const progress = steps.length === 0 ? 0 : completedCount / steps.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.current}>{current}</Text>
        <Text style={styles.count}>
          {completedCount} of {steps.length}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(progress * 100, 6)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  current: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  count: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.fill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: palette.accent,
  },
});
