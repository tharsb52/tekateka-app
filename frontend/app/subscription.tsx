import { API_BASE_URL } from '../services/constants';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { SUBSCRIPTION_PRICES, SubscriptionPlan } from '../types/subscription';
import { formatCurrency, convertCurrency } from '../utils/currencies';
import { processPayment, getPaymentProviderInfo } from '../services/paymentService';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '../components/AppHeader';
import { paymentsAPI } from '../services/apiService';
import { buySubscription } from '../services/stripeCheckout';
import { formatLocal } from '../utils/dateUtils';

const BG = '#fef3e7';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, subscribe, isSubscriptionActive, getSubscriptionDaysRemaining, getDaysRemaining, showExpiryReminder, hasAccess, logout } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('yearly');
  const [loading, setLoading] = useState(false);

  const currency = user?.currency || 'USD';
  const isActive = isSubscriptionActive();
  const subDaysLeft = getSubscriptionDaysRemaining();
  const trialDays = getDaysRemaining();
  const needsRenewal = showExpiryReminder();
  const paymentProviderInfo = getPaymentProviderInfo();
  const userHasAccess = hasAccess();
  const trialExpired = !isActive && !user?.isSubscribed && trialDays === 0;

  // Direct user prices in EUR (canonical — must match backend/.env). When the
  // user's display currency is different, we convert at the runtime exchange
  // rate (utils/currencies.ts) — but the actual Stripe charge stays in EUR
  // because Stripe is configured with EUR as the merchant currency.
  const STRIPE_PRICES_EUR = { monthly: 5, quarterly: 14, yearly: 55 };

  const priceDisplay = (eur: number) => {
    const converted = convertCurrency(eur, 'EUR', currency);
    // For high-denomination currencies (CDF, CFA, RWF, BIF, NGN) we round to
    // the nearest whole unit; otherwise keep 2 decimals.
    const highDenom = ['CDF', 'CFA', 'RWF', 'BIF', 'NGN'].includes(currency);
    const rounded = highDenom ? Math.round(converted) : Math.round(converted * 100) / 100;
    return formatCurrency(rounded, currency);
  };

  const plans = [
    {
      id: 'monthly' as SubscriptionPlan,
      name: 'Mensuel',
      price: STRIPE_PRICES_EUR.monthly,
      displayPrice: priceDisplay(STRIPE_PRICES_EUR.monthly),
      duration: '1 mois',
      icon: 'calendar-outline' as const,
      color: '#3b82f6',
      savings: '',
      popular: false,
    },
    {
      id: 'quarterly' as SubscriptionPlan,
      name: 'Trimestriel',
      price: STRIPE_PRICES_EUR.quarterly,
      displayPrice: priceDisplay(STRIPE_PRICES_EUR.quarterly),
      duration: '3 mois',
      icon: 'calendar' as const,
      color: '#8b5cf6',
      savings: '7%',
      popular: false,
    },
    {
      id: 'yearly' as SubscriptionPlan,
      name: 'Annuel',
      price: STRIPE_PRICES_EUR.yearly,
      displayPrice: priceDisplay(STRIPE_PRICES_EUR.yearly),
      duration: '12 mois',
      icon: 'star' as const,
      color: '#10b981',
      savings: '8%',
      popular: true,
    },
  ];

  const [paymentMethodModal, setPaymentMethodModal] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const handleSubscribe = async () => {
    const plan = plans.find(p => p.id === selectedPlan);
    if (!plan) return;

    Alert.alert(
      'Payer par carte',
      `Plan ${plan.name} — ${plan.displayPrice}\n(facturé ${plan.price}€ par Stripe)\n\nVous allez être redirigé vers Stripe (paiement sécurisé).`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          onPress: async () => {
            setLoading(true);
            try {
              const outcome = await buySubscription(selectedPlan);
              if (outcome.status === 'completed') {
                // Refresh user profile so subscription.expiresAt is up to date
                try { await (subscribe as any)?.(selectedPlan, 'card'); } catch {}
                Alert.alert(
                  'Abonnement activé !',
                  `Plan ${plan.name} activé avec succès.`,
                  [{ text: 'Continuer', onPress: () => router.replace('/(tabs)/dashboard') }]
                );
              } else if (outcome.status === 'pending') {
                Alert.alert(
                  'Paiement en attente',
                  "Votre paiement est en cours de vérification. L'abonnement sera activé automatiquement dans quelques secondes."
                );
              } else if (outcome.status === 'cancelled') {
                // silent — user voluntarily closed the page
              } else {
                Alert.alert('Erreur', outcome.error || 'Paiement échoué');
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const openActivationCodeModal = () => {
    setPaymentMethodModal(true);
  };

  const handleActivateCode = async () => {
    if (!activationCode.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code d\'activation');
      return;
    }
    setCodeLoading(true);
    try {
      const backendUrl = API_BASE_URL;
      const res = await fetch(`${backendUrl}/api/subscription/activate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, code: activationCode.trim() }),
      });
      const responseText = await res.text();
      let data;
      try { data = JSON.parse(responseText); } catch { 
        Alert.alert('Erreur', 'Serveur inaccessible'); 
        setCodeLoading(false); 
        return; 
      }
      if (!res.ok) {
        Alert.alert('Erreur', data.detail || 'Code invalide');
      } else {
        setPaymentMethodModal(false);
        setActivationCode('');
        Alert.alert(
          'Abonnement activé !',
          data.message,
          [{ text: 'Continuer', onPress: () => router.replace('/(tabs)/dashboard') }]
        );
      }
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Erreur de connexion');
    } finally {
      setCodeLoading(false);
    }
  };

  const processSubscriptionPayment = async (method: 'card') => {
    setPaymentMethodModal(false);
    setLoading(true);
    const plan = plans.find(p => p.id === selectedPlan);
    
    try {
      // 1. Initiate payment
      const paymentResult = await paymentsAPI.subscriptionPay({
        plan: selectedPlan,
        method,
        currency,
        phone: user?.phoneNumber || '',
      });

      if (paymentResult.success) {
        // 2. Confirm payment (sandbox auto-confirms)
        const confirmResult = await paymentsAPI.subscriptionConfirm(paymentResult.txRef);
        
        if (confirmResult.success) {
          Alert.alert(
            'Abonnement activé !',
            `Plan ${plan?.name} activé avec succès.\n${paymentResult.sandbox ? '(Mode test - paiement simulé)' : `Transaction: ${paymentResult.txRef}`}\n\n${method === 'mobile_money' ? 'Mobile Money' : 'Carte bancaire'}`,
            [{ text: 'Continuer', onPress: () => router.replace('/(tabs)/dashboard') }]
          );
        }
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Échec du paiement. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AppHeader />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Navigation Header */}
        {trialExpired ? (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={async () => {
              await logout();
              router.replace('/');
            }}
          >
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={styles.logoutButtonText}>Déconnexion</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (userHasAccess) {
                router.replace('/(tabs)/dashboard');
              } else {
                router.back();
              }
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#2563eb" />
            <Text style={{ fontSize: 15, color: '#2563eb', fontWeight: '700' }}>Retour</Text>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="rocket" size={48} color="#2563eb" />
          <Text style={styles.headerTitle}>
            {isActive ? 'Mon Abonnement' : 'Choisissez Votre Plan'}
          </Text>
          <Text style={styles.headerSubtitle}>
            Transformez votre business avec TekaTeka
          </Text>
        </View>

        {/* Current Subscription Status */}
        {isActive && (
          <View style={styles.activeSubCard}>
            <View style={styles.activeSubHeader}>
              <Ionicons name="shield-checkmark" size={28} color="#10b981" />
              <Text style={styles.activeSubTitle}>Abonnement Actif</Text>
            </View>
            <View style={styles.activeSubDetails}>
              <View style={styles.activeSubRow}>
                <Text style={styles.activeSubLabel}>Plan</Text>
                <Text style={styles.activeSubValue}>
                  {user?.subscriptionPlan === 'monthly' ? 'Mensuel' : 
                   user?.subscriptionPlan === 'quarterly' ? 'Trimestriel' : 'Annuel'}
                </Text>
              </View>
              <View style={styles.activeSubRow}>
                <Text style={styles.activeSubLabel}>Expire dans</Text>
                <Text style={[styles.activeSubValue, needsRenewal && { color: '#f59e0b' }]}>
                  {subDaysLeft} jours
                </Text>
              </View>
              {user?.subscriptionEndDate && (
                <View style={styles.activeSubRow}>
                  <Text style={styles.activeSubLabel}>Date d'expiration</Text>
                  <Text style={styles.activeSubValue}>
                    {formatLocal(user.subscriptionEndDate, 'dd/MM/yyyy')}
                  </Text>
                </View>
              )}
            </View>
            {needsRenewal && (
              <View style={styles.renewalWarning}>
                <Ionicons name="warning" size={18} color="#f59e0b" />
                <Text style={styles.renewalWarningText}>
                  Votre abonnement expire bientôt ! Renouvelez maintenant.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Trial Banner */}
        {!isActive && !user?.isSubscribed && trialDays > 0 && (
          <View style={styles.trialBanner}>
            <Ionicons name="time-outline" size={24} color="#92400e" />
            <View style={{ flex: 1 }}>
              <Text style={styles.trialBannerTitle}>Période d'essai</Text>
              <Text style={styles.trialBannerText}>
                Il vous reste {trialDays} jour{trialDays > 1 ? 's' : ''} d'essai gratuit
              </Text>
            </View>
          </View>
        )}

        {/* Trial Expired Banner */}
        {!isActive && !user?.isSubscribed && trialDays === 0 && (
          <View style={styles.expiredBanner}>
            <Ionicons name="alert-circle" size={24} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.expiredBannerTitle}>Essai terminé</Text>
              <Text style={styles.expiredBannerText}>
                Abonnez-vous pour continuer à utiliser TekaTeka
              </Text>
            </View>
          </View>
        )}

        {/* Section Title */}
        <Text style={styles.sectionTitle}>
          {isActive && needsRenewal ? 'Renouveler mon abonnement' : 
           isActive ? 'Changer de plan' : 'Nos offres'}
        </Text>

        {/* Plans */}
        <View style={styles.plansContainer}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                selectedPlan === plan.id && styles.planCardSelected,
                plan.popular && selectedPlan !== plan.id && styles.planCardPopular,
              ]}
              onPress={() => setSelectedPlan(plan.id)}
              activeOpacity={0.7}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>MEILLEUR PRIX</Text>
                </View>
              )}
              
              <View style={styles.planRow}>
                <View style={[styles.planIcon, { backgroundColor: plan.color + '20' }]}>
                  <Ionicons name={plan.icon} size={28} color={plan.color} />
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planDuration}>{plan.duration}</Text>
                </View>
                <View style={styles.planPriceContainer}>
                  <Text style={[styles.planPrice, selectedPlan === plan.id && { color: '#2563eb' }]}>
                    {plan.displayPrice}
                  </Text>
                  {plan.savings ? (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsText}>-{plan.savings}</Text>
                    </View>
                  ) : null}
                </View>
                {selectedPlan === plan.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#2563eb" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Features */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Tout inclus</Text>
          {[
            { icon: 'cube', text: 'Produits illimités', color: '#3b82f6' },
            { icon: 'cart', text: 'Ventes illimitées', color: '#10b981' },
            { icon: 'receipt', text: 'Gestion des dettes', color: '#f59e0b' },
            { icon: 'bag-handle', text: 'Suivi des achats fournisseurs', color: '#7c3aed' },
            { icon: 'stats-chart', text: 'Tableau de bord complet', color: '#ec4899' },
            { icon: 'cloud-upload', text: 'Sauvegarde automatique', color: '#06b6d4' },
          ].map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: feature.color + '15' }]}>
                <Ionicons name={feature.icon as any} size={20} color={feature.color} />
              </View>
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {/* Subscribe Button (Stripe Checkout) */}
        <TouchableOpacity
          style={[styles.subscribeButton, loading && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.subscribeButtonText}>
                {isActive ? 'Renouveler' : 'Payer par carte'} - {plans.find(p => p.id === selectedPlan)?.displayPrice}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Activation code shortcut */}
        <TouchableOpacity
          style={styles.codeButton}
          onPress={openActivationCodeModal}
          activeOpacity={0.7}
        >
          <Ionicons name="key-outline" size={18} color="#2563eb" />
          <Text style={styles.codeButtonText}>J'ai un code d'activation</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Paiement sécurisé • Annulation à tout moment
        </Text>

        {/* Why TekaTeka */}
        <View style={styles.whySection}>
          <Text style={styles.whyTitle}>Pourquoi TekaTeka ?</Text>
          {[
            { icon: 'cart', text: 'Gestion simplifiée des ventes', color: '#2563eb' },
            { icon: 'cube', text: 'Contrôle du stock en temps réel', color: '#10b981' },
            { icon: 'trending-up', text: 'Suivi automatique des bénéfices', color: '#f59e0b' },
            { icon: 'shield-checkmark', text: 'Données sécurisées', color: '#8b5cf6' },
          ].map((item, index) => (
            <View key={index} style={styles.whyItem}>
              <Ionicons name={item.icon as any} size={22} color={item.color} />
              <Text style={styles.whyText}>{item.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Payment Method Modal */}
      <Modal visible={paymentMethodModal} animationType="slide" transparent>
        <View style={styles.payModalOverlay}>
          <View style={styles.payModalContent}>
            <View style={styles.payModalHeader}>
              <Text style={styles.payModalTitle}>Activer mon abonnement</Text>
              <TouchableOpacity onPress={() => setPaymentMethodModal(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.payModalAmount}>
              {plans.find(p => p.id === selectedPlan)?.displayPrice} - {plans.find(p => p.id === selectedPlan)?.name}
            </Text>

            {/* Activation Code Section */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 10 }}>
                Code d'activation (acheté auprès d'un ambassadeur)
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 16, height: 50, fontSize: 16, fontWeight: '600', letterSpacing: 1, borderWidth: 1, borderColor: '#e2e8f0' }}
                  placeholder="TK-XXXX-XXXX"
                  placeholderTextColor="#94a3b8"
                  value={activationCode}
                  onChangeText={setActivationCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={{ backgroundColor: '#059669', borderRadius: 12, width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }}
                  onPress={handleActivateCode}
                  disabled={codeLoading}
                >
                  {codeLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={24} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Entrez le code reçu de votre ambassadeur TekaTeka
              </Text>
            </View>
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
    padding: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    marginBottom: 12,
    minHeight: 44,
    gap: 6,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 12,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'center',
  },
  // Active subscription card
  activeSubCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  activeSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  activeSubTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
  },
  activeSubDetails: {
    gap: 10,
  },
  activeSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeSubLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  activeSubValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  renewalWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
  },
  renewalWarningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    fontWeight: '500',
  },
  // Trial banners
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  trialBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400e',
  },
  trialBannerText: {
    fontSize: 13,
    color: '#92400e',
    marginTop: 2,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  expiredBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
  },
  expiredBannerText: {
    fontSize: 13,
    color: '#dc2626',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 14,
  },
  // Plans
  plansContainer: {
    gap: 12,
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  planCardPopular: {
    borderColor: '#10b981',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  popularText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  planDuration: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  savingsBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  savingsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  // Features
  featuresCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 14,
  },
  featuresTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 14,
    color: '#475569',
    flex: 1,
  },
  // Subscribe
  subscribeButton: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 14,
    gap: 8,
    minHeight: 56,
  },
  subscribeButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
    gap: 8,
    marginTop: 12,
    minHeight: 50,
  },
  codeButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 12,
    marginBottom: 24,
  },
  // Why section
  whySection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  whyTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  whyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  whyText: {
    flex: 1,
    fontSize: 14,
    color: '#475569',
  },
  payModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  payModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
  },
  payModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  payModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  payModalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
    textAlign: 'center',
    marginBottom: 20,
  },
  payMethodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  payMethodIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payMethodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  payMethodSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  sandboxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fbbf24',
    marginTop: 4,
  },
  sandboxText: {
    fontSize: 13,
    color: '#92400e',
    flex: 1,
  },
});
