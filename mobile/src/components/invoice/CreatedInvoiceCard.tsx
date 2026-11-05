import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PillButton } from '@/components/ui/PillButton';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface CreatedInvoiceCardProps {
  invoiceNumber: string;
  onPreview: () => void;
  onEdit: () => void;
}

export function CreatedInvoiceCard({ invoiceNumber, onPreview, onEdit }: CreatedInvoiceCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.iconWell}>
        <Feather name="check" size={24} color={theme.colors.accentText} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Draft saved</Text>
        <Text style={styles.body}>{invoiceNumber} is ready to check and share.</Text>
      </View>
      <PillButton label="Preview invoice" onPress={onPreview} />
      <PillButton label="Edit draft" variant="secondary" onPress={onEdit} />
    </View>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.group,
    padding: space.xl,
    marginBottom: space.lg,
    gap: space.md,
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: radius.well,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentFill,
  },
  copy: { gap: space.xs },
  title: { ...type.title },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 24 },
});
