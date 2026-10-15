import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { AnimatedTotal } from '@/components/ui/AnimatedTotal';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface FloatingInvoiceHeaderProps {
  invoiceNumber: string;
  total: number;
  currency?: string;
  title?: string;
}

export function FloatingInvoiceHeader({
  invoiceNumber,
  total,
  currency = 'NZD',
  title = 'Create Invoice',
}: FloatingInvoiceHeaderProps) {
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
      <BlurView intensity={95} tint="light" style={styles.blurContainer}>
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
          </View>
          <View style={styles.rightSection}>
            <AnimatedTotal amount={total} currency={currency} size="medium" showLabel />
          </View>
        </View>
      </BlurView>
      {/* Shadow overlay for better separation */}
      <View style={styles.shadowLine} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  blurContainer: {
    overflow: 'hidden',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  leftSection: {
    flex: 1,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  invoiceNumber: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  shadowLine: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
});


