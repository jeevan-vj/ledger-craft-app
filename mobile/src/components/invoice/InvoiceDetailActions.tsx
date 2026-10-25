import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ModernButton } from '@/components/ui/ModernButton';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface InvoiceDetailActionsProps {
  isPaid: boolean;
  bottomInset: number;
  onPreview: () => void;
  onRecordPayment: () => void;
  onShare: () => void;
  onEdit: () => void;
  onHeightChange?: (height: number) => void;
}

export function InvoiceDetailActions({
  isPaid,
  bottomInset,
  onPreview,
  onRecordPayment,
  onShare,
  onEdit,
  onHeightChange,
}: InvoiceDetailActionsProps) {
  const theme = useTheme();
  const palette = theme.colors;
  const styles = createStyles(theme);

  return (
    <View
      testID="invoice-detail-actions"
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[styles.container, { paddingBottom: bottomInset + space.xl }]}
    >
      <ModernButton
        onPress={onPreview}
        variant="primary"
        size="lg"
        fullWidth
        icon={<Feather name="eye" size={19} color={palette.accentForeground} />}
      >
        Preview invoice
      </ModernButton>
      {!isPaid ? (
        <ModernButton onPress={onRecordPayment} variant="secondary" size="lg" fullWidth>
          Record payment
        </ModernButton>
      ) : null}
      <View style={styles.secondaryRow}>
        <Pressable
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share invoice"
          style={styles.secondaryAction}
        >
          <Feather name="share-2" size={18} color={palette.accentText} />
          <Text style={styles.secondaryLabel}>Share</Text>
        </Pressable>
        {!isPaid ? (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Edit invoice"
            style={styles.secondaryAction}
          >
            <Feather name="edit-2" size={18} color={palette.accentText} />
            <Text style={styles.secondaryLabel}>Edit</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = ({ colors: palette }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    backgroundColor: palette.surfaceRaised,
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
    gap: space.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  secondaryAction: {
    flex: 1,
    minHeight: control.default,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: palette.fill,
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.accentText,
  },
});
