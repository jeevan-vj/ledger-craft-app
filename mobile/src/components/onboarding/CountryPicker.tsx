import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COUNTRIES } from '@/types/onboarding';

interface CountryPickerProps {
  visible: boolean;
  onSelect: (country: string) => void;
  onClose: () => void;
  selectedCountry?: string;
}

export default function CountryPicker({
  visible,
  onSelect,
  onClose,
  selectedCountry,
}: CountryPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCountries = COUNTRIES.filter((country) =>
    country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (country: string) => {
    onSelect(country);
    setSearchQuery('');
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Country</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={16} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search countries..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Countries List */}
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.countryItem,
                  selectedCountry === item && styles.countryItemSelected,
                ]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.countryText,
                    selectedCountry === item && styles.countryTextSelected,
                  ]}
                >
                  {item}
                </Text>
                {selectedCountry === item && (
                  <Text style={styles.checkmark}>Selected</Text>
                )}
              </TouchableOpacity>
            )}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    margin: 16,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1E293B',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  countryItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  countryText: {
    fontSize: 16,
    color: '#1E293B',
  },
  countryTextSelected: {
    color: '#163300',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: '#163300',
    fontWeight: 'bold',
  },
});

