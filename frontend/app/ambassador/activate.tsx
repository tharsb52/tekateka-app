import { API_BASE_URL } from '../../services/constants';
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatLocal } from '../../utils/dateUtils';

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
  const paramClientId = params.clientId as string || '';
  const paramClientName = params.clientName as string || '';

  const [clientId, setClientId] = useState(paramClientId);
  const [clientName, setClientName] = useState(paramClientName);
  const [clientLookupLoading, setClientLookupLoading] = useState(false);
  const [clientFound, setClientFound] = useState(!!paramClientId);
  const [clientInfo, setClientInfo] = useState<any>(paramClientId ? { name: paramClientName } : null);

  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const lookupClient = async () => {
    if (!clientId.trim()) {
      setErrorMsg("Entrez l'ID du client (depuis son QR Code)");
      return;
    }
    setClientLookupLoading(true);
    setErrorMsg('');
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      const backendUrl = API_BASE_URL;
      const res = await fetch(`${backendUrl}/api/ambassador/scan-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientUserId: clientId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Client introuvable');
        setClientFound(false);
        setClientInfo(null);
      } else {
        setClientFound(true);
        setClientInfo(data.client);
        setClientName(data.client.name);
        setErrorMsg('');
      }
    } catch (e: any) {
      setErrorMsg('Erreur de connexion');
    } finally {
      setClientLookupLoading(false);
    }
  };

  const handleActivate = async () => {
    setErrorMsg('');
    if (!selectedPlan) {
      setErrorMsg('Veuillez sélectionner un plan');
      return;
    }
    if (!clientId || !clientFound) {
      setErrorMsg("Veuillez d'abord rechercher un client valide");
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      const backendUrl = API_BASE_URL;
      const res = await fetch(`${backendUrl}/api/ambassador/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientUserId: clientId.trim(), plan: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Activation échouée');
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setErrorMsg('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  // Success screen
  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Image source={require('../../assets/images/tk-logo-transparent.png')} style={{ width: 60, height: 60, marginBottom: 16 }} resizeMode="contain" />
          <Ionicons name="checkmark-circle" size={80} color="#34d399" />
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
                {result.subscription?.expiryDate ? formatLocal(result.subscription.expiryDate, 'dd/MM/yyyy') : '-'}
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
        {/* Error Message */}
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#fca5a5" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Client Section */}
        <Text style={styles.sectionTitle}>1. Client</Text>
        {clientFound && clientInfo ? (
          <View style={styles.clientBanner}>
            <Ionicons name="person-circle" size={32} color="#34d399" />
            <View style={{ flex: 1 }}>
              <Text style={styles.clientText}>{clientInfo.name || clientName}</Text>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>{clientInfo.phone || ''}</Text>
            </View>
            <TouchableOpacity onPress={() => { setClientFound(false); setClientInfo(null); setClientId(''); }}>
              <Ionicons name="close-circle" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.clientInputRow}>
            <TextInput
              style={styles.clientInput}
              placeholder="ID client (depuis le QR code)"
              placeholderTextColor="#64748b"
              value={clientId}
              onChangeText={(t) => { setClientId(t); setErrorMsg(''); }}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={lookupClient} disabled={clientLookupLoading}>
              {clientLookupLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="search" size={22} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.hint}>Scannez le QR code du client ou entrez son ID manuellement</Text>

        {/* Plan Selection */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>2. Plan d'abonnement</Text>
        <View style={styles.plansGrid}>
          {PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.key}
              style={[styles.planCard, selectedPlan === plan.key && styles.planCardSelected]}
              onPress={() => { setSelectedPlan(plan.key); setErrorMsg(''); }}
            >
              <Ionicons name={plan.icon} size={24} color={selectedPlan === plan.key ? ACCENT : '#94a3b8'} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.planLabel, selectedPlan === plan.key && styles.planLabelSelected]}>{plan.label}</Text>
                <Text style={styles.planDuration}>{plan.duration}</Text>
              </View>
              {selectedPlan === plan.key && (
                <Ionicons name="checkmark-circle" size={22} color={ACCENT} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Activate Button */}
        <TouchableOpacity
          style={[styles.activateBtn, (!selectedPlan || !clientFound) && styles.activateBtnDisabled]}
          onPress={handleActivate}
          disabled={loading}
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
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 14, color: '#fca5a5', flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  clientBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#34d399' },
  clientText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  clientInputRow: { flexDirection: 'row', gap: 10 },
  clientInput: { flex: 1, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 16, height: 50, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#334155' },
  searchBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, color: '#64748b', marginTop: 8 },
  plansGrid: { gap: 10 },
  planCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderColor: 'transparent' },
  planCardSelected: { borderColor: ACCENT, backgroundColor: 'rgba(245,158,11,0.08)' },
  planLabel: { fontSize: 16, fontWeight: '600', color: '#fff' },
  planLabelSelected: { color: ACCENT },
  planDuration: { fontSize: 12, color: '#64748b' },
  activateBtn: { backgroundColor: '#059669', borderRadius: 14, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  activateBtnDisabled: { opacity: 0.5 },
  activateBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  // Success
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successTitle: { fontSize: 24, fontWeight: 'bold', color: '#34d399', marginTop: 12, marginBottom: 8 },
  successMessage: { fontSize: 15, color: '#94a3b8', textAlign: 'center', marginBottom: 24 },
  resultCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%', gap: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultLabel: { fontSize: 14, color: '#94a3b8' },
  resultValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  doneBtn: { backgroundColor: ACCENT, borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginTop: 24 },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
});
