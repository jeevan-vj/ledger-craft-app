import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { INVOICE_TEMPLATES } from '@/types/invoiceTemplates';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface TemplateSelectorProps {
  selectedTemplate: InvoiceTemplateId;
  onSelectTemplate: (templateId: InvoiceTemplateId) => void;
}

export default function TemplateSelector({
  selectedTemplate,
  onSelectTemplate,
}: TemplateSelectorProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const handleSelect = (templateId: InvoiceTemplateId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onSelectTemplate(templateId);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Template</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scrollContent}
      >
        {INVOICE_TEMPLATES.map((template) => {
          const isSelected = template.id === selectedTemplate;
          
          return (
            <TouchableOpacity
              key={template.id}
              style={[
                styles.chip,
                isSelected && styles.chipSelected,
              ]}
              onPress={() => handleSelect(template.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Use ${template.name} invoice template`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={styles.chipIcon}>PDF</Text>
              <Text
                style={[
                  styles.chipText,
                  isSelected && styles.chipTextSelected,
                ]}
              >
                {template.name}
              </Text>
              {isSelected ? (
                <View style={styles.checkmark}>
                  <Feather name="check" size={12} color={theme.colors.accentForeground} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    paddingVertical: space.md,
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  title: {
    ...type.section,
    marginBottom: space.sm,
    marginHorizontal: space.lg,
    textTransform: 'uppercase',
  },
  scrollContent: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: control.touchTarget,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.fillMuted,
    borderWidth: 1,
    borderColor: palette.border,
    gap: space.sm,
  },
  chipSelected: {
    backgroundColor: palette.accentFill,
    borderColor: palette.accentText,
  },
  chipIcon: {
    fontSize: 18,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  chipTextSelected: {
    color: palette.accentText,
    fontWeight: '700',
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
