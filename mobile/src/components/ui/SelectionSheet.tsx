import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { control, hairline, palette, radius, space, type } from '@/theme/tokens';
import { selectionHaptic } from '@/utils/haptics';

interface SelectionSheetProps {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  loading: boolean;
  empty: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  children: ReactNode;
}

interface SelectionRowProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
}

export function SelectionSheet({
  visible,
  title,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  onClose,
  loading,
  empty,
  emptyTitle,
  emptyDescription,
  children,
}: SelectionSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.doneButton}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchField}>
            <Feather name="search" size={18} color={palette.textTertiary} />
            <TextInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={onSearchChange}
              style={styles.searchInput}
              placeholderTextColor={palette.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel={searchPlaceholder}
            />
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator size="large" color={palette.accentForeground} />
            </View>
          ) : (
            <>
              <View style={styles.group}>{children}</View>
              {empty ? (
                <View style={styles.state}>
                  <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                  {emptyDescription ? <Text style={styles.emptyDescription}>{emptyDescription}</Text> : null}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function SelectionRow({ title, subtitle, selected, onPress, leading }: SelectionRowProps) {
  const handlePress = () => {
    if (!selected) selectionHaptic();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.row}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint="Selects this option"
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {selected ? (
        <View style={styles.check}>
          <Feather name="check" size={15} color={palette.accentForeground} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  header: {
    backgroundColor: palette.surface,
    paddingHorizontal: space.screen,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: palette.separator,
  },
  titleRow: {
    minHeight: control.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  title: { ...type.headline, fontSize: 20 },
  doneButton: {
    minWidth: control.touchTarget,
    minHeight: control.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  doneText: { ...type.callout, color: palette.focus, fontWeight: '600' },
  searchField: {
    minHeight: control.default,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.fillMuted,
    paddingHorizontal: space.md,
  },
  searchInput: { ...type.body, flex: 1, paddingVertical: space.sm },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: space.screen, paddingVertical: space.lg },
  group: {
    overflow: 'hidden',
    borderRadius: radius.group,
    backgroundColor: palette.surface,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: palette.separator,
  },
  leading: { marginRight: space.md },
  rowCopy: { flex: 1 },
  rowTitle: { ...type.callout, color: palette.text, fontWeight: '600' },
  rowSubtitle: { ...type.footnote, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    marginLeft: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
  },
  state: { alignItems: 'center', paddingHorizontal: space.xl, paddingVertical: 64 },
  emptyTitle: { ...type.headline, textAlign: 'center' },
  emptyDescription: { ...type.footnote, marginTop: space.xs, textAlign: 'center' },
});
