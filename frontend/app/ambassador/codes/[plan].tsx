import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../../services/constants';

const BG = '#0f172a';
const CARD = '#1e293b';
const ACCENT = '#f59e0b';

type CodeItem = {
  id: string;
  code: string;
  plan: 'monthly' | 'quarterly' | 'yearly';
  status: 'unused' | 'used';
  statusLabel?: 'available' | 'used';
  assignedAt?: string;
  usedAt?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
};

type Filter = 'all' | 'available' | 'used';

const PLAN_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
};

/**
 * Per-plan codes list with the Tous/Activés/Non activés filter.
 * Route: /ambassador/codes/[plan]   (plan ∈ monthly | quarterly | yearly)
 * Per spec: codes do NOT expire on their own. They stay valid until used.
 */
export default function AmbassadorCodesByPlan() {
  const router = useRouter();
  const { plan } = useLocalSearchParams<{ plan: string }>();
  const planKey = (plan || 'monthly') as 'monthly' | 'quarterly' | 'yearly';
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const fetchCodes = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      if (!token) {
        router.replace('/ambassador');
        return;
      }
      const backend = API_BASE_URL;
      const res = await fetch(`${backend}/api/ambassador/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, plan: planKey }),
      });
      if (!res.ok) {
        throw new Error('Erreur de récupération des codes');
      }
      const data = await res.json();
      setCodes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de charger les codes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planKey, router]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const filtered = useMemo(() => {
    if (filter === 'all') return codes;
    if (filter === 'used') return codes.filter(c => c.status === 'used');
    return codes.filter(c => c.status === 'unused');
  }, [codes, filter]);

  const counts = useMemo(() => ({
    all: codes.length,
    available: codes.filter(c => c.status === 'unused').length,
    used: codes.filter(c => c.status === 'used').length,
  }), [codes]);

  const handleCopy = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      if (Platform.OS === 'android') {
        // Android shows the system toast natively, but for a unified UX we
        // also flash a small confirmation.
      }
      Alert.alert('Copié', `Le code ${code} a été copié dans le presse-papier.`);
    } catch {
      Alert.alert('Erreur', 'Impossible de copier le code');
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('fr-FR') + ' ' + new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return iso as string; }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/ambassador/dashboard')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Codes {PLAN_LABELS[planKey]}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {([
          { id: 'all', label: 'Tous', count: counts.all },
          { id: 'available', label: 'Non activés', count: counts.available },
          { id: 'used', label: 'Activés', count: counts.used },
        ] as { id: Filter; label: string; count: number }[]).map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.filterPill, filter === opt.id && styles.filterPillActive]}
            onPress={() => setFilter(opt.id)}
          >
            <Text style={[styles.filterPillText, filter === opt.id && styles.filterPillTextActive]}>
              {opt.label} <Text style={styles.filterPillCount}>({opt.count})</Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCodes(); }} tintColor={ACCENT} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="key-outline" size={42} color="#475569" />
            <Text style={styles.emptyText}>Aucun code à afficher</Text>
          </View>
        ) : (
          filtered.map((c) => {
            const isUsed = c.status === 'used';
            return (
              <View key={c.id || c.code} style={[styles.card, isUsed && styles.cardUsed]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.codeText}>{c.code}</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopy(c.code)}>
                    <Ionicons name="copy-outline" size={16} color="#fff" />
                    <Text style={styles.copyBtnText}>Copier</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Abonnement</Text>
                  <Text style={styles.rowValue}>{PLAN_LABELS[c.plan] || c.plan}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Statut</Text>
                  <View style={[styles.statusPill, isUsed ? styles.statusUsed : styles.statusAvailable]}>
                    <Text style={[styles.statusPillText, { color: isUsed ? '#fca5a5' : '#86efac' }]}>
                      {isUsed ? 'Activé (utilisé)' : 'Non activé (disponible)'}
                    </Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Date génération</Text>
                  <Text style={styles.rowValue}>{formatDate(c.assignedAt)}</Text>
                </View>

                {isUsed && (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Date activation</Text>
                      <Text style={styles.rowValue}>{formatDate(c.usedAt)}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Client</Text>
                      <Text style={styles.rowValue}>
                        {c.clientName || '?'}{c.clientPhone ? `  ·  ${c.clientPhone}` : ''}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#1e293b', alignItems: 'center' },
  filterPillActive: { backgroundColor: ACCENT },
  filterPillText: { color: '#cbd5e1', fontWeight: '600', fontSize: 12 },
  filterPillTextActive: { color: '#0f172a' },
  filterPillCount: { fontWeight: '700' },
  card: { backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardUsed: { opacity: 0.85 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  codeText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  copyBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  rowLabel: { color: '#94a3b8', fontSize: 12 },
  rowValue: { color: '#e2e8f0', fontSize: 13, flexShrink: 1, textAlign: 'right', marginLeft: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusUsed: { backgroundColor: 'rgba(248,113,113,0.15)' },
  statusAvailable: { backgroundColor: 'rgba(74,222,128,0.15)' },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#64748b', marginTop: 12, fontSize: 14 },
});
