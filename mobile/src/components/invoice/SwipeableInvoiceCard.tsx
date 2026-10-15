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
import type { Invoice } from '@/types/invoice';
import { STATUS_OPTIONS, getStatusColor, getStatusIcon, getStatusLabel } from '@/utils/statusUtils';
import { hairline, palette, radius } from '@/theme/tokens';
import { IconWell } from '@/components/ui/IconWell';

interface SwipeableInvoiceCardProps {
  invoice: Invoice;
  onPress: () => void;
  onStatusChange: (invoiceId: string, status: string) => void;
  disabled?: boolean;
  formatCurrency: (amount: number, currency: string) => string;
  formatDate: (dateString: string) => string;
  isFirst?: boolean;
  isLast?: boolean;
}

const SWIPE_THRESHOLD = -80;
const ACTION_BUTTON_WIDTH = 72;
const SWIPE_SPRING_CONFIG = {
  damping: 20,
  stiffness: 180,
};

export default function SwipeableInvoiceCard({
  invoice,
  onPress,
  onStatusChange,
  disabled = false,
  formatCurrency,
  formatDate,
  isFirst = false,
  isLast = false,
}: SwipeableInvoiceCardProps) {
  const translateX = useSharedValue(0);
  const isSwipedRef = useRef(false);
  const availableStatuses = STATUS_OPTIONS.filter((opt) => opt.value !== invoice.status);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(style).catch(() => undefined);
    }
  }, []);

  const handleCardPress = useCallback(() => {
    if (!disabled) {
      onPress();
    }
  }, [disabled, onPress]);

  const handleStatusPress = useCallback((status: string) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withSpring(0, SWIPE_SPRING_CONFIG);
    isSwipedRef.current = false;
    onStatusChange(invoice.id, status);
  }, [invoice.id, onStatusChange, triggerHaptic, translateX]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      if (disabled) return;
      const newTranslateX = event.translationX;
      if (newTranslateX < 0) {
        const maxSwipe = -ACTION_BUTTON_WIDTH * availableStatuses.length;
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
        translateX.value = withSpring(-ACTION_BUTTON_WIDTH * availableStatuses.length, SWIPE_SPRING_CONFIG);
        isSwipedRef.current = true;
      } else {
        translateX.value = withSpring(0, SWIPE_SPRING_CONFIG);
        isSwipedRef.current = false;
      }
    });

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .onEnd(() => {
      'worklet';
      if (Math.abs(translateX.value) < 10) {
        runOnJS(triggerHaptic)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(handleCardPress)();
      }
    });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);
  const cardSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const statusColor = getStatusColor(invoice.status);

  return (
    <View
      style={[
        styles.container,
        isFirst && styles.first,
        isLast && styles.last,
      ]}
    >
      <View style={styles.actionsContainer}>
        {availableStatuses.map((status) => (
          <GestureDetector
            key={status.value}
            gesture={Gesture.Tap().onEnd(() => {
              'worklet';
              runOnJS(handleStatusPress)(status.value);
            })}
          >
            <View style={[styles.actionButton, { backgroundColor: status.color }]}>
              <Feather name={status.icon} size={16} color={palette.surface} />
              <Text style={styles.actionLabel}>{status.label}</Text>
            </View>
          </GestureDetector>
        ))}
      </View>

      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[
            styles.row,
            cardSwipeStyle,
            !isLast && styles.rowBorder,
          ]}
        >
          <IconWell size={40} color={`${statusColor}22`}>
            <Feather name={getStatusIcon(invoice.status)} size={16} color={statusColor} />
          </IconWell>
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={1}>
              {invoice.customer?.name || 'No customer'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {invoice.invoiceNumber} · {formatDate(invoice.dueDate)}
            </Text>
          </View>
          <View style={styles.trailing}>
            <Text style={styles.amount}>
              {formatCurrency(invoice.total || 0, invoice.currency || 'NZD')}
            </Text>
            <Text style={[styles.status, { color: statusColor }]}>
              {getStatusLabel(invoice.status)}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
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
