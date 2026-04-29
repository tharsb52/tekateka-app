import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BG = '#0f172a';
const ACCENT = '#f59e0b';
const CARD = '#1e293b';

const PLANS = [
  { key: 'monthly', label: 'Mensuel', icon: 'calendar-outline' as const, duration: '30 jours' },
  { key: 'quarterly', label: 'Trimestriel', icon: 'calendar' as const, duration: '90 jours' },
  { key: 'yearly', label: 'Annuel', icon: 'calendar-sharp' as const, duration: '365 jours' },
];

export default function AmbassadorActivateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const clientId = params.clientId as string || '';
  const clientName = params.clientName as string || 'Client';

  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleActivate = async () => {
    if (!selectedPlan) {
      Alert.alert('Erreur', 'Veuillez sélectionner un plan');
      return;
    }
    if (!clientId) {
      Alert.alert('Erreur', 'Aucun client sélectionné. Scannez d\'abord un client.');
      return;
    }

    Alert.alert(
      'Confirmer l\'activation',
      `Activer le plan ${selectedPlan} pour ${clientName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer',
          onPress: async () => {
            setLoading(true);
            try {
              const token = await AsyncStorage.getItem('ambassador_token');
              const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
              const res = await fetch(`${backendUrl}/api/ambassador/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, clientUserId: clientId, plan: selectedPlan }),
              });
              const data = await res.json();
              if (!res.ok) {
                Alert.alert('Erreur', data.detail || 'Activation échouée');
              } else {
                setResult(data);
              }
            } catch (e: any) {
              Alert.alert('Erreur', 'Erreur de connexion');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#34d399" />
          </View>
          <Text style={styles.successTitle}>Activation réussie !</Text>
          <Text style={styles.successMessage}>{result.message}</Text>

          <View style={styles.resultCard}>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Code utilisé:</Text>
              <Text style={styles.resultValue}>{result.code}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Expire le:</Text>
              <Text style={styles.resultValue}>
                {result.subscription?.expiryDate ? new Date(result.subscription.expiryDate).toLocaleDateString('fr-FR') : '-'}
              </Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Votre commission:</Text>
              <Text style={[styles.resultValue, { color: '#34d399' }]}>${result.commission}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/ambassador/dashboard')}>
            <Text style={styles.doneBtnText}>Retour au Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activer Abonnement</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        {/* Client Info */}
        <View style={styles.clientBanner}>
          <Ionicons name="person" size={24} color={ACCENT} />
          <Text style={styles.clientText}>{clientName || 'Scannez un client d\'abord'}</Text>
        </View>

        {/* Plan Selection */}
        <Text style={styles.sectionTitle}>Choisir le plan</Text>
        <View style={styles.plansGrid}>
          {PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.key}
              style={[styles.planCard, selectedPlan === plan.key && styles.planCardSelected]}
              onPress={() => setSelectedPlan(plan.key)}
            >
              <Ionicons name={plan.icon} size={28} color={selectedPlan === plan.key ? ACCENT : '#94a3b8'} />
              <Text style={[styles.planLabel, selectedPlan === plan.key && styles.planLabelSelected]}>{plan.label}</Text>
              <Text style={styles.planDuration}>{plan.duration}</Text>
              {selectedPlan === plan.key && (
                <Ionicons name="checkmark-circle" size={22} color={ACCENT} style={{ position: 'absolute', top: 10, right: 10 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Activate Button */}
        <TouchableOpacity
          style={[styles.activateBtn, (!selectedPlan || !clientId) && styles.activateBtnDisabled]}
          onPress={handleActivate}
          disabled={!selectedPlan || !clientId || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="flash" size={22} color="#fff" />
              <Text style={styles.activateBtnText}>Activer le code</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: 20 },
  clientBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
  clientText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 14 },
  plansGrid: { gap: 12, marginBottom: 30 },
  planCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderColor: 'transparent', position: 'relative' },
  planCardSelected: { borderColor: ACCENT, backgroundColor: 'rgba(245,158,11,0.08)' },
  planLabel: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 1 },
  planLabelSelected: { color: ACCENT },
  planDuration: { fontSize: 13, color: '#64748b' },
  activateBtn: { backgroundColor: '#059669', borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  activateBtnDisabled: { opacity: 0.5 },
  activateBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  // Success
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successIcon: { marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: '#34d399', marginBottom: 8 },
  successMessage: { fontSize: 15, color: '#94a3b8', textAlign: 'center', marginBottom: 24 },
  resultCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%', gap: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultLabel: { fontSize: 14, color: '#94a3b8' },
  resultValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  doneBtn: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginTop: 24 },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
});
