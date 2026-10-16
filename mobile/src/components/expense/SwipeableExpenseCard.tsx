import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Expense } from '@/types/expense';
import { hairline, radius } from '@/theme/tokens';
import { IconWell } from '@/components/ui/IconWell';
import { useTheme } from '@/theme';

interface SwipeableExpenseCardProps {
  expense: Expense;
  onPress: () => void;
  onEdit: (expenseId: string) => void;
  onDelete: (expenseId: string) => void;
  disabled?: boolean;
  formatCurrency: (amount: number, currency: string) => string;
  formatDate: (dateString: string) => string;
  isFirst?: boolean;
  isLast?: boolean;
}

const SWIPE_THRESHOLD = -80;
const ACTION_BUTTON_WIDTH = 72;
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 180,
};

function getStatusColor(status: string, palette: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case 'approved':
      return palette.success;
    case 'rejected':
      return palette.danger;
    case 'pending':
    default:
      return palette.textSecondary;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'pending':
    default:
      return 'Pending';
  }
}

export default function SwipeableExpenseCard({
  expense,
  onPress,
  onEdit,
  onDelete,
  disabled = false,
  formatCurrency,
  formatDate,
  isFirst = false,
  isLast = false,
}: SwipeableExpenseCardProps) {
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const translateX = useSharedValue(0);
  const isSwipedRef = useRef(false);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
  }, []);

  const handleActionPress = useCallback((action: () => void) => {
    triggerHaptic();
    translateX.value = withSpring(0, SPRING_CONFIG);
    isSwipedRef.current = false;
    action();
  }, [triggerHaptic, translateX]);

  const onEditAction = useCallback(() => {
    handleActionPress(() => onEdit(expense.id));
  }, [expense.id, handleActionPress, onEdit]);

  const onDeleteAction = useCallback(() => {
    handleActionPress(() => onDelete(expense.id));
  }, [expense.id, handleActionPress, onDelete]);

  const handlePress = useCallback(() => {
    if (!disabled) {
      onPress();
    }
  }, [disabled, onPress]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      if (disabled) return;
      const newTranslateX = event.translationX;
      if (newTranslateX < 0) {
        const maxSwipe = -ACTION_BUTTON_WIDTH * 2;
        if (newTranslateX < maxSwipe) {
          translateX.value = maxSwipe + (newTranslateX - maxSwipe) * 0.12;
        } else {
          translateX.value = newTranslateX;
        }
      } else {
        translateX.value = 0;
      }
    })
    .onEnd((event) => {
      if (disabled) return;
      if (translateX.value < SWIPE_THRESHOLD || event.velocityX < -500) {
        translateX.value = withSpring(-ACTION_BUTTON_WIDTH * 2, SPRING_CONFIG);
        isSwipedRef.current = true;
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
        isSwipedRef.current = false;
      }
    });

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onEnd(() => {
      'worklet';
      if (Math.abs(translateX.value) < 10) {
        runOnJS(handlePress)();
      }
    });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const statusColor = getStatusColor(expense.status, palette);
  const subtitle = [expense.vendorName, formatDate(expense.expenseDate)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        styles.container,
        isFirst && styles.first,
        isLast && styles.last,
      ]}
    >
      <View style={styles.actionsContainer}>
        <GestureDetector
          gesture={Gesture.Tap().onEnd(() => {
            'worklet';
            runOnJS(onEditAction)();
          })}
        >
          <View style={[styles.actionButton, { backgroundColor: palette.accent }]}>
            <Feather name="edit-2" size={16} color={palette.accentForeground} />
            <Text style={[styles.actionLabel, { color: palette.accentForeground }]}>Edit</Text>
          </View>
        </GestureDetector>
        <GestureDetector
          gesture={Gesture.Tap().onEnd(() => {
            'worklet';
            runOnJS(onDeleteAction)();
          })}
        >
          <View style={[styles.actionButton, { backgroundColor: palette.danger }]}>
            <Feather name="trash-2" size={16} color={palette.surface} />
            <Text style={styles.actionLabel}>Delete</Text>
          </View>
        </GestureDetector>
      </View>

      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[
            styles.row,
            cardAnimatedStyle,
            !isLast && styles.rowBorder,
          ]}
        >
          <IconWell size={40} color={`${statusColor}22`}>
            <Feather name="credit-card" size={16} color={statusColor} />
          </IconWell>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {expense.description}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {subtitle}
              {expense.category?.name ? ` · ${expense.category.name}` : ''}
            </Text>
          </View>
          {expense.receiptUrl ? (
            <Feather name="paperclip" size={14} color={palette.textTertiary} />
          ) : null}
          <View style={styles.trailing}>
            <Text style={styles.amount}>
              {formatCurrency(expense.amount || 0, expense.currency || 'NZD')}
            </Text>
            <Text style={[styles.status, { color: statusColor }]}>
              {getStatusLabel(expense.status)}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  first: {
    borderTopLeftRadius: radius.group,
    borderTopRightRadius: radius.group,
  },
  last: {
    borderBottomLeftRadius: radius.group,
    borderBottomRightRadius: radius.group,
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  actionButton: {
    width: ACTION_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: palette.surface,
    fontSize: 11,
    fontWeight: '600',
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: palette.surface,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: hairline,
    borderBottomColor: palette.separator,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
  },
  meta: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 2,
  },
  trailing: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.text,
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
