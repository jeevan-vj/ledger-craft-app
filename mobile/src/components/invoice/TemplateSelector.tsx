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
import { control } from '@/theme/tokens';

interface TemplateSelectorProps {
  selectedTemplate: InvoiceTemplateId;
  onSelectTemplate: (templateId: InvoiceTemplateId) => void;
}

export default function TemplateSelector({
  selectedTemplate,
  onSelectTemplate,
}: TemplateSelectorProps) {
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
                  <Feather name="check" size={12} color="#ffffff" />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scrollContent: {
    gap: 10,
    paddingRight: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: control.touchTarget,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  chipSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#163300',
  },
  chipIcon: {
    fontSize: 18,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextSelected: {
    color: '#163300',
    fontWeight: '700',
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#163300',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
