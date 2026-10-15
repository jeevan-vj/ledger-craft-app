import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { ActionButton } from './ActionButton';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'primary';
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary'
}: ConfirmDialogProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
          <Text className="text-xl font-bold text-gray-900 mb-2">{title}</Text>
          <Text className="text-sm text-gray-600 mb-6">{message}</Text>
          
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                title={cancelText}
                variant="secondary"
                onPress={onCancel}
              />
            </View>
            <View className="flex-1">
              <ActionButton
                title={confirmText}
                variant={variant}
                onPress={onConfirm}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

