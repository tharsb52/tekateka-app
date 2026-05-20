import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buyAmbassadorCodes } from '../../services/stripeCheckout';
import { convertCurrency, formatCurrency } from '../../utils/currencies';

type Plan = 'monthly' | 'quarterly' | 'yearly';

const PLANS: Array<{ id: Plan; name: string; duration: string; price: number; color: string; popular?: boolean }> = [
  { id: 'monthly',   name: 'Mensuel',     duration: '30 jours',  price:  4, color: '#3b82f6' },
  { id: 'quarterly', name: 'Trimestriel', duration: '90 jours',  price: 12, color: '#8b5cf6' },
  { id: 'yearly',    name: 'Annuel',      duration: '365 jours', price: 50, color: '#10b981', popular: true },
];

const BG = '#0f172a';
const ACCENT = '#f59e0b';
const CARD = '#1e293b';

export default function BuyAmbassadorCodesScreen() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  // Display currency: ambassadors pay in EUR (Stripe Price IDs are EUR),
  // but we still show their local-currency equivalent for clarity.
  // We read the ambassador's currency from stored profile if available;
  // otherwise default to EUR.
  const [userCurrency, setUserCurrency] = useState<string>('EUR');
  const [selectedPlan, setSelectedPlan] = useState<Plan>('monthly');
  const [quantity, setQuantity] = useState('5');
  const [loading, setLoading] = useState(false);

  // ---- Auth guard ----------------------------------------------------
  // This screen requires an active ambassador session. Without it the
  // backend would reject the checkout call with 401, and worse, an
  // un-authed user could see (and try to interact with) the buy UI.
  // We redirect immediately back to the ambassador login if there's no
  // ambassador_token in AsyncStorage.
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('ambassador_token');
        if (!token) {
          router.replace('/ambassador');
          return;
        }
        // Optional: read cached ambassador profile for currency preference
        const raw = await AsyncStorage.getItem('ambassador_data');
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (data?.currency) setUserCurrency(data.currency);
          } catch { /* ignore */ }
        }
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [router]);

  const plan = PLANS.find(p => p.id === selectedPlan)!;
  const qty = Math.max(1, Math.min(parseInt(quantity || '1', 10) || 1, 100));
  const totalEur = plan.price * qty;

  const displayPriceForPlan = (eur: number) => {
    const converted = convertCurrency(eur, 'EUR', userCurrency);
    const highDenom = ['CDF', 'CFA', 'RWF', 'BIF', 'NGN'].includes(userCurrency);
    const rounded = highDenom ? Math.round(converted) : Math.round(converted * 100) / 100;
    return formatCurrency(rounded, userCurrency);
  };

  const handleQuantityChange = (delta: number) => {
    const next = Math.max(1, Math.min(qty + delta, 100));
    setQuantity(String(next));
  };

  const handleBuy = async () => {
    Alert.alert(
      'Confirmer l\'achat',
      `${qty} code(s) ${plan.name} — Total: ${displayPriceForPlan(totalEur)}\n(facturé ${totalEur}€ par Stripe)\n\nVous allez être redirigé vers Stripe pour le paiement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Payer',
          onPress: async () => {
            setLoading(true);
            try {
              const outcome = await buyAmbassadorCodes(selectedPlan, qty);
              if (outcome.status === 'completed') {
                Alert.alert(
                  'Codes générés !',
                  `${qty} code(s) ${plan.name} sont maintenant disponibles dans votre dashboard.`,
                  [{ text: 'Voir mes codes', onPress: () => router.replace('/ambassador/dashboard') }]
                );
              } else if (outcome.status === 'pending') {
                Alert.alert(
                  'Paiement en attente',
                  'Le paiement est en cours de vérification. Vos codes apparaîtront dans quelques secondes.',
                  [{ text: 'OK', onPress: () => router.replace('/ambassador/dashboard') }]
                );
              } else if (outcome.status === 'cancelled') {
                // silent
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

  if (!authChecked) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Acheter des codes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Choisissez le plan</Text>

        {PLANS.map(p => {
          const selected = p.id === selectedPlan;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.planCard, selected && { borderColor: p.color, borderWidth: 2 }]}
              onPress={() => setSelectedPlan(p.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.planIcon, { backgroundColor: p.color + '22' }]}>
                <Ionicons
                  name={p.id === 'yearly' ? 'star' : p.id === 'quarterly' ? 'calendar' : 'calendar-outline'}
                  size={24}
                  color={p.color}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.planName}>{p.name}</Text>
                  {p.popular && (
                    <View style={styles.popularBadge}>
                      <Text style={styles.popularText}>POPULAIRE</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planDuration}>{p.duration} par code</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.planPrice}>{displayPriceForPlan(p.price)}</Text>
                <Text style={styles.planUnit}>/ code</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Quantity selector */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Quantité</Text>
        <View style={styles.quantityCard}>
          <TouchableOpacity onPress={() => handleQuantityChange(-1)} style={styles.qtyBtn}>
            <Ionicons name="remove" size={24} color="#fff" />
          </TouchableOpacity>
          <TextInput
            style={styles.qtyInput}
            keyboardType="numeric"
            value={quantity}
            onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, '').slice(0, 3))}
            maxLength={3}
          />
          <TouchableOpacity onPress={() => handleQuantityChange(1)} style={styles.qtyBtn}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Total */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total à payer</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.totalAmount}>{displayPriceForPlan(totalEur)}</Text>
            {userCurrency !== 'EUR' && (
              <Text style={styles.totalEurNote}>≈ {totalEur}€ facturés</Text>
            )}
          </View>
        </View>

        {/* Buy button */}
        <TouchableOpacity
          style={[styles.buyBtn, loading && { opacity: 0.6 }]}
          onPress={handleBuy}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="card" size={22} color="#fff" />
              <Text style={styles.buyBtnText}>Payer par carte</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Paiement sécurisé via Stripe. Les codes seront ajoutés à votre dashboard dès validation du paiement.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sectionTitle: { color: '#94a3b8', fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 10, marginHorizontal: 16, textTransform: 'uppercase', letterSpacing: 0.8 },
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD,
    marginHorizontal: 16, marginBottom: 10,
    padding: 14, borderRadius: 14,
    borderWidth: 2, borderColor: 'transparent',
  },
  planIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  planName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  planDuration: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  planPrice: { color: '#fff', fontSize: 20, fontWeight: '800' },
  planUnit: { color: '#64748b', fontSize: 11, marginTop: 2 },
  popularBadge: { backgroundColor: ACCENT, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  popularText: { color: '#0f172a', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  quantityCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD, marginHorizontal: 16, padding: 14, borderRadius: 14, gap: 16,
  },
  qtyBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyInput: {
    color: '#fff', fontSize: 28, fontWeight: '800',
    minWidth: 80, textAlign: 'center',
    paddingVertical: Platform.OS === 'android' ? 0 : 8,
  },
  totalCard: {
    backgroundColor: '#0c4a6e', marginHorizontal: 16, marginTop: 16,
    paddingHorizontal: 18, paddingVertical: 16, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  totalLabel: { color: '#7dd3fc', fontSize: 14, fontWeight: '600' },
  totalAmount: { color: '#fff', fontSize: 26, fontWeight: '900' },
  totalEurNote: { color: '#bae6fd', fontSize: 11, fontWeight: '500', marginTop: 2 },
  buyBtn: {
    backgroundColor: ACCENT, marginHorizontal: 16, marginTop: 16,
    paddingVertical: 16, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 54,
  },
  buyBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  disclaimer: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16, marginHorizontal: 24 },
});
