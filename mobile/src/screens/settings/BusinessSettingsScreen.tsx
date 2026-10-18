import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { businessProfileService, BusinessProfile, BusinessProfileUpdate } from '@/services/businessProfileService';
import { FormInput } from '@/components/ui/FormInput';
import CountryPicker from '@/components/onboarding/CountryPicker';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Feather } from '@expo/vector-icons';
import { control, hairline, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabType = 'profile' | 'preferences' | 'appearance';

export default function BusinessSettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { colors: palette, type } = theme;
  const styles = createStyles(theme);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  
  // Form state
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [taxId, setTaxId] = useState('');
  const [country, setCountry] = useState('New Zealand');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [defaultTaxRate, setDefaultTaxRate] = useState('');
  const [invoiceNumberFormat, setInvoiceNumberFormat] = useState('INV-{YYYY}-{SEQ}');
  const [invoiceNumberSequence, setInvoiceNumberSequence] = useState('1');
  const [defaultTerms, setDefaultTerms] = useState('');
  const [defaultNotes, setDefaultNotes] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [newLogoUri, setNewLogoUri] = useState<string | null>(null);
  
  // UI state
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [imagePickerLoading, setImagePickerLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await businessProfileService.getBusinessProfile();
      console.log('📸 Loaded profile data:', data);
      console.log('📸 Logo URL from database:', data?.logoUrl);
      if (data) {
        setProfile(data);
        populateForm(data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load business profile');
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (data: BusinessProfile) => {
    setBusinessName(data.name || '');
    setEmail(data.email || '');
    setPhone(data.phone || '');
    setWebsite(data.website || '');
    setTaxId(data.taxId || '');
    setCountry(data.country || 'New Zealand');
    setAddress(data.address || '');
    setCity(data.city || '');
    setState(data.state || '');
    setZip(data.zip || '');
    setDefaultTaxRate(data.defaultTaxRate?.toString() || '');
    setInvoiceNumberFormat(data.invoiceNumberFormat || 'INV-{YYYY}-{SEQ}');
    setInvoiceNumberSequence(data.invoiceNumberSequence?.toString() || '1');
    setDefaultTerms(data.defaultTerms || '');
    setDefaultNotes(data.defaultNotes || '');
    const logoUrl = data.logoUrl || null;
    console.log('📸 Setting logoUri to:', logoUrl);
    setLogoUri(logoUrl);
  };

  const validateForm = (): boolean => {
    if (!businessName.trim()) {
      Alert.alert('Validation Error', 'Business name is required');
      return false;
    }
    if (!email.trim()) {
      Alert.alert('Validation Error', 'Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return false;
    }
    if (defaultTaxRate && (isNaN(parseFloat(defaultTaxRate)) || parseFloat(defaultTaxRate) < 0)) {
      Alert.alert('Validation Error', 'Tax rate must be a valid number greater than or equal to 0');
      return false;
    }
    if (invoiceNumberSequence && (isNaN(parseInt(invoiceNumberSequence)) || parseInt(invoiceNumberSequence) < 1)) {
      Alert.alert('Validation Error', 'Sequence number must be a valid number greater than or equal to 1');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      
      const updates: BusinessProfileUpdate = {
        businessName,
        businessEmail: email,
        phone: phone || undefined,
        website: website || undefined,
        taxId: taxId || undefined,
        country,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        zip: zip || undefined,
        defaultTaxRate: defaultTaxRate ? parseFloat(defaultTaxRate) : undefined,
        invoiceNumberFormat: invoiceNumberFormat || 'INV-{YYYY}-{SEQ}',
        invoiceNumberSequence: invoiceNumberSequence ? parseInt(invoiceNumberSequence) : 1,
        defaultTerms: defaultTerms || undefined,
        defaultNotes: defaultNotes || undefined,
        logoUri: newLogoUri || undefined,
      };

      await businessProfileService.updateBusinessProfile(updates);
      Alert.alert('Success', 'Business profile updated successfully');
      setNewLogoUri(null); // Clear the new logo URI after successful save
      loadProfile(); // Reload to get updated data
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update business profile');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert('Permission Required', 'Camera and photo library permissions are required to upload a logo');
      return;
    }

    Alert.alert(
      'Upload Logo',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: async () => {
            setImagePickerLoading(true);
            try {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                setNewLogoUri(result.assets[0].uri);
                setLogoUri(result.assets[0].uri);
              }
            } catch (error) {
              console.error('Error picking image from camera:', error);
              Alert.alert('Error', 'Failed to capture image');
            } finally {
              setImagePickerLoading(false);
            }
          },
        },
        {
          text: 'Gallery',
          onPress: async () => {
            setImagePickerLoading(true);
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                setNewLogoUri(result.assets[0].uri);
                setLogoUri(result.assets[0].uri);
              }
            } catch (error) {
              console.error('Error picking image from gallery:', error);
              Alert.alert('Error', 'Failed to select image');
            } finally {
              setImagePickerLoading(false);
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const renderTabButtons = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
        onPress={() => setActiveTab('profile')}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityLabel="Profile"
        accessibilityState={{ selected: activeTab === 'profile' }}
      >
        <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
          Profile
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'preferences' && styles.tabActive]}
        onPress={() => setActiveTab('preferences')}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityLabel="Preferences"
        accessibilityState={{ selected: activeTab === 'preferences' }}
      >
        <Text style={[styles.tabText, activeTab === 'preferences' && styles.tabTextActive]}>
          Preferences
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'appearance' && styles.tabActive]}
        onPress={() => setActiveTab('appearance')}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityLabel="Appearance"
        accessibilityState={{ selected: activeTab === 'appearance' }}
      >
        <Text style={[styles.tabText, activeTab === 'appearance' && styles.tabTextActive]}>
          Appearance
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderProfileTab = () => (
    <View style={styles.tabContent}>
      {/* Logo Upload */}
      <View style={styles.logoSection}>
        <Text style={styles.logoLabel}>Business Logo</Text>
        <TouchableOpacity
          style={styles.logoButton}
          onPress={pickImage}
          activeOpacity={0.7}
          disabled={imagePickerLoading}
          accessibilityRole="button"
          accessibilityLabel={logoUri ? 'Change business logo' : 'Upload business logo'}
          accessibilityState={{ disabled: imagePickerLoading, busy: imagePickerLoading }}
        >
          {logoUri ? (
            <Image 
              key={logoUri} 
              source={{ uri: logoUri }} 
              style={styles.logoImage}
              onError={(error) => console.error('📸 Image load error:', error.nativeEvent)}
              onLoad={() => console.log('📸 Image loaded successfully:', logoUri)}
            />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Feather name="camera" size={24} color={palette.accentText} />
              <Text style={styles.logoPlaceholderSubtext}>Tap to upload</Text>
            </View>
          )}
        </TouchableOpacity>
        {imagePickerLoading && (
          <ActivityIndicator style={styles.logoLoader} color={palette.accent} />
        )}
      </View>

      {/* Business Info */}
      <FormInput
        label="Business Name"
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="Your Business Name"
        required
      />
      <FormInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="contact@yourbusiness.com"
        keyboardType="email-address"
        autoCapitalize="none"
        required
      />
      <FormInput
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="(555) 123-4567"
        keyboardType="phone-pad"
      />
      <FormInput
        label="Website"
        value={website}
        onChangeText={setWebsite}
        placeholder="www.yourbusiness.com"
        keyboardType="url"
        autoCapitalize="none"
      />
      <FormInput
        label="Tax ID / VAT Number"
        value={taxId}
        onChangeText={setTaxId}
        placeholder="12-3456789"
      />
      
      {/* Country Picker */}
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>
          Country <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          onPress={() => setShowCountryPicker(true)}
          style={styles.countryButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Country, ${country || 'not selected'}`}
        >
          <Text style={styles.countryButtonText}>{country || 'Select country'}</Text>
          <Feather name="chevron-right" size={20} color={palette.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Address */}
      <FormInput
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="100 Main Street"
      />
      <FormInput
        label="City"
        value={city}
        onChangeText={setCity}
        placeholder="Anytown"
      />
      <View style={styles.row}>
        <View style={styles.halfWidth}>
          <FormInput
            label="State"
            value={state}
            onChangeText={setState}
            placeholder="ST"
          />
        </View>
        <View style={styles.halfWidth}>
          <FormInput
            label="Zip Code"
            value={zip}
            onChangeText={setZip}
            placeholder="12345"
          />
        </View>
      </View>

      {/* Invoice Settings */}
      <FormInput
        label="Default Tax Rate (%)"
        value={defaultTaxRate}
        onChangeText={setDefaultTaxRate}
        placeholder="7.5"
        keyboardType="decimal-pad"
      />
      <FormInput
        label="Invoice Number Format"
        value={invoiceNumberFormat}
        onChangeText={setInvoiceNumberFormat}
        placeholder="INV-{YYYY}-{SEQ}"
      />
      <Text style={styles.helperText}>
        Use {'{YYYY}'} for year, {'{MM}'} for month, {'{DD}'} for day, {'{SEQ}'} for sequence.{'\n'}
        Example: INV-{'{YYYY}'}-{'{SEQ}'} → INV-2025-001
      </Text>
      <FormInput
        label="Next Sequence Number"
        value={invoiceNumberSequence}
        onChangeText={setInvoiceNumberSequence}
        placeholder="1"
        keyboardType="number-pad"
      />
    </View>
  );

  const renderPreferencesTab = () => (
    <View style={styles.tabContent}>
      <FormInput
        label="Default Payment Terms"
        value={defaultTerms}
        onChangeText={setDefaultTerms}
        placeholder="Payment due within 30 days"
        multiline
        numberOfLines={3}
      />
      <FormInput
        label="Default Notes"
        value={defaultNotes}
        onChangeText={setDefaultNotes}
        placeholder="Thank you for your business!"
        multiline
        numberOfLines={3}
      />
    </View>
  );

  const renderAppearanceTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.comingSoonContainer}>
        <Feather name="sliders" size={32} color={palette.accentText} />
        <Text style={styles.comingSoonTitle}>Theme Customization</Text>
        <Text style={styles.comingSoonText}>
          Custom theme selection coming soon! You’ll be able to personalize your brand colors and appearance.
        </Text>
        {profile?.theme && (
          <View style={styles.currentThemeContainer}>
            <Text style={styles.currentThemeLabel}>Current Theme Colors:</Text>
            <View style={styles.colorRow}>
              <View style={styles.colorSwatch}>
                <View style={[styles.colorBox, { backgroundColor: profile.theme.primary }]} />
                <Text style={styles.colorLabel}>Primary</Text>
              </View>
              <View style={styles.colorSwatch}>
                <View style={[styles.colorBox, { backgroundColor: profile.theme.secondary }]} />
                <Text style={styles.colorLabel}>Secondary</Text>
              </View>
              <View style={styles.colorSwatch}>
                <View style={[styles.colorBox, { backgroundColor: profile.theme.accent }]} />
                <Text style={styles.colorLabel}>Accent</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  if (loading) {
    return <LoadingOverlay visible={true} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {renderTabButtons()}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: insets.bottom }}>
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'preferences' && renderPreferencesTab()}
        {activeTab === 'appearance' && renderAppearanceTab()}
      </ScrollView>

      {/* Save Button */}
      {activeTab !== 'appearance' && (
        <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            activeOpacity={0.7}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save business profile"
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator color={palette.accentForeground} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Country Picker Modal */}
      <CountryPicker
        visible={showCountryPicker}
        onSelect={(selectedCountry) => {
          setCountry(selectedCountry);
          setShowCountryPicker(false);
        }}
        onClose={() => setShowCountryPicker(false)}
        selectedCountry={country}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderBottomWidth: hairline,
    borderBottomColor: palette.separator,
  },
  tab: {
    flex: 1,
    minHeight: control.default,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: palette.accent,
  },
  tabText: {
    ...type.subhead,
    fontWeight: '600',
  },
  tabTextActive: {
    color: palette.accentText,
  },
  scrollView: {
    flex: 1,
  },
  tabContent: {
    padding: space.screen,
    paddingBottom: 100,
  },
  logoSection: {
    marginBottom: space.xxl,
  },
  logoLabel: {
    ...type.footnote,
    color: palette.text,
    fontWeight: '600',
    marginBottom: space.sm,
  },
  logoButton: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.separator,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  logoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.fillMuted,
  },
  logoPlaceholderText: {
    fontSize: 32,
    marginBottom: 4,
  },
  logoPlaceholderSubtext: {
    fontSize: 12,
    color: palette.textSecondary,
  },
  logoLoader: {
    marginTop: 8,
  },
  inputContainer: {
    marginBottom: space.lg,
  },
  inputLabel: {
    ...type.footnote,
    color: palette.text,
    fontWeight: '600',
    marginBottom: space.sm,
  },
  required: {
    color: palette.danger,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: control.default,
    backgroundColor: palette.fillMuted,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  countryButtonText: {
    ...type.callout,
    color: palette.text,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  halfWidth: {
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: -8,
    marginBottom: 16,
    lineHeight: 18,
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  comingSoonIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 14,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  currentThemeContainer: {
    marginTop: 32,
    padding: 20,
    backgroundColor: palette.surface,
    borderRadius: radius.group,
    width: '100%',
  },
  currentThemeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
    marginBottom: 12,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  colorSwatch: {
    alignItems: 'center',
  },
  colorBox: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.separator,
  },
  colorLabel: {
    fontSize: 12,
    color: palette.textSecondary,
  },
  bottomContainer: {
    backgroundColor: palette.surface,
    borderTopWidth: hairline,
    borderTopColor: palette.separator,
    padding: space.lg,
  },
  saveButton: {
    minHeight: control.prominent,
    backgroundColor: palette.accent,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.accentForeground,
  },
});
