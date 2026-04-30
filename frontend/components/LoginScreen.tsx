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
import { useRouter } from 'expo-router';
import i18n from '../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { sendOTP, verifyOTP } from '../services/otpService';
import { ALL_COUNTRIES, searchCountries, getFlagUrl, Country } from '../utils/countries';

const BG = '#fef3e7';

type LoginTab = 'phone' | 'credentials';

export default function LoginScreen() {
  const { login, loginWithCredentials } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LoginTab>('phone');

  // Phone login state
  const [localNumber, setLocalNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(ALL_COUNTRIES[0]);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mockOtp, setMockOtp] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Credential login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credError, setCredError] = useState('');
  const [loginError, setLoginError] = useState('');

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
        if (result.otp) setMockOtp(result.otp);
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
      setLoginError('Entrez le code à 4 chiffres');
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      const result = await verifyOTP(fullPhoneNumber, otp);
      if (result.success) {
        await login(fullPhoneNumber, otp);
      } else {
        setLoginError(result.message || 'Code incorrect');
      }
    } catch (error: any) {
      console.error('Verify/Login error:', error);
      setLoginError(error.message || 'Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialLogin = async () => {
    setCredError('');
    if (!identifier.trim()) {
      setCredError('Entrez votre email ou nom d\'utilisateur');
      return;
    }
    if (!password) {
      setCredError('Entrez votre mot de passe');
      return;
    }
    setLoading(true);
    try {
      await loginWithCredentials(identifier.trim(), password);
    } catch (error: any) {
      setCredError(error.message || 'Identifiants incorrects');
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.header}>
            <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
            <View style={styles.titleRow}>
              <Text style={styles.title}>TekaTeka</Text>
              <Image source={{ uri: getFlagUrl(selectedCountry.iso) }} style={styles.headerFlagImg} />
            </View>
            <Text style={styles.subtitle}>{i18n.t('welcome')}</Text>
          </View>

          {/* Success Stories with Photos */}
          <View style={styles.storiesSection}>
            <Text style={styles.storiesTitle}>Ils réussissent avec TekaTeka</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesScroll}>
              <View style={styles.storyCard}>
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1687422809654-579d81c29d32?w=400' }}
                  style={styles.storyImage}
                />
                <View style={styles.storyOverlay}>
                  <Text style={styles.storyName}>Marie K.</Text>
                  <Text style={styles.storyQuote}>"Mes bénéfices ont augmenté de 40%!"</Text>
                </View>
              </View>
              <View style={styles.storyCard}>
                <Image
                  source={{ uri: 'https://images.pexels.com/photos/27967669/pexels-photo-27967669.jpeg?auto=compress&cs=tinysrgb&w=400' }}
                  style={styles.storyImage}
                />
                <View style={styles.storyOverlay}>
                  <Text style={styles.storyName}>Patrick M.</Text>
                  <Text style={styles.storyQuote}>"Je gère mes courses taxi facilement!"</Text>
                </View>
              </View>
              <View style={styles.storyCard}>
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1768248559223-cc4ef20363fa?w=400' }}
                  style={styles.storyImage}
                />
                <View style={styles.storyOverlay}>
                  <Text style={styles.storyName}>Aminata D.</Text>
                  <Text style={styles.storyQuote}>"Ma boutique est mieux organisée!"</Text>
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'phone' && styles.tabActive]}
              onPress={() => setActiveTab('phone')}
            >
              <Ionicons name="call" size={18} color={activeTab === 'phone' ? '#2563eb' : '#94a3b8'} />
              <Text style={[styles.tabText, activeTab === 'phone' && styles.tabTextActive]}>Connexion Téléphone</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'credentials' && styles.tabActive]}
              onPress={() => setActiveTab('credentials')}
            >
              <Ionicons name="mail" size={18} color={activeTab === 'credentials' ? '#2563eb' : '#94a3b8'} />
              <Text style={[styles.tabText, activeTab === 'credentials' && styles.tabTextActive]}>Connexion Mail</Text>
            </TouchableOpacity>
          </View>

          {/* ========== PHONE TAB ========== */}
          {activeTab === 'phone' && (
            <View style={styles.form}>
              {!otpSent ? (
                <>
                  <Text style={styles.label}>{i18n.t('phoneNumber')}</Text>
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
                  {localNumber.length > 3 && (
                    <Text style={styles.previewNumber}>+{fullPhoneNumber}</Text>
                  )}
                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleSendOTP}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t('sendOTP')}</Text>}
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
                    style={styles.otpInput}
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
                  {loginError ? (
                    <View style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <Text style={{ color: '#dc2626', fontSize: 14, textAlign: 'center' }}>{loginError}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleVerifyOTP}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t('verifyOTP')}</Text>}
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
          )}

          {/* ========== CREDENTIALS TAB ========== */}
          {activeTab === 'credentials' && (
            <View style={styles.form}>
              <View style={styles.credInfoBox}>
                <Ionicons name="information-circle" size={20} color="#2563eb" />
                <Text style={styles.credInfoText}>
                  Connectez-vous avec les identifiants fournis par le propriétaire du compte.
                </Text>
              </View>

              <Text style={styles.label}>Email ou nom d'utilisateur</Text>
              <TextInput
                style={styles.input}
                placeholder="ex: collegue@email.com"
                placeholderTextColor="#94a3b8"
                value={identifier}
                onChangeText={(t) => { setIdentifier(t); setCredError(''); }}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Mot de passe</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Mot de passe"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={(t) => { setPassword(t); setCredError(''); }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              {credError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#dc2626" />
                  <Text style={styles.errorText}>{credError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleCredentialLogin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Se connecter</Text>}
              </TouchableOpacity>
            </View>
          )}
          
          {/* Ambassador Link */}
          <TouchableOpacity style={{ marginTop: 20, paddingVertical: 14, alignItems: 'center' }} onPress={() => router.push('/ambassador')}>
            <Text style={{ fontSize: 14, color: '#94a3b8' }}>Vous êtes ambassadeur ?{' '}
              <Text style={{ color: '#2563eb', fontWeight: '600' }}>Se connecter ici</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir le pays</Text>
              <TouchableOpacity onPress={() => { setShowCountryPicker(false); setSearchQuery(''); }}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un pays ou indicatif..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.countryList} keyboardShouldPersistTaps="handled">
              {searchCountries(searchQuery).map((country, index) => (
                <TouchableOpacity
                  key={`${country.iso}-${index}`}
                  style={[
                    styles.countryItem,
                    selectedCountry.iso === country.iso && selectedCountry.code === country.code && styles.countryItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(country);
                    setShowCountryPicker(false);
                    setSearchQuery('');
                  }}
                >
                  <Image source={{ uri: getFlagUrl(country.iso) }} style={styles.countryItemFlagImg} />
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.countryItemName,
                      selectedCountry.iso === country.iso && selectedCountry.code === country.code && styles.countryItemNameSelected,
                    ]}>
                      {country.name}
                    </Text>
                    <Text style={styles.countryItemCode}>+{country.code}</Text>
                  </View>
                  {selectedCountry.iso === country.iso && selectedCountry.code === country.code && (
                    <Ionicons name="checkmark-circle" size={22} color="#2563eb" />
                  )}
                </TouchableOpacity>
              ))}
              {searchCountries(searchQuery).length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="globe-outline" size={48} color="#cbd5e1" />
                  <Text style={{ color: '#94a3b8', fontSize: 16, marginTop: 12 }}>Aucun resultat</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: BG },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoImage: { width: 100, height: 100, resizeMode: 'contain' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1e293b' },
  headerFlagImg: { width: 28, height: 20, borderRadius: 3, resizeMode: 'cover' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 4 },

  // Stories section
  storiesSection: {
    marginBottom: 16,
  },
  storiesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
    textAlign: 'center',
  },
  storiesScroll: {},
  storyCard: {
    width: 160,
    height: 100,
    borderRadius: 14,
    marginRight: 10,
    overflow: 'hidden',
  },
  storyImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  storyOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  storyName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  storyQuote: {
    fontSize: 10,
    color: '#e2e8f0',
    fontStyle: 'italic',
  },

  // Tab switcher
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#eff6ff',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#2563eb',
  },

  form: { gap: 14 },
  label: { fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 4 },

  // Phone input
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, minWidth: 110,
  },
  countryFlagImg: { width: 24, height: 16, borderRadius: 2, resizeMode: 'cover' },
  countryCode: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  phoneInput: {
    flex: 1, backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '600', color: '#1e293b',
  },
  previewNumber: { fontSize: 14, color: '#2563eb', fontWeight: '600', textAlign: 'center', marginTop: -4 },

  input: {
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 16, fontSize: 16, color: '#1e293b',
  },
  otpInput: {
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 16, fontSize: 24, fontWeight: '700',
    color: '#1e293b', textAlign: 'center', letterSpacing: 8,
  },

  // Password
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 12,
  },
  passwordInput: {
    flex: 1, padding: 16, fontSize: 16, color: '#1e293b',
  },
  eyeButton: {
    padding: 14,
  },

  // Credential info
  credInfoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  credInfoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 18 },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#fca5a5',
  },
  errorText: { flex: 1, fontSize: 14, color: '#dc2626' },

  // Buttons
  button: {
    backgroundColor: '#2563eb', padding: 18, borderRadius: 12,
    alignItems: 'center', marginTop: 4, minHeight: 56, justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  phoneDisplay: { fontSize: 20, fontWeight: '600', color: '#2563eb', textAlign: 'center' },
  phoneDisplayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },

  mockOtpBox: {
    backgroundColor: '#fef3c7', padding: 16, borderRadius: 8,
    borderWidth: 1, borderColor: '#fbbf24', alignItems: 'center',
  },
  mockOtpLabel: { fontSize: 12, color: '#92400e', marginBottom: 4 },
  mockOtpText: { fontSize: 24, fontWeight: 'bold', color: '#92400e', letterSpacing: 4 },

  backButton: {
    padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  backButtonText: { color: '#64748b', fontSize: 16 },

  // Country picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 12, backgroundColor: '#f1f5f9',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 16, color: '#1e293b', padding: 0 },
  countryList: { padding: 12 },
  countryItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 12, marginBottom: 4,
  },
  countryItemSelected: { backgroundColor: '#eff6ff' },
  countryItemFlagImg: { width: 36, height: 24, borderRadius: 3, resizeMode: 'cover' },
  countryItemName: { fontSize: 16, color: '#1e293b', fontWeight: '500' },
  countryItemNameSelected: { fontWeight: '700', color: '#2563eb' },
  countryItemCode: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
});
