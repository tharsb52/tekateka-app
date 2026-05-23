import { API_BASE_URL } from '../../services/constants';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatLocal } from '../../utils/dateUtils';
import {
  convertAmount, formatAmount, normalizeCurrency,
} from '../../services/currencyConverter';

const BG = '#0f172a';
const ACCENT = '#f59e0b';
const CARD = '#1e293b';

// All ambassador commissions are stored in EUR on the backend.
const STORAGE_CURRENCY = 'EUR';

export default function AmbassadorDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'stats' | 'sales'>('stats');

  const fetchData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('ambassador_token');
      if (!token) { router.replace('/ambassador'); return; }
      const backendUrl = API_BASE_URL;

      const [dashRes, salesRes] = await Promise.all([
        fetch(`${backendUrl}/api/ambassador/dashboard`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }),
        fetch(`${backendUrl}/api/ambassador/sales`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }),
      ]);

      const dashData = await dashRes.json();
      const salesData = await salesRes.json();

      if (!dashRes.ok) {
        Alert.alert('Erreur', dashData.detail || 'Session expirée');
        await AsyncStorage.removeItem('ambassador_token');
        router.replace('/ambassador');
        return;
      }

      setDashboard(dashData);
      setSales(Array.isArray(salesData) ? salesData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('ambassador_token');
    await AsyncStorage.removeItem('ambassador_data');
    router.replace('/ambassador');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </SafeAreaView>
    );
  }

  const stats = dashboard?.stats || {};
  const ambassador = dashboard?.ambassador || {};
  const pricing = dashboard?.pricing || {};
  const preferredCurrency = normalizeCurrency(ambassador.preferredCurrency, 'EUR');
  const fmtCommission = (n: number) =>
    formatAmount(convertAmount(Number(n) || 0, STORAGE_CURRENCY, preferredCurrency), preferredCurrency);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={require('../../assets/images/tk-logo-transparent.png')} style={{ width: 40, height: 40 }} resizeMode="contain" />
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.name}>{ambassador.name}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
      >
        {/* === BLOC 1: Tabs "Mes codes / Historique" === */}
        <View style={styles.tabsRow}>
          <TouchableOpacity style={[styles.tab, activeTab === 'stats' && styles.tabActive]} onPress={() => setActiveTab('stats')}>
            <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>Mes Codes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'sales' && styles.tabActive]} onPress={() => setActiveTab('sales')}>
            <Text style={[styles.tabText, activeTab === 'sales' && styles.tabTextActive]}>Historique</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'stats' ? (
          <View style={styles.codesSection}>
            {/* Summary */}
            <View style={styles.codesSummary}>
              <View style={styles.codeStat}>
                <Text style={styles.codeStatValue}>{stats.totalCodes || 0}</Text>
                <Text style={styles.codeStatLabel}>Total</Text>
              </View>
              <View style={styles.codeStat}>
                <Text style={[styles.codeStatValue, { color: '#34d399' }]}>{stats.remainingCodes || 0}</Text>
                <Text style={styles.codeStatLabel}>Disponibles</Text>
              </View>
              <View style={styles.codeStat}>
                <Text style={[styles.codeStatValue, { color: '#94a3b8' }]}>{stats.usedCodes || 0}</Text>
                <Text style={styles.codeStatLabel}>Utilisés</Text>
              </View>
            </View>

            {/* Codes by Plan — each row is tappable -> per-plan filtered codes view */}
            <Text style={styles.planSectionTitle}>Détail par catégorie</Text>

            {/* Monthly */}
            <TouchableOpacity
              style={[styles.planCard, { borderLeftColor: '#60a5fa' }]}
              activeOpacity={0.7}
              onPress={() => router.push('/ambassador/codes/monthly')}
            >
              <View style={styles.planCardHeader}>
                <Ionicons name="calendar-outline" size={20} color="#60a5fa" />
                <Text style={[styles.planCardTitle, { color: '#60a5fa' }]}>Mensuel</Text>
                <Ionicons name="chevron-forward" size={18} color="#60a5fa" style={{ marginLeft: 'auto' }} />
              </View>
              <View style={styles.planCardStats}>
                <View style={styles.planStatItem}><Text style={styles.planStatValue}>{stats.codesByPlan?.monthly?.remaining || 0}</Text><Text style={styles.planStatLabel}>Dispo</Text></View>
                <View style={styles.planStatItem}><Text style={[styles.planStatValue, { color: '#94a3b8' }]}>{stats.codesByPlan?.monthly?.used || 0}</Text><Text style={styles.planStatLabel}>Utilisés</Text></View>
                <View style={styles.planStatItem}><Text style={[styles.planStatValue, { color: '#64748b' }]}>{stats.codesByPlan?.monthly?.total || 0}</Text><Text style={styles.planStatLabel}>Total</Text></View>
              </View>
            </TouchableOpacity>

            {/* Quarterly */}
            <TouchableOpacity
              style={[styles.planCard, { borderLeftColor: '#f59e0b' }]}
              activeOpacity={0.7}
              onPress={() => router.push('/ambassador/codes/quarterly')}
            >
              <View style={styles.planCardHeader}>
                <Ionicons name="calendar" size={20} color="#f59e0b" />
                <Text style={[styles.planCardTitle, { color: '#f59e0b' }]}>Trimestriel</Text>
                <Ionicons name="chevron-forward" size={18} color="#f59e0b" style={{ marginLeft: 'auto' }} />
              </View>
              <View style={styles.planCardStats}>
                <View style={styles.planStatItem}><Text style={styles.planStatValue}>{stats.codesByPlan?.quarterly?.remaining || 0}</Text><Text style={styles.planStatLabel}>Dispo</Text></View>
                <View style={styles.planStatItem}><Text style={[styles.planStatValue, { color: '#94a3b8' }]}>{stats.codesByPlan?.quarterly?.used || 0}</Text><Text style={styles.planStatLabel}>Utilisés</Text></View>
                <View style={styles.planStatItem}><Text style={[styles.planStatValue, { color: '#64748b' }]}>{stats.codesByPlan?.quarterly?.total || 0}</Text><Text style={styles.planStatLabel}>Total</Text></View>
              </View>
            </TouchableOpacity>

            {/* Yearly */}
            <TouchableOpacity
              style={[styles.planCard, { borderLeftColor: '#34d399' }]}
              activeOpacity={0.7}
              onPress={() => router.push('/ambassador/codes/yearly')}
            >
              <View style={styles.planCardHeader}>
                <Ionicons name="calendar-sharp" size={20} color="#34d399" />
                <Text style={[styles.planCardTitle, { color: '#34d399' }]}>Annuel</Text>
                <Ionicons name="chevron-forward" size={18} color="#34d399" style={{ marginLeft: 'auto' }} />
              </View>
              <View style={styles.planCardStats}>
                <View style={styles.planStatItem}><Text style={styles.planStatValue}>{stats.codesByPlan?.yearly?.remaining || 0}</Text><Text style={styles.planStatLabel}>Dispo</Text></View>
                <View style={styles.planStatItem}><Text style={[styles.planStatValue, { color: '#94a3b8' }]}>{stats.codesByPlan?.yearly?.used || 0}</Text><Text style={styles.planStatLabel}>Utilisés</Text></View>
                <View style={styles.planStatItem}><Text style={[styles.planStatValue, { color: '#64748b' }]}>{stats.codesByPlan?.yearly?.total || 0}</Text><Text style={styles.planStatLabel}>Total</Text></View>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.salesSection}>
            {sales.length === 0 ? (
              <Text style={styles.emptyText}>Aucune vente encore</Text>
            ) : (
              sales.map((sale, i) => (
                <View key={sale.id || i} style={styles.saleCard}>
                  <View style={styles.saleHeader}>
                    <Text style={styles.saleClient}>{sale.clientName || sale.clientPhone}</Text>
                    <Text style={styles.saleCommission}>+{fmtCommission(sale.commission)}</Text>
                  </View>
                  <View style={styles.saleDetails}>
                    <Text style={styles.salePlan}>{sale.plan}</Text>
                    <Text style={styles.saleDate}>{formatLocal(sale.createdAt, 'dd/MM/yyyy HH:mm')}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Commissions shortcut (per spec — under Mes Codes/Historique block) */}
        <TouchableOpacity
          style={styles.commissionsBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/ambassador/commissions')}
        >
          <Ionicons name="cash" size={20} color={ACCENT} />
          <Text style={styles.commissionsBtnText}>Voir mes commissions</Text>
          <Ionicons name="chevron-forward" size={20} color={ACCENT} />
        </TouchableOpacity>

        {/* === BLOC 2: Acheter des codes === */}
        <TouchableOpacity
          style={styles.buyCodesBtn}
          onPress={() => router.push('/ambassador/buy-codes')}
          activeOpacity={0.85}
        >
          <Ionicons name="card" size={22} color="#0f172a" />
          <Text style={styles.buyCodesText}>Acheter des codes d'activation</Text>
          <Ionicons name="arrow-forward" size={20} color="#0f172a" />
        </TouchableOpacity>

        {/* === BLOC 3: Scanner client === */}
        <View style={styles.singleActionRow}>
          <TouchableOpacity style={styles.actionBtnFull} onPress={() => router.push('/ambassador/scan')}>
            <Ionicons name="qr-code" size={28} color="#fff" />
            <Text style={styles.actionText}>Scanner Client</Text>
          </TouchableOpacity>
        </View>

        {/* === BLOC 4: Activer Abonnement (anciennement "Activer code") === */}
        <View style={styles.singleActionRow}>
          <TouchableOpacity style={[styles.actionBtnFull, { backgroundColor: '#059669' }]} onPress={() => router.push('/ambassador/activate')}>
            <Ionicons name="checkmark-circle" size={28} color="#fff" />
            <Text style={styles.actionText}>Activer Abonnement</Text>
          </TouchableOpacity>
        </View>

        {/* Multiplier Badge (rare, only shown if backend says so) */}
        {stats.hasMultiplier && (
          <View style={styles.multiplierBadge}>
            <Ionicons name="flame" size={18} color={ACCENT} />
            <Text style={styles.multiplierText}>Commission x{stats.multiplier} activée !</Text>
          </View>
        )}

        {/* === BLOC 5: 2 stats clés en bas (Ventes totales & Commissions) === */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#1e3a5f' }]}>
            <Ionicons name="cart" size={24} color="#60a5fa" />
            <Text style={styles.statValue}>{stats.totalSales || 0}</Text>
            <Text style={styles.statLabel}>Ventes totales</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#1a3d2e' }]}>
            <Ionicons name="cash" size={24} color="#34d399" />
            <Text style={styles.statValue}>{fmtCommission(stats.totalCommission || 0)}</Text>
            <Text style={styles.statLabel}>Commissions</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  greeting: { fontSize: 14, color: '#94a3b8' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  logoutBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  statCard: { width: '47%', borderRadius: 16, padding: 16, gap: 6 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 12, color: '#94a3b8' },
  multiplierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  multiplierText: { fontSize: 14, fontWeight: '600', color: ACCENT },
  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginTop: 20 },
  actionBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 16, padding: 20, alignItems: 'center', gap: 8 },
  actionText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  buyCodesBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT,
    marginHorizontal: 16, marginTop: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, gap: 8, minHeight: 52,
  },
  buyCodesText: { color: '#0f172a', fontWeight: '800', fontSize: 15, flex: 1, textAlign: 'center' },
  tabsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 24, backgroundColor: CARD, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: ACCENT },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#0f172a' },
  codesSection: { margin: 16 },
  codesSummary: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 16, padding: 20, justifyContent: 'space-around', marginBottom: 16 },
  codeStat: { alignItems: 'center', gap: 4 },
  codeStatValue: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  codeStatLabel: { fontSize: 12, color: '#94a3b8' },
  planSectionTitle: { fontSize: 14, fontWeight: '700', color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  planCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: 4 },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  planCardTitle: { fontSize: 16, fontWeight: '700' },
  planCardStats: { flexDirection: 'row', justifyContent: 'space-around' },
  planStatItem: { alignItems: 'center' },
  planStatValue: { fontSize: 22, fontWeight: 'bold', color: '#34d399' },
  planStatLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  salesSection: { margin: 16, gap: 10 },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 20 },
  saleCard: { backgroundColor: CARD, borderRadius: 12, padding: 16 },
  saleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saleClient: { fontSize: 15, fontWeight: '600', color: '#fff' },
  saleCommission: { fontSize: 16, fontWeight: 'bold', color: '#34d399' },
  saleDetails: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  salePlan: { fontSize: 13, color: '#94a3b8', textTransform: 'capitalize' },
  saleDate: { fontSize: 13, color: '#64748b' },
  // New styles for reorganized blocks
  singleActionRow: { paddingHorizontal: 16, marginTop: 12 },
  actionBtnFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 16, borderRadius: 14, gap: 10, minHeight: 56,
  },
  commissionsBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, marginHorizontal: 16, marginTop: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, gap: 10, borderLeftWidth: 3, borderLeftColor: ACCENT,
  },
  commissionsBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },
});
