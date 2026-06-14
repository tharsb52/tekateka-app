import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  Linking,
  Keyboard,
  EmitterSubscription,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCIES } from '../../utils/currencies';
import { formatLocal } from '../../utils/dateUtils';
import { getOTPProviderInfo } from '../../services/otpService';
import { getPaymentProviderInfo } from '../../services/paymentService';
import AppHeader from '../../components/AppHeader';
import SubscriptionStatusCard from '../../components/SubscriptionStatusCard';
import PinScreen from '../../components/PinScreen';
import ErrorBoundary from '../../components/ErrorBoundary';
import { authAPI } from '../../services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Native Firebase Auth — used only to delete the user's OWN credential
// during account deletion (GDPR). require()'d lazily so the web bundle
// keeps compiling without the native module.
let nativeFirebaseAuth: any = null;
if (Platform.OS !== 'web') {
  try {
    nativeFirebaseAuth = require('@react-native-firebase/auth').default;
  } catch (e) {
    // OK — only matters for the delete-account flow.
  }
}

// Lazy-load expo-image-picker to avoid crash if native module fails
let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.warn('[settings] expo-image-picker not available', e);
}

const BG = '#fef3e7';

const LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ln', name: 'Lingala', flag: '🇨🇩' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
];

export default function SettingsScreen() {
  return (
    <ErrorBoundary fallbackLabel="L'écran des paramètres a rencontré une erreur.">
      <SettingsScreenInner />
    </ErrorBoundary>
  );
}

function SettingsScreenInner() {
  const { user, updateUser, logout, isSubscriptionActive, getSubscriptionDaysRemaining, hasPin, checkHasPin, removePin, setupCredentials, updateProfilePhoto } = useAuth();

  // Track keyboard height for modals (prevents inputs being hidden by keyboard)
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s: EmitterSubscription = Keyboard.addListener(showEv, (e) => setKeyboardHeight(e.endCoordinates.height));
    const h: EmitterSubscription = Keyboard.addListener(hideEv, () => setKeyboardHeight(0));
    return () => { s.remove(); h.remove(); };
  }, []);
  const router = useRouter();
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'setup' | 'change'>('setup');
  const [removePinConfirm, setRemovePinConfirm] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  // Credential setup state
  const [credModalVisible, setCredModalVisible] = useState(false);
  const [credEmail, setCredEmail] = useState('');
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credConfirmPassword, setCredConfirmPassword] = useState('');
  const [credLoading, setCredLoading] = useState(false);
  const [credError, setCredError] = useState('');
  const [credSuccess, setCredSuccess] = useState(false);
  const [showCredPassword, setShowCredPassword] = useState(false);

  // Safe defaults in case provider services fail to load (prevents crash)
  let otpInfo: any = { name: 'Firebase Phone Auth', isMock: false };
  let paymentInfo: any = { name: 'Mode Test', isMock: true, provider: 'mock' };
  try {
    const o = getOTPProviderInfo();
    if (o) otpInfo = o;
  } catch (e) {
    console.warn('getOTPProviderInfo failed', e);
  }
  try {
    const p = getPaymentProviderInfo();
    if (p) paymentInfo = p;
  } catch (e) {
    console.warn('getPaymentProviderInfo failed', e);
  }
  const isSubActive = isSubscriptionActive();
  const subDaysLeft = getSubscriptionDaysRemaining();

  const currentLang = LANGUAGES.find(l => l.code === user?.language) || LANGUAGES[0];
  const currentCurrency = CURRENCIES.find(c => c.code === user?.currency) || CURRENCIES[1];

  const handleLanguageChange = async (langCode: string) => {
    await updateUser({ language: langCode });
    setLangModalVisible(false);
  };

  const handleCurrencyChange = async (currCode: string) => {
    await updateUser({ currency: currCode });
    setCurrencyModalVisible(false);
  };

  const handleLogout = async () => {
    await logout();
  };

  // ====================================================================
  // GDPR — Account deletion flow
  // ====================================================================
  // 1) User taps "Supprimer mon compte"  → confirmation modal opens.
  // 2) User must type SUPPRIMER (irreversible action confirmation).
  // 3) Backend purges all user-owned MongoDB documents.
  // 4) Client deletes the Firebase Auth user (if signed in via phone).
  // 5) Local AsyncStorage is wiped, then logout() returns to login screen.
  // ====================================================================
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER') {
      Alert.alert(
        'Confirmation requise',
        'Vous devez taper exactement SUPPRIMER pour confirmer.'
      );
      return;
    }
    setDeleting(true);
    setDeleteResult(null);
    try {
      // 1) Backend purge — must succeed BEFORE we drop the Firebase
      //    credential, otherwise the user would lose the only thing that
      //    lets them re-authenticate to finish the deletion.
      const res = await authAPI.deleteAccount();
      const counts = res?.deleted_counts || {};
      const totalDocs = Object.values(counts).reduce(
        (s: number, n: any) => s + (typeof n === 'number' && n > 0 ? n : 0),
        0,
      );

      // 2) Firebase Auth user — best-effort. If it fails (eg. requires
      //    recent re-auth) we still continue with local cleanup because
      //    the backend has already wiped everything.
      if (nativeFirebaseAuth) {
        try {
          const fbUser = nativeFirebaseAuth().currentUser;
          if (fbUser) {
            await fbUser.delete();
          }
        } catch (fbErr: any) {
          console.warn('[GDPR] Firebase user.delete() failed:', fbErr?.code, fbErr?.message);
          // Carry on — backend data is gone, Firebase credential will
          // age out / can be removed manually by the user re-signing in.
        }
      }

      // 3) Wipe every TekaTeka-prefixed key in AsyncStorage so a fresh
      //    install on the same device starts truly empty.
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const ours = allKeys.filter((k) => k.startsWith('@tekateka:'));
        if (ours.length > 0) await AsyncStorage.multiRemove(ours);
      } catch (e) {
        console.warn('[GDPR] AsyncStorage cleanup failed:', e);
      }

      setDeleteResult(
        `Compte supprimé. ${totalDocs} enregistrement${totalDocs > 1 ? 's' : ''} effacé${totalDocs > 1 ? 's' : ''}.`,
      );

      // Give the user a beat to read the confirmation, then sign out.
      setTimeout(async () => {
        setDeleteModalVisible(false);
        setDeleteConfirmText('');
        setDeleteResult(null);
        setDeleting(false);
        await logout();
      }, 2000);
    } catch (err: any) {
      console.error('[GDPR] deleteAccount failed:', err);
      setDeleting(false);
      Alert.alert(
        'Erreur',
        err?.message ||
          "Impossible de supprimer votre compte pour le moment. Réessayez ou contactez le support.",
      );
    }
  };

  const handlePickPhoto = async () => {
    if (!ImagePicker) {
      Alert.alert('Indisponible', 'Sélecteur d\'image non disponible sur cet appareil');
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Autorisez l\'accès à la galerie pour changer votre photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setPhotoLoading(true);
        const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateProfilePhoto(base64);
        setPhotoLoading(false);
      }
    } catch (error: any) {
      setPhotoLoading(false);
      console.error('Pick photo error:', error);
      Alert.alert('Erreur', error.message || 'Impossible de charger la photo');
    }
  };

  const handleSetupCredentials = async () => {
    setCredError('');
    setCredSuccess(false);

    if (!credUsername.trim()) {
      setCredError('Le nom d\'utilisateur est obligatoire');
      return;
    }
    if (!credPassword || credPassword.length < 6) {
      setCredError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (credPassword !== credConfirmPassword) {
      setCredError('Les mots de passe ne correspondent pas');
      return;
    }

    setCredLoading(true);
    try {
      await setupCredentials(
        credEmail.trim() || undefined,
        credUsername.trim() || undefined,
        credPassword
      );
      setCredSuccess(true);
      // Reset form after 2s
      setTimeout(() => {
        setCredModalVisible(false);
        setCredSuccess(false);
        setCredEmail('');
        setCredUsername('');
        setCredPassword('');
        setCredConfirmPassword('');
      }, 2000);
    } catch (error: any) {
      setCredError(error.message || 'Erreur lors de la configuration');
    } finally {
      setCredLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader />

      <ScrollView style={styles.content}>
        {/* Subscription status (always visible) */}
        <SubscriptionStatusCard />

        {/* Profile Section */}
        <Text style={styles.sectionLabel}>PROFIL</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <TouchableOpacity style={styles.avatarCircle} onPress={handlePickPhoto} disabled={photoLoading}>
              {photoLoading ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : user?.profilePhoto ? (
                <Image source={{ uri: user.profilePhoto }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={32} color="#2563eb" />
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={styles.profilePhone}>+{user?.phoneNumber || ''}</Text>
              <Text style={styles.profileDate}>
                Membre depuis {formatLocal(user?.createdAt, 'MM/yyyy')}
              </Text>
            </View>
          </View>
        </View>

        {/* OUTILS Section (Statistiques + Notes — sorties de la section Abonnement) */}
        <Text style={styles.sectionLabel}>OUTILS</Text>

        {/* Statistiques (anciennement "Bilan mensuel") */}
        <TouchableOpacity style={[styles.card, { marginBottom: 12 }]} onPress={() => router.push('/monthly-report')}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="bar-chart" size={22} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Statistiques</Text>
                <Text style={styles.settingSubtitle}>Achats, ventes et charges du mois</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </View>
        </TouchableOpacity>

        {/* Prendre Notes (anciennement "Mes Notes") */}
        <TouchableOpacity style={[styles.card, { marginBottom: 12 }]} onPress={() => router.push('/notes')}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#fff9c4' }]}>
                <Ionicons name="document-text" size={22} color="#f59e0b" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Prendre Notes</Text>
                <Text style={styles.settingSubtitle}>Prenez des notes rapidement</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </View>
        </TouchableOpacity>

        {/* Subscription Section */}
        <Text style={styles.sectionLabel}>ABONNEMENT</Text>

        <TouchableOpacity style={styles.card} onPress={() => router.push('/subscription')}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: isSubActive ? '#d1fae5' : '#fef3c7' }]}>
                <Ionicons name={isSubActive ? 'shield-checkmark' : 'time'} size={22} color={isSubActive ? '#10b981' : '#f59e0b'} />
              </View>
              <View>
                <Text style={styles.settingTitle}>
                  Mon Abonnement
                </Text>
                <Text style={styles.settingSubtitle}>
                  {isSubActive
                    ? `Plan ${user?.subscriptionPlan === 'monthly' ? 'Mensuel' : user?.subscriptionPlan === 'quarterly' ? 'Trimestriel' : 'Annuel'} • ${subDaysLeft} jours restants`
                    : 'Essai gratuit • Passer à un plan payant'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </View>
        </TouchableOpacity>

        {/* Preferences Section */}
        <Text style={styles.sectionLabel}>PRÉFÉRENCES</Text>
        <View style={styles.card}>
          {/* Language */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setLangModalVisible(true)}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="language" size={22} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Langue</Text>
                <Text style={styles.settingSubtitle}>{currentLang.flag} {currentLang.name}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Currency */}
          <TouchableOpacity style={styles.settingRow} onPress={() => setCurrencyModalVisible(true)}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="cash" size={22} color="#10b981" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Devise</Text>
                <Text style={styles.settingSubtitle}>{currentCurrency.symbol} {currentCurrency.name}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Colleague Access Section */}
        <Text style={styles.sectionLabel}>ACCÈS COLLÈGUE</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              setCredEmail(user?.email || '');
              setCredUsername(user?.username || '');
              setCredPassword('');
              setCredConfirmPassword('');
              setCredError('');
              setCredSuccess(false);
              setCredModalVisible(true);
            }}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: user?.hasPassword ? '#d1fae5' : '#fef3c7' }]}>
                <Ionicons name={user?.hasPassword ? 'people' : 'person-add'} size={22} color={user?.hasPassword ? '#10b981' : '#f59e0b'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>
                  {user?.hasPassword ? 'Identifiants configurés' : 'Configurer les identifiants'}
                </Text>
                <Text style={styles.settingSubtitle}>
                  {user?.hasPassword
                    ? `${user.email ? user.email : ''}${user.email && user.username ? ' / ' : ''}${user.username ? user.username : ''}`
                    : 'Permettre à un collègue de se connecter'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Security / PIN Section */}
        <Text style={styles.sectionLabel}>SECURITE</Text>
        <View style={styles.card}>
          {/* QR Code - Mon identifiant */}
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => setQrModalVisible(true)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="qr-code" size={22} color="#7c3aed" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Mon QR Code</Text>
                <Text style={styles.settingSubtitle}>Pour activation par ambassadeur</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => {
              if (hasPin) {
                setPinMode('change');
              } else {
                setPinMode('setup');
              }
              setPinModalVisible(true);
            }}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: hasPin ? '#d1fae5' : '#fef3c7' }]}>
                <Ionicons name={hasPin ? 'lock-closed' : 'lock-open'} size={22} color={hasPin ? '#10b981' : '#f59e0b'} />
              </View>
              <View>
                <Text style={styles.settingTitle}>Code PIN</Text>
                <Text style={styles.settingSubtitle}>
                  {hasPin ? 'PIN activé - Modifier' : 'Configurer un code PIN'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>

          {hasPin && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setRemovePinConfirm(true)}
              >
                <View style={styles.settingLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: '#fef2f2' }]}>
                    <Ionicons name="trash-outline" size={22} color="#dc2626" />
                  </View>
                  <View>
                    <Text style={[styles.settingTitle, { color: '#dc2626' }]}>Supprimer le PIN</Text>
                    <Text style={styles.settingSubtitle}>Désactiver la protection par PIN</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* (Integration Info block removed per spec) */}

        {/* App Info */}
        <Text style={styles.sectionLabel}>APPLICATION</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="information-circle" size={22} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Version</Text>
                <Text style={styles.settingSubtitle}>TekaTeka v1.0.0</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/privacy')}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="shield-checkmark" size={22} color="#7c3aed" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Politique de Confidentialité</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/terms')}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="document-text" size={22} color="#f59e0b" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Conditions d'Utilisation</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => {
            const email = 'tekatekaquality@gmail.com';
            const subject = encodeURIComponent('TekaTeka - Support');
            const body = encodeURIComponent(`Bonjour,\n\nJ'utilise TekaTeka et j'ai besoin d'aide.\n\nTéléphone: ${user?.phoneNumber || ''}\n\nMa question:\n\n`);
            Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
          }}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#d1fae5' }]}>
                <Ionicons name="mail" size={22} color="#10b981" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Contacter le support</Text>
                <Text style={styles.settingSubtitle}>tekatekaquality@gmail.com</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={22} color="#dc2626" />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>

        {/* GDPR — Danger Zone */}
        <View style={styles.dangerZone}>
          <View style={styles.dangerHeaderRow}>
            <Ionicons name="warning" size={18} color="#dc2626" />
            <Text style={styles.dangerHeader}>Zone de danger</Text>
          </View>
          <Text style={styles.dangerBlurb}>
            Supprimer votre compte effacera de manière définitive toutes vos données :
            produits, ventes, dépenses, dettes, notes. Cette action est{' '}
            <Text style={{ fontWeight: '700' }}>irréversible</Text>.
          </Text>
          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={() => {
              setDeleteConfirmText('');
              setDeleteResult(null);
              setDeleteModalVisible(true);
            }}
          >
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={styles.deleteAccountText}>Supprimer mon compte</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* QR Code Modal */}
      <Modal visible={qrModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 30 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mon QR Code</Text>
              <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 20 }}>
              Montrez ce code à un ambassadeur TekaTeka pour activer votre abonnement
            </Text>
            <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 20, alignItems: 'center', width: '100%' }}>
              <View style={{ width: 250, height: 250, backgroundColor: '#000', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                {/* QR Pattern visual representation */}
                <View style={{ width: '100%', height: '100%', backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                  <Ionicons name="qr-code" size={120} color="#000" />
                  <Text style={{ fontSize: 10, color: '#333', marginTop: 8, fontFamily: 'monospace' }}>{user?.id || 'N/A'}</Text>
                </View>
              </View>
              <View style={{ marginTop: 16, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, width: '100%', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Votre identifiant client :</Text>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1e293b', letterSpacing: 0.5 }} selectable>{user?.id || 'N/A'}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
              L'ambassadeur scannera ce code ou copiera votre ID
            </Text>
          </View>
        </View>
      </Modal>

      {/* Language Modal */}
      <Modal visible={langModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir la langue</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.modalOption, user?.language === lang.code && styles.modalOptionSelected]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text style={styles.modalOptionFlag}>{lang.flag}</Text>
                <Text style={[styles.modalOptionText, user?.language === lang.code && styles.modalOptionTextSelected]}>
                  {lang.name}
                </Text>
                {user?.language === lang.code && (
                  <Ionicons name="checkmark-circle" size={24} color="#2563eb" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Currency Modal */}
      <Modal visible={currencyModalVisible} animationType="slide" transparent onRequestClose={() => setCurrencyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%', minHeight: 320 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir la devise</Text>
              <TouchableOpacity onPress={() => setCurrencyModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={true}
            >
              {CURRENCIES.map((curr) => (
                <TouchableOpacity
                  key={curr.code}
                  style={[styles.modalOption, user?.currency === curr.code && styles.modalOptionSelected]}
                  onPress={() => handleCurrencyChange(curr.code)}
                >
                  <Text style={styles.modalOptionFlag}>{curr.symbol}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modalOptionText, user?.currency === curr.code && styles.modalOptionTextSelected]}>
                      {curr.name}
                    </Text>
                    <Text style={styles.modalOptionCode}>{curr.code}</Text>
                  </View>
                  {user?.currency === curr.code && (
                    <Ionicons name="checkmark-circle" size={24} color="#2563eb" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PIN Setup/Change Modal */}
      <Modal visible={pinModalVisible} animationType="slide">
        <PinScreen
          userId={user?.id || ''}
          mode={pinMode}
          onSuccess={() => {
            setPinModalVisible(false);
            checkHasPin();
          }}
          onCancel={() => setPinModalVisible(false)}
        />
      </Modal>

      {/* Remove PIN Confirmation Modal */}
      <Modal visible={removePinConfirm} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 24 }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={[styles.iconCircle, { backgroundColor: '#fef2f2', width: 56, height: 56, borderRadius: 28, marginBottom: 12 }]}>
                <Ionicons name="warning" size={28} color="#dc2626" />
              </View>
              <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Supprimer le code PIN ?</Text>
              <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 8, fontSize: 14 }}>
                Votre application ne sera plus protégée au démarrage.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }}
                onPress={() => setRemovePinConfirm(false)}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#64748b' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' }}
                onPress={async () => {
                  await removePin();
                  setRemovePinConfirm(false);
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Credential Setup Modal */}
      <Modal visible={credModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 24, maxHeight: '92%', paddingBottom: keyboardHeight > 0 ? keyboardHeight + 24 : 24 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Accès collègue</Text>
                <TouchableOpacity onPress={() => setCredModalVisible(false)}>
                  <Ionicons name="close" size={28} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' }}>
                <Text style={{ fontSize: 13, color: '#1e40af', lineHeight: 18 }}>
                  Configurez un email/nom d'utilisateur et mot de passe pour permettre à votre collègue de se connecter sur un autre appareil et voir les données en temps réel.
                </Text>
              </View>

              {credSuccess ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <View style={[styles.iconCircle, { backgroundColor: '#d1fae5', width: 64, height: 64, borderRadius: 32, marginBottom: 12 }]}>
                    <Ionicons name="checkmark-circle" size={36} color="#10b981" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#10b981' }}>Configuration réussie !</Text>
                  <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 8 }}>
                    Votre collègue peut maintenant se connecter.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Email (optionnel)</Text>
                  <TextInput
                    style={styles.credInput}
                    placeholder="collegue@email.com"
                    placeholderTextColor="#94a3b8"
                    value={credEmail}
                    onChangeText={(t) => { setCredEmail(t); setCredError(''); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />

                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 12 }}>Nom d'utilisateur</Text>
                  <TextInput
                    style={styles.credInput}
                    placeholder="nom_collegue"
                    placeholderTextColor="#94a3b8"
                    value={credUsername}
                    onChangeText={(t) => { setCredUsername(t); setCredError(''); }}
                    autoCapitalize="none"
                  />

                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 12 }}>Mot de passe</Text>
                  <View style={styles.credPasswordRow}>
                    <TextInput
                      style={styles.credPasswordInput}
                      placeholder="Min. 6 caractères"
                      placeholderTextColor="#94a3b8"
                      value={credPassword}
                      onChangeText={(t) => { setCredPassword(t); setCredError(''); }}
                      secureTextEntry={!showCredPassword}
                    />
                    <TouchableOpacity style={{ padding: 14 }} onPress={() => setShowCredPassword(!showCredPassword)}>
                      <Ionicons name={showCredPassword ? 'eye-off' : 'eye'} size={22} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 12 }}>Confirmer le mot de passe</Text>
                  <TextInput
                    style={styles.credInput}
                    placeholder="Confirmer le mot de passe"
                    placeholderTextColor="#94a3b8"
                    value={credConfirmPassword}
                    onChangeText={(t) => { setCredConfirmPassword(t); setCredError(''); }}
                    secureTextEntry={!showCredPassword}
                  />

                  {credError ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', padding: 12, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: '#fca5a5' }}>
                      <Ionicons name="alert-circle" size={16} color="#dc2626" />
                      <Text style={{ flex: 1, fontSize: 14, color: '#dc2626' }}>{credError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={{ backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16, minHeight: 52, justifyContent: 'center' }}
                    onPress={handleSetupCredentials}
                    disabled={credLoading}
                  >
                    {credLoading ? <ActivityIndicator color="#fff" /> : (
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Enregistrer</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GDPR — Delete account confirmation modal */}
      <Modal
        visible={deleteModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => !deleting && setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingHorizontal: 22, paddingVertical: 22, maxHeight: '90%' }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash" size={32} color="#dc2626" />
              </View>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>Supprimer définitivement mon compte ?</Text>
            <Text style={{ fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 10, lineHeight: 18 }}>
              Toutes vos données seront effacées de manière permanente : produits, ventes, dépenses, dettes, notes, photos et profil.{'\n\n'}Cette action est <Text style={{ fontWeight: '700', color: '#dc2626' }}>irréversible</Text>.
            </Text>
            <View style={{ backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginTop: 14 }}>
              <Text style={{ fontSize: 12, color: '#78350f', fontWeight: '600' }}>
                Conformité RGPD : votre numéro de téléphone est aussi supprimé de Firebase. Les données comptables liées à un éventuel rôle d'ambassadeur sont conservées séparément selon les obligations légales.
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 18, marginBottom: 6 }}>Pour confirmer, tapez <Text style={{ color: '#dc2626', fontWeight: '800' }}>SUPPRIMER</Text> ci-dessous :</Text>
            <TextInput
              style={{ borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 16, color: '#0f172a', backgroundColor: '#fff' }}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="SUPPRIMER"
              placeholderTextColor="#cbd5e1"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
            />
            {!!deleteResult && (
              <View style={{ marginTop: 12, padding: 10, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>✓ {deleteResult}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', opacity: deleting ? 0.5 : 1 }}
                onPress={() => { if (!deleting) { setDeleteModalVisible(false); setDeleteConfirmText(''); } }}
                disabled={deleting}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#475569' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                  backgroundColor: deleteConfirmText.trim().toUpperCase() === 'SUPPRIMER' && !deleting ? '#dc2626' : '#fca5a5',
                }}
                onPress={handleDeleteAccount}
                disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER'}
              >
                {deleting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="trash" size={16} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>Supprimer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: '#f0d9c0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    resizeMode: 'cover',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2563eb',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileInfo: {
    flex: 1,
  },
  profilePhone: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  profileDate: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 70,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusMock: {
    backgroundColor: '#fef3c7',
  },
  statusActive: {
    backgroundColor: '#d1fae5',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusMockText: {
    color: '#92400e',
  },
  statusActiveText: {
    color: '#065f46',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
  // GDPR — Danger zone
  dangerZone: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  dangerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dangerHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
  },
  dangerBlurb: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 14,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteAccountText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginBottom: 6,
  },
  modalOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  modalOptionFlag: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  modalOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
  },
  modalOptionTextSelected: {
    fontWeight: '700',
    color: '#2563eb',
  },
  modalOptionCode: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  credInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1e293b',
  },
  credPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
  },
  credPasswordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: '#1e293b',
  },
});
