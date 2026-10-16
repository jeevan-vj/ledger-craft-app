import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ModernInput } from '@/components/ui/ModernInput';
import type { LineItem } from '@/types/invoice';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface CompactLineItemProps {
  item: LineItem;
  index: number;
  onUpdate: (index: number, field: keyof LineItem, value: any) => void;
  onRemove: (index: number) => void;
  onSelectItem: (index: number) => void;
  canRemove: boolean;
  formatCurrency: (amount: number) => string;
}

export function CompactLineItem({
  item,
  index,
  onUpdate,
  onRemove,
  onSelectItem,
  canRemove,
  formatCurrency,
}: CompactLineItemProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const [showEditModal, setShowEditModal] = useState(false);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow swipe left (negative translation)
      if (e.translationX < 0 && canRemove) {
        translateX.value = Math.max(e.translationX, -100);
      }
    })
    .onEnd(() => {
      if (translateX.value < -60 && canRemove) {
        // Trigger delete
        runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Warning);
        translateX.value = withTiming(-300, { duration: 300 });
        opacity.value = withTiming(0, { duration: 300 }, () => {
          runOnJS(onRemove)(index);
        });
      } else {
        // Snap back
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -20 ? 1 : 0,
  }));

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(true);
  };

  const handleItemSelect = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEditModal(false);
    onSelectItem(index);
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, animatedStyle]}>
          <TouchableOpacity
            style={styles.touchable}
            onPress={handleTap}
            activeOpacity={0.7}
          >
            <View style={styles.dragHandle}>
              <View style={styles.handleBar} />
              <View style={styles.handleBar} />
              <View style={styles.handleBar} />
            </View>

            <View style={styles.content}>
              <View style={styles.leftSection}>
                <Text style={styles.description} numberOfLines={1}>
                  {item.description || 'Tap to add item'}
                </Text>
                <Text style={styles.details}>
                  {item.quantity} × {formatCurrency(item.rate)}
                  {item.unit && item.unit !== 'each' && ` (${item.unit})`}
                </Text>
              </View>

              <View style={styles.rightSection}>
                <Text style={styles.amount}>{formatCurrency(item.total)}</Text>
                <Text style={styles.editLabel}>Edit</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>

      {/* Delete button behind */}
      {canRemove && (
        <Animated.View style={[styles.deleteButton, deleteButtonStyle]}>
          <Text style={styles.deleteLabel}>Delete</Text>
        </Animated.View>
      )}

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowEditModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Line Item</Text>
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <TouchableOpacity
                style={styles.itemSelectorButton}
                onPress={handleItemSelect}
                activeOpacity={0.7}
              >
                <Text style={styles.itemSelectorLabel}>
                  {item.description || 'Select from catalog'}
                </Text>
                <Feather name="chevron-right" size={18} color={palette.textTertiary} />
              </TouchableOpacity>

              <ModernInput
                label="Description"
                value={item.description}
                onChangeText={(text) => onUpdate(index, 'description', text)}
                placeholder="Enter custom description"
              />

              <View style={styles.row}>
                <View style={styles.quarterWidth}>
                  <ModernInput
                    label="Quantity"
                    value={String(item.quantity)}
                    onChangeText={(text) => onUpdate(index, 'quantity', Number(text) || 0)}
                    keyboardType="numeric"
                    placeholder="1"
                  />
                </View>
                <View style={styles.halfWidth}>
                  <ModernInput
                    label="Rate"
                    value={String(item.rate)}
                    onChangeText={(text) => onUpdate(index, 'rate', Number(text) || 0)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </View>

              <ModernInput
                label="Unit (optional)"
                value={item.unit || ''}
                onChangeText={(text) => onUpdate(index, 'unit', text)}
                placeholder="e.g., hours, items"
              />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatCurrency(item.total)}</Text>
              </View>

              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => setShowEditModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    marginBottom: 2,
    position: 'relative',
  },
  card: {
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  dragHandle: {
    marginRight: 12,
    gap: 3,
  },
  handleBar: {
    width: 3,
    height: 12,
    backgroundColor: '#cbd5e1',
    borderRadius: 2,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flex: 1,
    marginRight: 12,
  },
  description: {
    fontSize: 17,
    fontWeight: '500',
    color: palette.text,
    marginBottom: 2,
  },
  details: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.accent,
  },
  deleteButton: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.danger,
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
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
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
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeButton: {
    fontSize: 17,
    color: palette.accent,
    fontWeight: '500',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  itemSelectorButton: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemSelectorLabel: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  itemSelectorIcon: {
    fontSize: 20,
    color: '#94a3b8',
    fontWeight: '300',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  quarterWidth: {
    flex: 1,
  },
  halfWidth: {
    flex: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#163300',
  },
  doneButton: {
    backgroundColor: palette.accent,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#163300',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});

