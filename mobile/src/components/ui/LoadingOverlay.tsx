import React from 'react';
import { View, ActivityIndicator, Modal } from 'react-native';

interface LoadingOverlayProps {
  visible: boolean;
}

export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
    >
      <View className="flex-1 bg-black/50 items-center justify-center">
        <View className="bg-white rounded-2xl p-6">
          <ActivityIndicator size="large" color="#163300" />
        </View>
      </View>
    </Modal>
  );
}

