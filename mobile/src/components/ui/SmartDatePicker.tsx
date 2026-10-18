import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { radius } from '@/theme/tokens';
import { dateForPreset, localIsoDate, parseLocalDate } from './datePickerModel';
import { useTheme } from '@/theme';

interface SmartDatePickerProps {
  label: string;
  value: string; // ISO date string
  onChangeDate: (date: string) => void;
  minimumDate?: Date;
  presetBaseDate?: string;
  showPresets?: boolean;
}

type DatePreset = {
  label: string;
  days: number;
};

const DATE_PRESETS: DatePreset[] = [
  { label: 'Due on receipt', days: 0 },
  { label: 'Net 7', days: 7 },
  { label: 'Net 15', days: 15 },
  { label: 'Net 30', days: 30 },
];

export function SmartDatePicker({
  label,
  value,
  onChangeDate,
  minimumDate,
  presetBaseDate,
  showPresets = true,
}: SmartDatePickerProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const [showModal, setShowModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(parseLocalDate(value));

  useEffect(() => {
    setTempDate(parseLocalDate(value));
  }, [value]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handlePresetSelect = (days: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isoString = dateForPreset(
      days,
      presetBaseDate,
      minimumDate ? localIsoDate(minimumDate) : undefined,
    );
    onChangeDate(isoString);
    setShowModal(false);
  };

  const handleCustomDate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'ios') {
      // iOS shows inline picker
      setShowDatePicker(true);
    } else {
      // Android shows native modal
      setShowModal(false);
      setTimeout(() => setShowDatePicker(true), 100);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (selectedDate) {
      setTempDate(selectedDate);
      if (Platform.OS === 'android') {
        // Android: apply immediately
        const isoString = localIsoDate(selectedDate);
        onChangeDate(isoString);
      }
    }
  };

  const handleIOSConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const isoString = localIsoDate(tempDate);
    onChangeDate(isoString);
    setShowDatePicker(false);
    setShowModal(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatDate(value) }}
        accessibilityHint="Opens date options"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setTempDate(parseLocalDate(value));
          setShowModal(true);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>{formatDate(value)}</Text>
        <Feather name="chevron-right" size={18} color={palette.textTertiary} />
      </TouchableOpacity>

      {/* Presets Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {label.toLowerCase()}</Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close date options"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.presetsContainer}>
              {showPresets ? DATE_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  style={styles.presetButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${preset.label}, ${preset.days === 0 ? 'today' : `${preset.days} days from now`}`}
                  onPress={() => handlePresetSelect(preset.days)}
                  activeOpacity={0.7}
                >
                  <View style={styles.presetLeft}>
                    <View>
                      <Text style={styles.presetLabel}>{preset.label}</Text>
                      <Text style={styles.presetSubtext}>
                        {preset.days === 0 ? 'Today' : `${preset.days} days from now`}
                      </Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={palette.textTertiary} />
                </TouchableOpacity>
              )) : null}

              <TouchableOpacity
                style={[styles.presetButton, styles.customButton]}
                accessibilityRole="button"
                accessibilityLabel="Choose a custom date"
                onPress={handleCustomDate}
                activeOpacity={0.7}
              >
                <View style={styles.presetLeft}>
                  <View>
                    <Text style={styles.presetLabel}>Custom date</Text>
                    <Text style={styles.presetSubtext}>Pick a specific date</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={palette.textTertiary} />
              </TouchableOpacity>
            </ScrollView>

            {/* iOS inline date picker */}
            {showDatePicker && Platform.OS === 'ios' && (
              <View style={styles.iosPickerContainer}>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  minimumDate={minimumDate}
                  style={styles.iosPicker}
                />
                <TouchableOpacity
                  style={styles.iosConfirmButton}
                  onPress={handleIOSConfirm}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm selected date"
                >
                  <Text style={styles.iosConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Android native date picker */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={minimumDate}
        />
      )}
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textSecondary,
    marginBottom: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  buttonText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.separator,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
  },
  closeButton: {
    fontSize: 17,
    color: palette.accent,
    fontWeight: '500',
  },
  presetsContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  presetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  customButton: {
    borderBottomWidth: 0,
  },
  presetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  presetLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
    marginBottom: 2,
  },
  presetSubtext: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  iosPickerContainer: {
    borderTopWidth: 1,
    borderTopColor: palette.separator,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  iosPicker: {
    height: 200,
  },
  iosConfirmButton: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  iosConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.accentForeground,
  },
});
