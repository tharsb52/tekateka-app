import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import i18n from '../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { sendOTP, verifyOTP, getOTPProviderInfo } from '../services/otpService';

const BG = '#fef3e7';

// Flag image URL from CDN (works on all platforms)
const getFlagUrl = (iso: string) =>
  `https://flagcdn.com/w80/${iso.toLowerCase()}.png`;

// Country list for the picker (iso = 2-letter country code for flag CDN)
const COUNTRIES = [
  { code: '243', iso: 'cd', name: 'RD Congo' },
  { code: '237', iso: 'cm', name: 'Cameroun' },
  { code: '225', iso: 'ci', name: "Côte d'Ivoire" },
  { code: '221', iso: 'sn', name: 'Sénégal' },
  { code: '254', iso: 'ke', name: 'Kenya' },
  { code: '255', iso: 'tz', name: 'Tanzanie' },
  { code: '256', iso: 'ug', name: 'Ouganda' },
  { code: '250', iso: 'rw', name: 'Rwanda' },
  { code: '257', iso: 'bi', name: 'Burundi' },
  { code: '234', iso: 'ng', name: 'Nigéria' },
  { code: '233', iso: 'gh', name: 'Ghana' },
  { code: '228', iso: 'tg', name: 'Togo' },
  { code: '229', iso: 'bj', name: 'Bénin' },
  { code: '226', iso: 'bf', name: 'Burkina Faso' },
  { code: '223', iso: 'ml', name: 'Mali' },
  { code: '242', iso: 'cg', name: 'Congo' },
  { code: '241', iso: 'ga', name: 'Gabon' },
  { code: '235', iso: 'td', name: 'Tchad' },
  { code: '236', iso: 'cf', name: 'Centrafrique' },
  { code: '33', iso: 'fr', name: 'France' },
  { code: '32', iso: 'be', name: 'Belgique' },
  { code: '1', iso: 'us', name: 'USA' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [localNumber, setLocalNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]); // Default: DRC
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mockOtp, setMockOtp] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const otpInfo = getOTPProviderInfo();

  // Full phone number = country code + local number
  const fullPhoneNumber = selectedCountry.code + localNumber.replace(/^0+/, '');

  const handleSendOTP = async () => {
    if (localNumber.length < 6) {
      Alert.alert(i18n.t('error'), 'Veuillez entrer un numéro valide');
      return;
    }

    setLoading(true);
    try {
      const result = await sendOTP(fullPhoneNumber);

      if (result.success) {
        setOtpSent(true);
        if (result.otp) {
          setMockOtp(result.otp);
        }
      } else {
        Alert.alert(i18n.t('error'), result.message);
      }
    } catch (error) {
      Alert.alert(i18n.t('error'), "Échec de l'envoi du code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 4) {
      Alert.alert(i18n.t('error'), 'Entrez le code à 4 chiffres');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOTP(fullPhoneNumber, otp);

      if (result.success) {
        await login(fullPhoneNumber, otp);
      } else {
        Alert.alert(i18n.t('error'), result.message);
      }
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Vérification échouée');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Logo + App name + selected country flag */}
          <View style={styles.header}>
            <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
            <View style={styles.titleRow}>
              <Text style={styles.title}>TekaTeka</Text>
              <Image source={{ uri: getFlagUrl(selectedCountry.iso) }} style={styles.headerFlagImg} />
            </View>
            <Text style={styles.subtitle}>{i18n.t('welcome')}</Text>
          </View>

          <View style={styles.form}>
            {!otpSent ? (
              <>
                <Text style={styles.label}>{i18n.t('phoneNumber')}</Text>

                {/* Phone input with country selector */}
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={styles.countryButton}
                    onPress={() => setShowCountryPicker(true)}
                  >
                    <Image source={{ uri: getFlagUrl(selectedCountry.iso) }} style={styles.countryFlagImg} />
                    <Text style={styles.countryCode}>+{selectedCountry.code}</Text>
                    <Ionicons name="chevron-down" size={14} color="#64748b" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Numéro local"
                    placeholderTextColor="#94a3b8"
                    value={localNumber}
                    onChangeText={setLocalNumber}
                    keyboardType="phone-pad"
                    maxLength={12}
                    autoFocus
                  />
                </View>

                {/* Preview full number */}
                {localNumber.length > 3 && (
                  <Text style={styles.previewNumber}>+{fullPhoneNumber}</Text>
                )}

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSendOTP}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{i18n.t('sendOTP')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>{i18n.t('enterOTP')}</Text>
                <View style={styles.phoneDisplayRow}>
                  <Image source={{ uri: getFlagUrl(selectedCountry.iso) }} style={styles.countryFlagImg} />
                  <Text style={styles.phoneDisplay}>+{fullPhoneNumber}</Text>
                </View>
                
                <TextInput
                  style={styles.input}
                  placeholder="0000"
                  placeholderTextColor="#94a3b8"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={4}
                  autoFocus
                />
                
                {mockOtp ? (
                  <View style={styles.mockOtpBox}>
                    <Text style={styles.mockOtpLabel}>Code de vérification :</Text>
                    <Text style={styles.mockOtpText}>{mockOtp}</Text>
                  </View>
                ) : null}
                
                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{i18n.t('verifyOTP')}</Text>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => { setOtpSent(false); setOtp(''); setMockOtp(''); }}
                >
                  <Ionicons name="arrow-back" size={16} color="#64748b" />
                  <Text style={styles.backButtonText}>Changer de numéro</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir le pays</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.countryList}>
              {COUNTRIES.map((country) => (
                <TouchableOpacity
                  key={country.code}
                  style={[
                    styles.countryItem,
                    selectedCountry.code === country.code && styles.countryItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(country);
                    setShowCountryPicker(false);
                  }}
                >
                  <Image source={{ uri: getFlagUrl(country.iso) }} style={styles.countryItemFlagImg} />
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.countryItemName,
                      selectedCountry.code === country.code && styles.countryItemNameSelected,
                    ]}>
                      {country.name}
                    </Text>
                    <Text style={styles.countryItemCode}>+{country.code}</Text>
                  </View>
                  {selectedCountry.code === country.code && (
                    <Ionicons name="checkmark-circle" size={22} color="#2563eb" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerFlagImg: {
    width: 32,
    height: 22,
    borderRadius: 3,
    resizeMode: 'cover',
  },
  subtitle: {
    fontSize: 18,
    color: '#64748b',
    marginTop: 6,
  },
  form: {
    gap: 14,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  // Phone input row
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minWidth: 110,
  },
  countryFlagImg: {
    width: 24,
    height: 16,
    borderRadius: 2,
    resizeMode: 'cover',
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  previewNumber: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: -4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  phoneDisplay: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
  },
  phoneDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  mockOtpBox: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
    alignItems: 'center',
  },
  mockOtpLabel: {
    fontSize: 12,
    color: '#92400e',
    marginBottom: 4,
  },
  mockOtpText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#92400e',
    letterSpacing: 4,
  },
  backButton: {
    padding: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 16,
  },
  // Country picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  countryList: {
    padding: 12,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  countryItemSelected: {
    backgroundColor: '#eff6ff',
  },
  countryItemFlagImg: {
    width: 36,
    height: 24,
    borderRadius: 3,
    resizeMode: 'cover',
  },
  countryItemName: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  countryItemNameSelected: {
    fontWeight: '700',
    color: '#2563eb',
  },
  countryItemCode: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
});
