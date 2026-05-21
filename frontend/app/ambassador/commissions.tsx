import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const BG = '#0f172a';
const CARD = '#1e293b';
const ACCENT = '#f59e0b';

type Plan = 'all' | 'monthly' | 'quarterly' | 'yearly';

type CommissionItem = {
  id: string;
  code: string;
  planType: 'monthly' | 'quarterly' | 'yearly';
  purchasePrice: number;
  salePrice: number;
  commissionAmount: number;
  clientName?: string;
  clientPhone?: string;
  date: string;
};

const PLAN_LABEL: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
};

/**
 * Ambassador "Commissions" screen.
 * Lists every activation that generated a commission, with a plan filter
 * and a running total. Backed by POST /api/ambassador/commissions which
 * reads from the dedicated `commissions` collection populated automatically
 * each time a code is activated.
 */
export default function AmbassadorCommissionsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<CommissionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Plan>('all');

  const fetchData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      if (!token) { router.replace('/ambassador'); return; }
      const backend = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${backend}/api/ambassador/commissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, plan: filter === 'all' ? null : filter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Erreur de chargement');
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de charger les commissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const fmt = (n: number) => `${(n || 0).toFixed(2)} €`;

  const grouped = useMemo(() => {
    return items.map(i => ({
      ...i,
      planLabel: PLAN_LABEL[i.planType] || i.planType,
    }));
  }, [items]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/ambassador/dashboard')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Commissions</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Total card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total commissions {filter !== 'all' ? `(${PLAN_LABEL[filter]})` : ''}</Text>
        <Text style={styles.totalValue}>{fmt(total)}</Text>
        <Text style={styles.totalCount}>{items.length} activation(s)</Text>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {([
          { id: 'all', label: 'Tous' },
          { id: 'monthly', label: 'Mensuel' },
          { id: 'quarterly', label: 'Trimestriel' },
          { id: 'yearly', label: 'Annuel' },
        ] as { id: Plan; label: string }[]).map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.filterPill, filter === opt.id && styles.filterPillActive]}
            onPress={() => setFilter(opt.id)}
          >
            <Text style={[styles.filterPillText, filter === opt.id && styles.filterPillTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={ACCENT} />}
      >
        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cash-outline" size={42} color="#475569" />
            <Text style={styles.emptyText}>Aucune commission pour ce filtre</Text>
          </View>
        ) : (
          grouped.map((it) => (
            <View key={it.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.planBadge}>{it.planLabel}</Text>
                <Text style={styles.amount}>+ {fmt(it.commissionAmount)}</Text>
              </View>
              <View style={styles.rowSmall}>
                <Text style={styles.rowLabel}>Date</Text>
                <Text style={styles.rowValue}>{formatDate(it.date)}</Text>
              </View>
              <View style={styles.rowSmall}>
                <Text style={styles.rowLabel}>Client</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {it.clientName || '?'}{it.clientPhone ? `  ·  ${it.clientPhone}` : ''}
                </Text>
              </View>
              <View style={styles.rowSmall}>
                <Text style={styles.rowLabel}>Code</Text>
                <Text style={[styles.rowValue, { fontFamily: 'monospace' }]}>{it.code}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceDetail}>Vente: {fmt(it.salePrice)}</Text>
                <Text style={styles.priceDetail}>−</Text>
                <Text style={styles.priceDetail}>Achat: {fmt(it.purchasePrice)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  totalCard: { backgroundColor: ACCENT, marginHorizontal: 16, marginTop: 16, padding: 18, borderRadius: 14, alignItems: 'center' },
  totalLabel: { color: '#0f172a', fontSize: 12, fontWeight: '600' },
  totalValue: { color: '#0f172a', fontSize: 32, fontWeight: '900', marginVertical: 4 },
  totalCount: { color: '#0f172a', fontSize: 12, opacity: 0.85 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  filterPill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#1e293b' },
  filterPillActive: { backgroundColor: ACCENT },
  filterPillText: { color: '#cbd5e1', fontWeight: '600', fontSize: 12 },
  filterPillTextActive: { color: '#0f172a' },
  card: { backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowSmall: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 2 },
  rowLabel: { color: '#94a3b8', fontSize: 12 },
  rowValue: { color: '#e2e8f0', fontSize: 13, maxWidth: '70%', textAlign: 'right' },
  planBadge: { backgroundColor: '#334155', color: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontWeight: '700', fontSize: 12 },
  amount: { color: '#86efac', fontWeight: '900', fontSize: 18 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#0f172a', borderRadius: 8, padding: 8, marginTop: 8 },
  priceDetail: { color: '#94a3b8', fontSize: 12 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#64748b', marginTop: 12, fontSize: 14 },
});
