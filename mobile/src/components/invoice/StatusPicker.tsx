import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { STATUS_OPTIONS, statusInk } from '@/utils/statusUtils';
import { hairline, radius } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface StatusPickerProps {
  visible: boolean;
  currentStatus: string;
  onSelect: (status: string) => void;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function StatusPicker({
  visible,
  currentStatus,
  onSelect,
  onClose,
}: StatusPickerProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide up and fade in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 90,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide down and fade out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleSelect = (status: string) => {
    // Trigger haptic feedback
    if (Platform.OS === 'ios') {
      const { impactAsync, ImpactFeedbackStyle } = require('expo-haptics');
      impactAsync(ImpactFeedbackStyle.Light);
    }

    onSelect(status);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Overlay */}
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        {/* Bottom Sheet */}
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              paddingBottom: insets.bottom || 16,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Title */}
          <View style={styles.header}>
            <Text style={styles.title}>Status</Text>
          </View>

          {/* Status Options */}
          <View style={styles.optionsContainer}>
            {STATUS_OPTIONS.map((status) => {
              const isSelected = status.value === currentStatus;

              return (
                <TouchableOpacity
                  key={status.value}
                  style={[
                    styles.option,
                    isSelected && styles.optionSelected,
                  ]}
                  onPress={() => handleSelect(status.value)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${status.label}. ${status.description}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.optionLeft, { gap: 12 }]}>
                    <Feather name={status.icon} size={20} color={statusInk(status.value, palette)} />
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                        {status.label}
                      </Text>
                      <Text style={styles.optionDescription}>{status.description}</Text>
                    </View>
                  </View>
                  <View style={styles.optionRight}>
                    <View style={[styles.colorDot, { backgroundColor: statusInk(status.value, palette) }]} />
                    {isSelected && <Feather name="check" size={18} color={palette.accent} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  bottomSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: palette.fill,
    borderRadius: 3,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
    textAlign: 'center',
  },
  optionsContainer: {
    paddingHorizontal: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    minHeight: 56,
    borderBottomWidth: hairline,
    borderBottomColor: palette.separator,
  },
  optionSelected: {
    backgroundColor: 'transparent',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: palette.accentText,
  },
  optionDescription: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cancelButton: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    backgroundColor: palette.fill,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
  },
});
