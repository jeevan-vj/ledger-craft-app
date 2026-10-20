import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { COUNTRIES } from '@/types/onboarding';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

interface CountryPickerProps {
  visible: boolean;
  onSelect: (country: string) => void;
  onClose: () => void;
  selectedCountry?: string;
}

export default function CountryPicker({ visible, onSelect, onClose, selectedCountry }: CountryPickerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [searchQuery, setSearchQuery] = useState('');
  const filteredCountries = COUNTRIES.filter((country) => country.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  const close = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Business country</Text>
          <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Close country selection">
            <Feather name="x" size={21} color={theme.colors.text} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Feather name="search" size={18} color={theme.colors.textSecondary} />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search countries"
            placeholderTextColor={theme.colors.textTertiary} style={styles.searchInput} autoCapitalize="none"
            autoCorrect={false} accessibilityLabel="Search countries" />
        </View>
        <FlatList
          data={filteredCountries}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Feather name="search" size={26} color={theme.colors.textTertiary} />
              <Text style={styles.emptyTitle}>No countries found</Text>
              <Text style={styles.emptyBody}>Try a different country name.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const selected = selectedCountry === item;
            return (
              <Pressable
                onPress={() => { onSelect(item); close(); }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{item}</Text>
                {selected ? <Feather name="check" size={20} color={theme.colors.accentText} /> : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { minHeight: 60, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...theme.type.title, fontSize: 24 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.fill },
  search: { minHeight: 52, marginHorizontal: space.xl, marginBottom: space.lg, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, backgroundColor: theme.colors.fillMuted, borderWidth: 1, borderColor: theme.colors.border },
  searchInput: { ...theme.type.body, flex: 1, paddingVertical: 12 },
  list: { paddingHorizontal: space.xl, paddingBottom: space.section },
  row: { minHeight: 56, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator },
  rowPressed: { backgroundColor: theme.colors.fillMuted },
  rowText: { ...theme.type.body },
  rowTextSelected: { color: theme.colors.accentText, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: space.xl },
  emptyTitle: { ...theme.type.headline, marginTop: space.md },
  emptyBody: { ...theme.type.subhead, marginTop: space.xs, textAlign: 'center' },
});
