import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../utils/i18n';
import { SUBSCRIPTION_PRICES, SubscriptionPlan } from '../types/subscription';
import { formatCurrency } from '../utils/currencies';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('yearly');
  const [loading, setLoading] = useState(false);

  const currency = user?.currency || 'USD';

  const plans = [
    {
      id: 'monthly' as SubscriptionPlan,
      name: 'Mensuel',
      price: SUBSCRIPTION_PRICES.monthly[currency],
      duration: '1 mois',
      icon: 'calendar-outline',
      color: '#3b82f6',
      savings: '',
    },
    {
      id: 'quarterly' as SubscriptionPlan,
      name: 'Trimestriel',
      price: SUBSCRIPTION_PRICES.quarterly[currency],
      duration: '3 mois',
      icon: 'calendar',
      color: '#8b5cf6',
      savings: 'Économisez 17%',
    },
    {
      id: 'yearly' as SubscriptionPlan,
      name: 'Annuel',
      price: SUBSCRIPTION_PRICES.yearly[currency],
      duration: '12 mois',
      icon: 'star',
      color: '#10b981',
      savings: 'Économisez 19% - Meilleur Prix!',
      popular: true,
    },
  ];

  const handleSubscribe = async () => {
    setLoading(true);
    
    // Simulate payment process
    setTimeout(async () => {
      try {
        const now = new Date();
        let endDate = new Date();
        
        switch (selectedPlan) {
          case 'monthly':
            endDate.setMonth(now.getMonth() + 1);
            break;
          case 'quarterly':
            endDate.setMonth(now.getMonth() + 3);
            break;
          case 'yearly':
            endDate.setFullYear(now.getFullYear() + 1);
            break;
        }

        await updateUser({
          isSubscribed: true,
          trialStartDate: now.toISOString(),
        });

        Alert.alert(
          '✅ Abonnement Activé!',
          `Votre abonnement ${plans.find(p => p.id === selectedPlan)?.name} est maintenant actif jusqu'au ${endDate.toLocaleDateString('fr-FR')}.`,
          [
            {
              text: 'Commencer',
              onPress: () => router.replace('/(tabs)/dashboard'),
            },
          ]
        );
      } catch (error) {
        Alert.alert('Erreur', 'Échec de l\'activation de l\'abonnement');
      } finally {
        setLoading(false);
      }
    }, 1500);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Ionicons name="rocket" size={48} color="#2563eb" />
            <Text style={styles.headerTitle}>Choisissez Votre Plan</Text>
            <Text style={styles.headerSubtitle}>
              Transformez votre business avec TekaTeka
            </Text>
          </View>
        </View>

        {/* Plans */}
        <View style={styles.plansContainer}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                selectedPlan === plan.id && styles.planCardSelected,
                plan.popular && styles.planCardPopular,
              ]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>POPULAIRE</Text>
                </View>
              )}
              
              <View style={styles.planHeader}>
                <View style={[styles.planIcon, { backgroundColor: plan.color + '20' }]}>
                  <Ionicons name={plan.icon} size={32} color={plan.color} />
                </View>
                <Text style={styles.planName}>{plan.name}</Text>
              </View>

              <Text style={styles.planPrice}>
                {formatCurrency(plan.price, currency)}
              </Text>
              <Text style={styles.planDuration}>pour {plan.duration}</Text>

              {plan.savings && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsText}>{plan.savings}</Text>
                </View>
              )}

              <View style={styles.planFeatures}>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.featureText}>Produits illimités</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.featureText}>Ventes illimitées</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.featureText}>Gestion des dettes</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.featureText}>Sauvegarde cloud</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.featureText}>Support prioritaire</Text>
                </View>
              </View>

              {selectedPlan === plan.id && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={24} color="#2563eb" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Benefits */}
        <View style={styles.benefitsSection}>
          <Text style={styles.benefitsTitle}>Pourquoi TekaTeka?</Text>
          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Ionicons name="phone-portrait" size={24} color="#2563eb" />
              <Text style={styles.benefitText}>
                Fonctionne hors ligne - pas besoin d'internet constant
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="shield-checkmark" size={24} color="#10b981" />
              <Text style={styles.benefitText}>
                Données sécurisées et sauvegardées automatiquement
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="trending-up" size={24} color="#8b5cf6" />
              <Text style={styles.benefitText}>
                Augmentez vos bénéfices jusqu'à 30%
              </Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="time" size={24} color="#f59e0b" />
              <Text style={styles.benefitText}>
                Gagnez 2 heures par jour sur votre gestion
              </Text>
            </View>
          </View>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, loading && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          <Text style={styles.subscribeButtonText}>
            {loading ? 'Traitement...' : `S'abonner - ${formatCurrency(SUBSCRIPTION_PRICES[selectedPlan][currency], currency)}`}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          💳 Paiement sécurisé • ❌ Annulation à tout moment • 🔄 Renouvellement automatique
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
  plansContainer: {
    gap: 16,
    marginBottom: 32,
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 3,
    borderColor: '#e2e8f0',
    position: 'relative',
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
    top: -12,
    right: 20,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  planIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  planPrice: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 4,
  },
  planDuration: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  savingsBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  planFeatures: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#475569',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  benefitsSection: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  benefitsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  subscribeButton: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 16,
    gap: 8,
  },
  subscribeButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
    marginTop: 16,
    lineHeight: 18,
  },
});
