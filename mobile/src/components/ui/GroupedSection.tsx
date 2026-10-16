import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { hairline, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface GroupedSectionProps {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function GroupedSection({ title, footer, children, style }: GroupedSectionProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[styles.wrap, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.group}>
        {items.map((child, index) => (
          <View key={index}>
            {child}
            {index < items.length - 1 ? <View style={styles.separator} /> : null}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  wrap: {
    marginBottom: space.xl,
  },
  title: {
    ...type.section,
    marginBottom: space.sm,
    marginLeft: space.md,
  },
  group: {
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    overflow: 'hidden',
  },
  separator: {
    height: hairline,
    backgroundColor: palette.separator,
    marginLeft: space.lg,
  },
  footer: {
    ...type.footnote,
    marginTop: space.sm,
    marginHorizontal: space.md,
  },
});
