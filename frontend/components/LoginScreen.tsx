import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Keyboard,
  EmitterSubscription,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { ALL_COUNTRIES, searchCountries, getFlagUrl, Country } from '../utils/countries';

// ===========================================================================
// NATIVE FIREBASE AUTH (no WebView, no visible reCAPTCHA)
// ---------------------------------------------------------------------------
// We use @react-native-firebase/auth + Play Integrity (configured in the
// Firebase Console). On Android, this triggers a silent device-attestation
// challenge that is INVISIBLE to the user. No image puzzle. No "I'm not a
// robot" checkbox. No WebView.
//
// IMPORTANT: This module is ONLY available in a custom EAS build (it requires
// native code). It does NOT work in Expo Go, nor on web. We require() it
// behind a Platform guard so the web bundle keeps compiling.
// ===========================================================================
type ConfirmationResult = {
  confirm: (code: string) => Promise<any>;
  verificationId?: string;
};

let nativeAuth: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nativeAuth = require('@react-native-firebase/auth').default;
  } catch (e) {
    console.warn('[Firebase] native auth not available:', e);
  }
}

const BG = '#fef3e7';

type LoginTab = 'phone' | 'credentials';

export default function LoginScreen() {
  const { login, loginWithCredentials, quickLogin, signupWithEmail, forgotPassword, resetPassword } = useAuth();
  const router = useRouter();
  // June 2026: default to the EMAIL/PASSWORD tab. Firebase Phone Auth is now
  // optional (legacy) — too many SMS bugs in Africa/India + reCAPTCHA issues.
  // Users can still toggle to the phone tab if they prefer.
  const [activeTab, setActiveTab] = useState<LoginTab>('credentials');
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

  // Phone login state
  const [localNumber, setLocalNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(ALL_COUNTRIES[0]);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedNeedsRetry, setVerifiedNeedsRetry] = useState(false);

  // Holds the Firebase confirmation object returned by signInWithPhoneNumber.
  // We .confirm(otp) on it to complete sign-in.
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  // True while we're in the middle of a phone-auth flow (between sending the
  // SMS and either the user typing the code or Firebase auto-retrieving it).
  // Used by the onAuthStateChanged listener below to decide whether a silent
  // auto-sign-in (instant verification on Android) should immediately push the
  // user to the backend login step.
  const phoneFlowActiveRef = useRef<boolean>(false);

  // CRITICAL FIX (June 2026): On Android, Firebase auto-verifies the SMS via
  // the SMS Retriever API and silently signs the user in BEFORE they type the
  // code. The manual `confirm(otp)` then fails with `code-expired` because
  // the verificationId was already consumed internally.
  //
  // We listen to onAuthStateChanged here and, if a phone-auth flow is active
  // when a user becomes signed in, we proceed directly to the backend login
  // instead of waiting for the manual code entry.
  useEffect(() => {
    if (!nativeAuth) return;
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = nativeAuth().onAuthStateChanged((fbUser: any) => {
        if (fbUser && phoneFlowActiveRef.current) {
          console.log('[Firebase Native] auto-sign-in detected, completing login', fbUser.uid);
          phoneFlowActiveRef.current = false;
          // Clear the manual confirmation -- it would now fail with code-expired
          confirmationRef.current = null;
          setOtp('');
          // Proceed to backend login
          attemptBackendLogin();
        }
      });
    } catch (e) {
      console.warn('onAuthStateChanged setup failed', e);
    }
    return () => { try { unsubscribe?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QUICK LOGIN — returning user enters a 4-digit PIN, no SMS at all.
  // Used ONLY after at least one successful Firebase sign-in on this device.
  // A new user / new device must still go through the full Firebase phone flow.
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [savedUserName, setSavedUserName] = useState<string>('');
  const [quickPin, setQuickPin] = useState('');
  const [quickPinError, setQuickPinError] = useState('');
  const [showFullLogin, setShowFullLogin] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [phone, uid, name] = await Promise.all([
          AsyncStorage.getItem('@tekateka:lastPhone'),
          AsyncStorage.getItem('@tekateka:lastUserId'),
          AsyncStorage.getItem('@tekateka:lastUserName'),
        ]);
        if (phone && uid) {
          const savedPinForUser = await AsyncStorage.getItem(`@tekateka:${uid}:pin`);
          if (savedPinForUser) {
            setSavedPhone(phone);
            setSavedUserId(uid);
            setSavedUserName(name || '');
            const cc = ALL_COUNTRIES.find(c => phone.startsWith('+' + c.code));
            if (cc) {
              setSelectedCountry(cc);
              setLocalNumber(phone.replace('+' + cc.code, ''));
            }
          }
        }
      } catch (e) {
        console.warn('quick login init failed', e);
      }
    })();
  }, []);

  const handleQuickPinSubmit = async () => {
    if (!savedPhone || !savedUserId || quickPin.length < 4) {
      setQuickPinError('Entrez votre code PIN à 4 chiffres');
      return;
    }
    setQuickPinError('');
    try {
      const storedPin = await AsyncStorage.getItem(`@tekateka:${savedUserId}:pin`);
      if (!storedPin) {
        setQuickPinError("PIN introuvable. Utilisez 'Se connecter avec mon numéro'.");
        return;
      }
      if (storedPin !== quickPin) {
        setQuickPinError('Code PIN incorrect.');
        setQuickPin('');
        return;
      }
      setLoading(true);
      await quickLogin(savedPhone);
    } catch (e: any) {
      setLoading(false);
      setQuickPinError(e?.message || 'Erreur de connexion');
    }
  };

  const handleUseOtherAccount = async () => {
    try {
      await AsyncStorage.multiRemove(['@tekateka:lastPhone', '@tekateka:lastUserId', '@tekateka:lastUserName']);
    } catch {}
    setSavedPhone(null);
    setSavedUserId(null);
    setSavedUserName('');
    setQuickPin('');
    setShowFullLogin(true);
  };

  const showQuickLogin = savedPhone && savedUserId && !showFullLogin;

  // Track keyboard height (used for the country picker modal)
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub: EmitterSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub: EmitterSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Credential login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credError, setCredError] = useState('');
  const [loginError, setLoginError] = useState('');

  const fullPhoneNumber = '+' + selectedCountry.code + localNumber.replace(/^0+/, '');

  // Translate a Firebase auth error code into a friendly French message.
  const friendlyFirebaseError = (err: any): string => {
    const code = (err?.code || '').toString();
    const msg = (err?.message || '').toString();
    if (code.includes('too-many-requests') || msg.toLowerCase().includes('too-many')) {
      return "Trop d'essais consécutifs. Attendez 60 secondes et réessayez — vous n'êtes pas bloqué.";
    }
    if (code.includes('invalid-phone-number')) {
      return 'Numéro de téléphone invalide. Vérifiez l\'indicatif et le num\u00e9ro.';
    }
    if (code.includes('quota-exceeded')) {
      return 'Quota SMS dépassé pour aujourd\'hui. Réessayez demain.';
    }
    if (code.includes('network')) {
      return 'Erreur réseau. Vérifiez votre connexion 4G/WiFi.';
    }
    if (code.includes('app-not-authorized') || code.includes('missing-client-identifier')) {
      return 'Configuration Firebase manquante. Une nouvelle version de l\'app est requise.';
    }
    return msg || 'Erreur lors de la vérification.';
  };

  // Attempt backend login with retry — keeps Firebase verification intact on failure
  const attemptBackendLogin = async () => {
    setLoading(true);
    setLoginError('');
    setVerifiedNeedsRetry(false);
    try {
      await login(fullPhoneNumber, 'firebase-verified');
      // AuthContext will navigate to dashboard
    } catch (error: any) {
      console.error('Backend login error:', error);
      setLoginError(
        (error.message || 'Connexion serveur instable.') +
        ' Cliquez sur "Réessayer" — votre vérification reste valide.'
      );
      setVerifiedNeedsRetry(true);
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (localNumber.length < 6) {
      setLoginError('Veuillez entrer un numéro valide');
      return;
    }
    if (!nativeAuth) {
      setLoginError(
        "Module d'authentification non disponible. Vous utilisez une ancienne version de l'app — une mise à jour est requise."
      );
      return;
    }
    setLoginError('');
    setOtp('');
    setOtpSent(false);
    setVerifiedNeedsRetry(false);
    setLoading(true);

    try {
      console.log('[Firebase Native] signInWithPhoneNumber', fullPhoneNumber);
      phoneFlowActiveRef.current = true;
      const confirmation = await nativeAuth().signInWithPhoneNumber(fullPhoneNumber);
      confirmationRef.current = confirmation;
      // If Firebase already auto-signed-in (instant verification on Android),
      // currentUser will be set and the listener already kicked the flow.
      const cu = nativeAuth().currentUser;
      if (cu && phoneFlowActiveRef.current === false) {
        // Listener already handled — nothing to do.
        return;
      }
      setOtpSent(true);
      setLoading(false);
    } catch (error: any) {
      phoneFlowActiveRef.current = false;
      console.error('[Firebase Native] signInWithPhoneNumber error', error);
      setLoading(false);
      setLoginError(friendlyFirebaseError(error));
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 4) {
      setLoginError('Entrez le code reçu par SMS');
      return;
    }
    const conf = confirmationRef.current;
    if (!conf) {
      // No confirmation object — but maybe auto-sign-in already happened.
      // Check Firebase currentUser before failing.
      try {
        const cu = nativeAuth().currentUser;
        if (cu) {
          phoneFlowActiveRef.current = false;
          await attemptBackendLogin();
          return;
        }
      } catch {}
      setLoginError('Session expirée. Renvoyez le code SMS.');
      setOtpSent(false);
      return;
    }
    setLoading(true);
    setLoginError('');
    try {
      await conf.confirm(otp);
      phoneFlowActiveRef.current = false;
      // Firebase succeeded — now hit the backend
      await attemptBackendLogin();
    } catch (error: any) {
      console.error('[Firebase Native] confirm error', error);
      const code = (error?.code || '').toString();
      // CRITICAL: if confirm fails with code-expired but Firebase already
      // has a currentUser, that means SMS Retriever API auto-verified silently
      // and consumed our verificationId. In that case we are actually signed
      // in — proceed to the backend login instead of asking the user to
      // restart the flow.
      try {
        const cu = nativeAuth().currentUser;
        if (cu && (code.includes('session-expired') || code.includes('code-expired') || code.includes('invalid-verification-id'))) {
          console.log('[Firebase Native] confirm failed BUT user already signed in (auto-retrieval) -> continuing', cu.uid);
          phoneFlowActiveRef.current = false;
          await attemptBackendLogin();
          return;
        }
      } catch {}
      if (code.includes('invalid-verification-code') || code.includes('invalid-code')) {
        setLoginError('Code incorrect. Vérifiez et réessayez.');
      } else if (code.includes('session-expired') || code.includes('code-expired')) {
        setLoginError('Code expiré. Renvoi automatique du SMS...');
        setOtp('');
        setOtpSent(false);
        setTimeout(() => { handleSendOTP(); }, 600);
      } else {
        setLoginError(friendlyFirebaseError(error));
      }
      setLoading(false);
    }
  };

  const handleResetPhone = () => {
    confirmationRef.current = null;
    setLoading(false);
    setOtpSent(false);
    setOtp('');
    setLoginError('');
    setVerifiedNeedsRetry(false);
  };

  const handleCredentialLogin = async () => {
    setCredError('');
    if (!identifier.trim()) {
      setCredError("Entrez votre email ou nom d'utilisateur");
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
              <Text style={styles.quickLoginHello}>Bon retour{savedUserName ? ',' : ' !'}</Text>
              {!!savedUserName && <Text style={styles.quickLoginName}>{savedUserName}</Text>}
              <Text style={styles.quickLoginPhone}>{savedPhone}</Text>

              <Text style={styles.quickLoginLabel}>Entrez votre code PIN à 4 chiffres</Text>
              <TextInput
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

              <TouchableOpacity onPress={handleUseOtherAccount} style={styles.useOtherBtn}>
                <Text style={styles.useOtherBtnText}>Utiliser un autre numéro</Text>
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

          <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tab, activeTab === 'phone' && styles.tabActive]} onPress={() => setActiveTab('phone')}>
              <Ionicons name="call" size={18} color={activeTab === 'phone' ? '#2563eb' : '#94a3b8'} />
              <Text style={[styles.tabText, activeTab === 'phone' && styles.tabTextActive]}>Connexion Téléphone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, activeTab === 'credentials' && styles.tabActive]} onPress={() => setActiveTab('credentials')}>
              <Ionicons name="mail" size={18} color={activeTab === 'credentials' ? '#2563eb' : '#94a3b8'} />
              <Text style={[styles.tabText, activeTab === 'credentials' && styles.tabTextActive]}>Connexion Mail</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'phone' && (
            <View style={styles.form}>
              <Text style={styles.label}>{i18n.t('phoneNumber')}</Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity style={styles.countryButton} onPress={() => setShowCountryPicker(true)} disabled={otpSent}>
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
                  editable={!otpSent}
                  autoFocus
                />
              </View>
              {localNumber.length > 3 && (
                <Text style={styles.previewNumber}>{fullPhoneNumber}</Text>
              )}
              {loginError ? (
                <View style={{ backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: '#dc2626', fontSize: 14, textAlign: 'center' }}>{loginError}</Text>
                </View>
              ) : null}
              {!otpSent && (
                <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSendOTP} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t('sendOTP')}</Text>}
                </TouchableOpacity>
              )}

              {otpSent && (
                <View style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: '#eff6ff', padding: 10, borderRadius: 10 }}>
                    <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
                    <Text style={{ color: '#2563eb', fontSize: 13, flex: 1 }}>SMS envoyé au {fullPhoneNumber}</Text>
                  </View>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="------"
                    placeholderTextColor="#d1d5db"
                    value={otp}
                    onChangeText={(t) => { setOtp(t.replace(/\D/g, '').slice(0, 6)); setLoginError(''); }}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  <TouchableOpacity style={[styles.button, { marginTop: 12 }, loading && styles.buttonDisabled]} onPress={verifiedNeedsRetry ? attemptBackendLogin : handleVerifyOTP} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{verifiedNeedsRetry ? 'Réessayer la connexion' : 'Vérifier le code'}</Text>}
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); handleSendOTP(); }} style={{ padding: 8 }}>
                      <Text style={{ color: '#2563eb', fontSize: 13, fontWeight: '600' }}>Renvoyer le code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleResetPhone} style={{ padding: 8 }}>
                      <Text style={{ color: '#64748b', fontSize: 13 }}>Changer de numéro</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {activeTab === 'credentials' && credMode === 'login' && (
            <View style={styles.form}>
              <View style={styles.credInfoBox}>
                <Ionicons name="information-circle" size={20} color="#2563eb" />
                <Text style={styles.credInfoText}>
                  Connectez-vous avec votre email et mot de passe — universel, sans SMS.
                </Text>
              </View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="votre@email.com"
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
                <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              {credError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#dc2626" />
                  <Text style={styles.errorText}>{credError}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleCredentialLogin} disabled={loading}>
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

          {activeTab === 'credentials' && credMode === 'signup' && (
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

          {activeTab === 'credentials' && credMode === 'forgot' && (
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

          {activeTab === 'credentials' && credMode === 'reset' && (
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

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" transparent onRequestClose={() => { setShowCountryPicker(false); setSearchQuery(''); }}>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { maxHeight: '85%', paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0 },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir le pays</Text>
              <TouchableOpacity onPress={() => { setShowCountryPicker(false); setSearchQuery(''); Keyboard.dismiss(); }}>
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
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.countryList} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 12 }}>
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
                    Keyboard.dismiss();
                  }}
                >
                  <Image source={{ uri: getFlagUrl(country.iso) }} style={styles.countryItemFlagImg} />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.countryItemName,
                        selectedCountry.iso === country.iso && selectedCountry.code === country.code && styles.countryItemNameSelected,
                      ]}
                    >
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
