import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCIES } from '../../utils/currencies';
import { getOTPProviderInfo } from '../../services/otpService';
import { getPaymentProviderInfo } from '../../services/paymentService';
import AppHeader from '../../components/AppHeader';
import PinScreen from '../../components/PinScreen';

const BG = '#fef3e7';

const LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ln', name: 'Lingala', flag: '🇨🇩' },
];

export default function SettingsScreen() {
  const { user, updateUser, logout, isSubscriptionActive, getSubscriptionDaysRemaining, hasPin, checkHasPin, removePin } = useAuth();
  const router = useRouter();
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'setup' | 'change'>('setup');
  const [removePinConfirm, setRemovePinConfirm] = useState(false);

  const otpInfo = getOTPProviderInfo();
  const paymentInfo = getPaymentProviderInfo();
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

  return (
    <View style={styles.container}>
      <AppHeader />

      <ScrollView style={styles.content}>
        {/* Profile Section */}
        <Text style={styles.sectionLabel}>PROFIL</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={32} color="#2563eb" />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profilePhone}>+{user?.phoneNumber || ''}</Text>
              <Text style={styles.profileDate}>
                Membre depuis {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''}
              </Text>
            </View>
          </View>
        </View>

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
                  {isSubActive ? `Plan ${user?.subscriptionPlan === 'monthly' ? 'Mensuel' : user?.subscriptionPlan === 'quarterly' ? 'Trimestriel' : 'Annuel'}` : 'Essai gratuit'}
                </Text>
                <Text style={styles.settingSubtitle}>
                  {isSubActive ? `${subDaysLeft} jours restants` : 'Passer à un plan payant'}
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

        {/* Security / PIN Section */}
        <Text style={styles.sectionLabel}>SÉCURITÉ</Text>
        <View style={styles.card}>
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

        {/* Integration Info */}
        <Text style={styles.sectionLabel}>INTÉGRATIONS</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="chatbox" size={22} color="#f59e0b" />
              </View>
              <View>
                <Text style={styles.settingTitle}>SMS / OTP</Text>
                <Text style={styles.settingSubtitle}>{otpInfo.name}{otpInfo.isMock ? ' (mode test)' : ''}</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, otpInfo.isMock ? styles.statusMock : styles.statusActive]}>
              <Text style={[styles.statusText, otpInfo.isMock ? styles.statusMockText : styles.statusActiveText]}>
                {otpInfo.isMock ? 'TEST' : 'ACTIF'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconCircle, { backgroundColor: '#f3e8ff' }]}>
                <Ionicons name="phone-portrait" size={22} color="#7c3aed" />
              </View>
              <View>
                <Text style={styles.settingTitle}>Paiement Mobile</Text>
                <Text style={styles.settingSubtitle}>{paymentInfo.name}{paymentInfo.isMock ? ' (mode test)' : ''}</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, paymentInfo.isMock ? styles.statusMock : styles.statusActive]}>
              <Text style={[styles.statusText, paymentInfo.isMock ? styles.statusMockText : styles.statusActiveText]}>
                {paymentInfo.isMock ? 'TEST' : 'ACTIF'}
              </Text>
            </View>
          </View>
        </View>

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
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={22} color="#dc2626" />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

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
      <Modal visible={currencyModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir la devise</Text>
              <TouchableOpacity onPress={() => setCurrencyModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
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
});
