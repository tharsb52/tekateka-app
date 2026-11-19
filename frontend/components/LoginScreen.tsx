import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Text, TextInput } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../utils/i18n';
import Ionicons from "@react-native-vector-icons/ionicons";
import { ALL_COUNTRIES, getFlagUrl, Country } from '../utils/countries';

const BG = '#fef3e7';


export default function LoginScreen() {
  const { loginWithCredentials, loginWithPin, signupWithEmail, forgotPassword, resetPassword } = useAuth();
  const router = useRouter();
  // Sub-mode of the credentials tab: 'login' | 'signup' | 'forgot' | 'reset'
  const [credMode, setCredMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  // Signup-only fields
  const [signupEmail, setSignupEmail] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  // Forgot/reset fields
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [credInfo, setCredInfo] = useState<string>('');

  const [selectedCountry, setSelectedCountry] = useState<Country>(ALL_COUNTRIES[0]);
  const [loading, setLoading] = useState(false);

  // QUICK LOGIN — the last account used on this phone only needs its PIN.
  // On another phone the merchant types email + PIN (or email + password).
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [savedUserName, setSavedUserName] = useState<string>('');
  const [quickPin, setQuickPin] = useState('');
  const [quickPinError, setQuickPinError] = useState('');
  const [showFullLogin, setShowFullLogin] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'pin'>('password');
  const [loginPin, setLoginPin] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [email, uid, name] = await Promise.all([
          AsyncStorage.getItem('@tekateka:lastEmail'),
          AsyncStorage.getItem('@tekateka:lastUserId'),
          AsyncStorage.getItem('@tekateka:lastUserName'),
        ]);
        if (!uid) return;
        const localPin = await AsyncStorage.getItem(`@tekateka:${uid}:pin`);
        // Phone-only accounts can no longer sign in by number (security):
        // they must use an email given by the admin.
        if (!email || !localPin) return;
        setSavedEmail(email);
        setSavedUserId(uid);
        setSavedUserName(name || '');
      } catch (e) {
        console.warn('quick login init failed', e);
      }
    })();
  }, []);

  const handleQuickPinSubmit = async () => {
    if (!savedUserId || quickPin.length < 4) {
      setQuickPinError('Entrez votre code PIN à 4 chiffres');
      return;
    }
    setQuickPinError('');
    setLoading(true);
    try {
      await loginWithPin(savedEmail as string, quickPin);
    } catch (e: any) {
      setLoading(false);
      setQuickPin('');
      setQuickPinError(e?.message || 'Erreur de connexion');
    }
  };

  const handleUseOtherAccount = async () => {
    try {
      await AsyncStorage.multiRemove(['@tekateka:lastEmail', '@tekateka:lastPhone', '@tekateka:lastUserId', '@tekateka:lastUserName']);
    } catch {}
    setSavedEmail(null);
    setSavedUserId(null);
    setSavedUserName('');
    setQuickPin('');
    setShowFullLogin(true);
  };

  const showQuickLogin = !!savedUserId && !!savedEmail && !showFullLogin;

  // Credential login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credError, setCredError] = useState('');

  const handleCredentialLogin = async () => {
    setCredError('');
    if (!identifier.trim()) {
      setCredError("Entrez votre email ou nom d'utilisateur");
      return;
    }
    if (loginMethod === 'pin' && loginPin.length < 4) {
      setCredError('Entrez votre code PIN à 4 chiffres');
      return;
    }
    if (loginMethod === 'password' && !password) {
      setCredError('Entrez votre mot de passe');
      return;
    }
    setLoading(true);
    try {
      if (loginMethod === 'pin') {
        await loginWithPin(identifier.trim().toLowerCase(), loginPin);
      } else {
        await loginWithCredentials(identifier.trim(), password);
      }
    } catch (error: any) {
      setCredError(error.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
            <View style={styles.titleRow}>
              <Text style={styles.title}>TekaTeka</Text>
              <Image source={{ uri: getFlagUrl(selectedCountry.iso) }} style={styles.headerFlagImg} />
            </View>
            <Text style={styles.subtitle}>{i18n.t('welcome')}</Text>
          </View>

          {/* QUICK LOGIN — returning user just enters their PIN.
              SAVES THE USER from the Firebase "trop d'essais" lock-out. */}
          {showQuickLogin ? (
            <View style={styles.quickLoginCard}>
              <View style={styles.quickLoginIcon}>
                <Ionicons name="person-circle" size={64} color="#2563eb" />
              </View>
              <Text style={styles.quickLoginHello}>Bon retour{savedUserName ? ',' : '!'}</Text>
              {!!savedUserName && <Text style={styles.quickLoginName}>{savedUserName}</Text>}
              <Text style={styles.quickLoginPhone}>{savedEmail}</Text>

              <Text style={styles.quickLoginLabel}>Entrez votre code PIN à 4 chiffres</Text>
              <TextInput
                testID="quick-pin-input"
                style={styles.quickPinInput}
                value={quickPin}
                onChangeText={(t) => { setQuickPin(t.replace(/\D/g, '').slice(0, 4)); setQuickPinError(''); }}
                keyboardType="number-pad"
                placeholder="••••"
                placeholderTextColor="#cbd5e1"
                maxLength={4}
                secureTextEntry
                autoFocus
              />
              {!!quickPinError && <Text style={styles.quickPinError}>{quickPinError}</Text>}

              <TouchableOpacity
                testID="quick-pin-submit"
                style={[styles.quickLoginBtn, (loading || quickPin.length < 4) && styles.quickLoginBtnDisabled]}
                onPress={handleQuickPinSubmit}
                disabled={loading || quickPin.length < 4}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="log-in" size={20} color="#fff" />
                    <Text style={styles.quickLoginBtnText}>Se connecter</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity testID="quick-use-password" onPress={() => { setShowFullLogin(true); setLoginMethod('password'); setIdentifier(savedEmail || ''); }} style={styles.useOtherBtn}>
                <Text style={styles.useOtherBtnText}>Se connecter avec mon mot de passe</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="quick-use-other" onPress={handleUseOtherAccount} style={styles.useOtherBtn}>
                <Text style={styles.useOtherBtnText}>Utiliser un autre compte</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>

          <View style={styles.storiesSection}>
            <Text style={styles.storiesTitle}>Ils réussissent avec TekaTeka</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesScroll}>
              <View style={styles.storyCard}>
                <Image source={{ uri: 'https://images.unsplash.com/photo-1687422809654-579d81c29d32?w=400' }} style={styles.storyImage} />
                <View style={styles.storyOverlay}>
                  <Text style={styles.storyName}>Marie K.</Text>
                  <Text style={styles.storyQuote}>"Mes bénéfices ont augmenté de 40%!"</Text>
                </View>
              </View>
              <View style={styles.storyCard}>
                <Image source={{ uri: 'https://images.pexels.com/photos/27967669/pexels-photo-27967669.jpeg?auto=compress&cs=tinysrgb&w=400' }} style={styles.storyImage} />
                <View style={styles.storyOverlay}>
                  <Text style={styles.storyName}>Patrick M.</Text>
                  <Text style={styles.storyQuote}>"Je gère mes courses taxi facilement!"</Text>
                </View>
              </View>
              <View style={styles.storyCard}>
                <Image source={{ uri: 'https://images.unsplash.com/photo-1768248559223-cc4ef20363fa?w=400' }} style={styles.storyImage} />
                <View style={styles.storyOverlay}>
                  <Text style={styles.storyName}>Aminata D.</Text>
                  <Text style={styles.storyQuote}>"Ma boutique est mieux organisée!"</Text>
                </View>
              </View>
            </ScrollView>
          </View>

          {credMode === 'login' && (
            <View style={styles.form}>
              <View style={styles.credInfoBox}>
                <Ionicons name="information-circle" size={20} color="#2563eb" />
                <Text style={styles.credInfoText}>
                  Connectez-vous avec votre email et mot de passe — ou Code PIN.
                </Text>
              </View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="login-email-input"
                style={styles.input}
                placeholder="votre@email.com"
                placeholderTextColor="#94a3b8"
                value={identifier}
                onChangeText={(t) => { setIdentifier(t); setCredError(''); }}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <View style={styles.methodToggle}>
                {(['password', 'pin'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`login-method-${m}`}
                    style={[styles.methodBtn, loginMethod === m && styles.methodBtnActive]}
                    onPress={() => { setLoginMethod(m); setCredError(''); }}
                  >
                    <Ionicons name={m === 'pin' ? 'keypad' : 'key'} size={16} color={loginMethod === m ? '#fff' : '#2563eb'} />
                    <Text style={[styles.methodBtnText, loginMethod === m && styles.methodBtnTextActive]}>
                      {m === 'pin' ? 'Code PIN' : 'Mot de passe'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {loginMethod === 'pin' ? (
                <>
                  <Text style={[styles.label, { marginTop: 12 }]}>Code PIN</Text>
                  <TextInput
                    testID="login-pin-input"
                    style={styles.input}
                    placeholder="••••"
                    placeholderTextColor="#94a3b8"
                    value={loginPin}
                    onChangeText={(t) => { setLoginPin(t.replace(/\D/g, '').slice(0, 4)); setCredError(''); }}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                  />
                </>
              ) : (
                <>
              <Text style={[styles.label, { marginTop: 12 }]}>Mot de passe</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  testID="login-password-input"
                  style={styles.passwordInput}
                  placeholder="Mot de passe"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={(t) => { setPassword(t); setCredError(''); }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
                </>
              )}
              {credError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#dc2626" />
                  <Text style={styles.errorText}>{credError}</Text>
                </View>
              ) : null}
              <TouchableOpacity testID="login-submit-button" style={[styles.button, loading && styles.buttonDisabled]} onPress={handleCredentialLogin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Se connecter</Text>}
              </TouchableOpacity>

              {/* Sign up + forgot password links */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                <TouchableOpacity onPress={() => { setCredMode('signup'); setCredError(''); setCredInfo(''); }}>
                  <Text style={{ color: '#2563eb', fontWeight: '600' }}>Créer un compte</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setCredMode('forgot'); setCredError(''); setCredInfo(''); setForgotEmail(identifier); }}>
                  <Text style={{ color: '#2563eb', fontWeight: '600' }}>Mot de passe oublié ?</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {credMode === 'signup' && (
            <View style={styles.form}>
              <View style={styles.credInfoBox}>
                <Ionicons name="person-add" size={20} color="#2563eb" />
                <Text style={styles.credInfoText}>Créez votre compte TekaTeka en 10 secondes.</Text>
              </View>
              <Text style={styles.label}>Nom (optionnel)</Text>
              <TextInput style={styles.input} placeholder="Votre nom" placeholderTextColor="#94a3b8" value={signupName} onChangeText={setSignupName} />
              <Text style={[styles.label, { marginTop: 12 }]}>Email</Text>
              <TextInput style={styles.input} placeholder="votre@email.com" placeholderTextColor="#94a3b8" value={signupEmail} onChangeText={setSignupEmail} autoCapitalize="none" keyboardType="email-address" />
              <Text style={[styles.label, { marginTop: 12 }]}>Mot de passe (min. 6 caractères)</Text>
              <View style={styles.passwordRow}>
                <TextInput style={styles.passwordInput} placeholder="Mot de passe" placeholderTextColor="#94a3b8" value={signupPassword} onChangeText={setSignupPassword} secureTextEntry={!showPassword} />
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              {credError ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color="#dc2626" /><Text style={styles.errorText}>{credError}</Text></View> : null}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                disabled={loading}
                onPress={async () => {
                  setCredError('');
                  if (!signupEmail.includes('@')) { setCredError('Email invalide'); return; }
                  if (signupPassword.length < 6) { setCredError('Mot de passe trop court (min. 6 caractères)'); return; }
                  setLoading(true);
                  try {
                    await signupWithEmail(signupEmail.trim().toLowerCase(), signupPassword, signupName.trim() || undefined);
                    // AuthContext will navigate to dashboard automatically
                  } catch (e: any) {
                    setCredError(e.message || 'Échec de l\'inscription');
                  } finally { setLoading(false); }
                }}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Créer mon compte</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCredMode('login'); setCredError(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ color: '#64748b' }}>← Retour à la connexion</Text>
              </TouchableOpacity>
            </View>
          )}

          {credMode === 'forgot' && (
            <View style={styles.form}>
              <View style={styles.credInfoBox}>
                <Ionicons name="key" size={20} color="#2563eb" />
                <Text style={styles.credInfoText}>Nous vous enverrons un code à 6 chiffres par email.</Text>
              </View>
              <Text style={styles.label}>Email du compte</Text>
              <TextInput style={styles.input} placeholder="votre@email.com" placeholderTextColor="#94a3b8" value={forgotEmail} onChangeText={setForgotEmail} autoCapitalize="none" keyboardType="email-address" />
              {credInfo ? <View style={[styles.errorBox, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}><Ionicons name="checkmark-circle" size={16} color="#16a34a" /><Text style={[styles.errorText, { color: '#15803d' }]}>{credInfo}</Text></View> : null}
              {credError ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color="#dc2626" /><Text style={styles.errorText}>{credError}</Text></View> : null}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                disabled={loading}
                onPress={async () => {
                  setCredError(''); setCredInfo('');
                  if (!forgotEmail.includes('@')) { setCredError('Email invalide'); return; }
                  setLoading(true);
                  try {
                    await forgotPassword(forgotEmail.trim().toLowerCase());
                    setCredInfo('Si un compte existe pour cet email, un code vient d\'être envoyé. Vérifiez votre boîte (et les spams).');
                    setCredMode('reset');
                  } catch (e: any) {
                    setCredError(e.message || 'Erreur');
                  } finally { setLoading(false); }
                }}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Envoyer le code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCredMode('login'); setCredError(''); setCredInfo(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ color: '#64748b' }}>← Retour à la connexion</Text>
              </TouchableOpacity>
            </View>
          )}

          {credMode === 'reset' && (
            <View style={styles.form}>
              <View style={styles.credInfoBox}>
                <Ionicons name="lock-closed" size={20} color="#2563eb" />
                <Text style={styles.credInfoText}>Entrez le code reçu par email et choisissez un nouveau mot de passe.</Text>
              </View>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={forgotEmail} onChangeText={setForgotEmail} autoCapitalize="none" keyboardType="email-address" />
              <Text style={[styles.label, { marginTop: 12 }]}>Code à 6 chiffres</Text>
              <TextInput style={styles.input} placeholder="123456" placeholderTextColor="#94a3b8" value={resetCode} onChangeText={setResetCode} keyboardType="number-pad" maxLength={6} />
              <Text style={[styles.label, { marginTop: 12 }]}>Nouveau mot de passe (min. 6)</Text>
              <TextInput style={styles.input} placeholder="Nouveau mot de passe" placeholderTextColor="#94a3b8" value={resetNewPassword} onChangeText={setResetNewPassword} secureTextEntry />
              {credInfo ? <View style={[styles.errorBox, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}><Ionicons name="checkmark-circle" size={16} color="#16a34a" /><Text style={[styles.errorText, { color: '#15803d' }]}>{credInfo}</Text></View> : null}
              {credError ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color="#dc2626" /><Text style={styles.errorText}>{credError}</Text></View> : null}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                disabled={loading}
                onPress={async () => {
                  setCredError(''); setCredInfo('');
                  if (resetCode.length < 4) { setCredError('Code invalide'); return; }
                  if (resetNewPassword.length < 6) { setCredError('Mot de passe trop court'); return; }
                  setLoading(true);
                  try {
                    await resetPassword(forgotEmail.trim().toLowerCase(), resetCode.trim(), resetNewPassword);
                    setCredInfo('Mot de passe mis à jour ! Connectez-vous avec votre nouveau mot de passe.');
                    setPassword(resetNewPassword);
                    setIdentifier(forgotEmail.trim().toLowerCase());
                    setResetCode(''); setResetNewPassword('');
                    setTimeout(() => setCredMode('login'), 1500);
                  } catch (e: any) {
                    setCredError(e.message || 'Code invalide ou expiré');
                  } finally { setLoading(false); }
                }}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Réinitialiser</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCredMode('login'); setCredError(''); setCredInfo(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
                <Text style={{ color: '#64748b' }}>← Retour à la connexion</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={{ marginTop: 20, paddingVertical: 14, alignItems: 'center' }} onPress={() => router.push('/ambassador')}>
            <Text style={{ fontSize: 14, color: '#94a3b8' }}>Vous êtes ambassadeur ?{' '}
              <Text style={{ color: '#2563eb', fontWeight: '600' }}>Se connecter ici</Text>
            </Text>
          </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  methodToggle: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#fff',
  },
  methodBtnActive: {
    backgroundColor: '#2563eb',
  },
  methodBtnText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 14,
  },
  methodBtnTextActive: {
    color: '#fff',
  },
  quickLoginCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, marginBottom: 24, borderRadius: 18, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  quickLoginIcon: { marginBottom: 8 },
  quickLoginHello: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  quickLoginName: { fontSize: 16, fontWeight: '700', color: '#2563eb', marginTop: 2 },
  quickLoginPhone: { fontSize: 13, color: '#64748b', marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  quickLoginLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 22, marginBottom: 8 },
  quickPinInput: { width: 200, height: 60, backgroundColor: '#f1f5f9', borderRadius: 14, textAlign: 'center', fontSize: 32, fontWeight: '700', letterSpacing: 16, color: '#0f172a', borderWidth: 2, borderColor: '#e2e8f0' },
  quickPinError: { fontSize: 12, color: '#dc2626', marginTop: 8, fontWeight: '600' },
  quickLoginBtn: { marginTop: 18, width: '100%', height: 52, borderRadius: 14, backgroundColor: '#2563eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quickLoginBtnDisabled: { backgroundColor: '#94a3b8' },
  quickLoginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  useOtherBtn: { marginTop: 12, paddingVertical: 8 },
  useOtherBtnText: { fontSize: 13, color: '#64748b', textDecorationLine: 'underline' },
  safeArea: { flex: 1, backgroundColor: BG },
  container: { flex: 1, backgroundColor: BG },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoImage: { width: 100, height: 100, resizeMode: 'contain' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1e293b' },
  headerFlagImg: { width: 28, height: 20, borderRadius: 3, resizeMode: 'cover' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 4 },

  storiesSection: { marginBottom: 16 },
  storiesTitle: { fontSize: 15, fontWeight: '700', color: '#334155', marginBottom: 10, textAlign: 'center' },
  storiesScroll: {},
  storyCard: { width: 160, height: 100, borderRadius: 14, marginRight: 10, overflow: 'hidden' },
  storyImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  storyOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 6 },
  storyName: { fontSize: 12, fontWeight: '700', color: '#fff' },
  storyQuote: { fontSize: 10, color: '#e2e8f0', fontStyle: 'italic' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  tabActive: { backgroundColor: '#eff6ff' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#2563eb' },

  form: { gap: 14 },
  label: { fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 4 },

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

  input: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, fontSize: 16, color: '#1e293b' },
  otpInput: {
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0',
    borderRadius: 12, padding: 16, fontSize: 28, fontWeight: '700',
    color: '#1e293b', textAlign: 'center', letterSpacing: 10,
  },

  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 12 },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: '#1e293b' },
  eyeButton: { padding: 14 },

  credInfoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  credInfoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 18 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#fca5a5',
  },
  errorText: { flex: 1, fontSize: 14, color: '#dc2626' },

  button: {
    backgroundColor: '#2563eb', padding: 18, borderRadius: 12,
    alignItems: 'center', marginTop: 4, minHeight: 56, justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
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
  countryItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, marginBottom: 4 },
  countryItemSelected: { backgroundColor: '#eff6ff' },
  countryItemFlagImg: { width: 36, height: 24, borderRadius: 3, resizeMode: 'cover' },
  countryItemName: { fontSize: 16, color: '#1e293b', fontWeight: '500' },
  countryItemNameSelected: { fontWeight: '700', color: '#2563eb' },
  countryItemCode: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
});
