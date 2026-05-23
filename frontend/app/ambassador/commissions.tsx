import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../services/constants';
import {
  SUPPORTED_CURRENCIES,
  convertAmount,
  formatAmount,
  normalizeCurrency,
} from '../../services/currencyConverter';

const BG = '#0f172a';
const CARD = '#1e293b';
const ACCENT = '#f59e0b';

// Commissions are stored in EUR on the backend. We convert to the
// ambassador's preferred currency on the fly via currencyConverter service.
const STORAGE_CURRENCY = 'EUR';

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
  // Display currency (cached locally + synced with backend). Defaults to EUR
  // until we hear back from /ambassador/dashboard.
  const [displayCurrency, setDisplayCurrency] = useState('EUR');
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [updatingCurrency, setUpdatingCurrency] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      if (!token) { router.replace('/ambassador'); return; }
      const backend = API_BASE_URL;
      const [commRes, dashRes] = await Promise.all([
        fetch(`${backend}/api/ambassador/commissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, plan: filter === 'all' ? null : filter }),
        }),
        // Also fetch dashboard to pick up the latest preferredCurrency
        fetch(`${backend}/api/ambassador/dashboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }),
      ]);
      const data = await commRes.json();
      if (!commRes.ok) throw new Error(data?.detail || 'Erreur de chargement');
      setItems(data.items || []);
      setTotal(data.total || 0);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        const pref = dashData?.ambassador?.preferredCurrency;
        if (pref) setDisplayCurrency(normalizeCurrency(pref, 'EUR'));
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de charger les commissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelectCurrency = async (code) => {
    if (code === displayCurrency) { setShowCurrencyModal(false); return; }
    setUpdatingCurrency(true);
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      const res = await fetch(`${API_BASE_URL}/api/ambassador/profile/currency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, currency: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Mise à jour impossible');
      setDisplayCurrency(code);
      setShowCurrencyModal(false);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de changer la devise');
    } finally {
      setUpdatingCurrency(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const fmt = (n: number) => formatAmount(convertAmount(n || 0, STORAGE_CURRENCY, displayCurrency), displayCurrency);

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
        <TouchableOpacity
          onPress={() => setShowCurrencyModal(true)}
          style={styles.currencyPill}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="cash-outline" size={14} color={ACCENT} />
          <Text style={styles.currencyPillText}>{displayCurrency}</Text>
          <Ionicons name="chevron-down" size={12} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {/* Total card */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total commissions {filter !== 'all' ? `(${PLAN_LABEL[filter]})` : ''}</Text>
        <Text style={styles.totalValue}>{fmt(total)}</Text>
        <Text style={styles.totalCount}>
          {items.length} activation(s)
          {displayCurrency !== STORAGE_CURRENCY ? `  ·  base ${total.toFixed(2)} €` : ''}
        </Text>
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

      {/* Currency picker modal */}
      <Modal
        visible={showCurrencyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => !updatingCurrency && setShowCurrencyModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Devise d'affichage</Text>
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)} disabled={updatingCurrency}>
                <Ionicons name="close" size={24} color="#cbd5e1" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Les commissions sont stockées en EUR. Choisissez la devise dans laquelle vous voulez les voir.
            </Text>
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={true}
            >
              {SUPPORTED_CURRENCIES.map((c) => {
                const selected = c.code === displayCurrency;
                return (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.currencyRow, selected && styles.currencyRowSelected]}
                    onPress={() => handleSelectCurrency(c.code)}
                    disabled={updatingCurrency}
                  >
                    <Text style={[styles.currencySymbol, selected && { color: ACCENT }]}>{c.symbol}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.currencyCode, selected && { color: '#fff' }]}>{c.code}</Text>
                      <Text style={styles.currencyName} numberOfLines={1}>{c.name}</Text>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color={ACCENT} />
                    ) : (
                      updatingCurrency ? null : <Ionicons name="chevron-forward" size={18} color="#475569" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {updatingCurrency && (
              <View style={styles.updatingOverlay}>
                <ActivityIndicator color={ACCENT} />
                <Text style={{ color: '#cbd5e1', marginTop: 8, fontSize: 13 }}>Mise à jour…</Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  // Currency selector
  currencyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
  },
  currencyPillText: { color: ACCENT, fontWeight: '800', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0b1220', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 14, maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 8,
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalHint: { color: '#94a3b8', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: '#111827', marginBottom: 6,
  },
  currencyRowSelected: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' },
  currencySymbol: { color: '#cbd5e1', fontWeight: '800', fontSize: 16, minWidth: 38 },
  currencyCode: { color: '#e2e8f0', fontWeight: '700', fontSize: 14 },
  currencyName: { color: '#64748b', fontSize: 11, marginTop: 2 },
  updatingOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(11,18,32,0.7)', alignItems: 'center', justifyContent: 'center',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
  },
});
