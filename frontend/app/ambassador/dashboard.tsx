import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BG = '#0f172a';
const ACCENT = '#f59e0b';
const CARD = '#1e293b';

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
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#1e3a5f' }]}>
            <Ionicons name="cart" size={24} color="#60a5fa" />
            <Text style={styles.statValue}>{stats.totalSales || 0}</Text>
            <Text style={styles.statLabel}>Ventes totales</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#1a3d2e' }]}>
            <Ionicons name="cash" size={24} color="#34d399" />
            <Text style={styles.statValue}>${stats.totalCommission || 0}</Text>
            <Text style={styles.statLabel}>Commissions</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#3d2e1a' }]}>
            <Ionicons name="today" size={24} color={ACCENT} />
            <Text style={styles.statValue}>{stats.monthlySales || 0}</Text>
            <Text style={styles.statLabel}>Ce mois</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#2d1a3d' }]}>
            <Ionicons name="key" size={24} color="#a78bfa" />
            <Text style={styles.statValue}>{stats.remainingCodes || 0}</Text>
            <Text style={styles.statLabel}>Codes dispo</Text>
          </View>
        </View>

        {/* Multiplier Badge */}
        {stats.hasMultiplier && (
          <View style={styles.multiplierBadge}>
            <Ionicons name="flame" size={18} color={ACCENT} />
            <Text style={styles.multiplierText}>Commission x{stats.multiplier} activée !</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/ambassador/scan')}>
            <Ionicons name="qr-code" size={28} color="#fff" />
            <Text style={styles.actionText}>Scanner Client</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#059669' }]} onPress={() => router.push('/ambassador/activate')}>
            <Ionicons name="checkmark-circle" size={28} color="#fff" />
            <Text style={styles.actionText}>Activer Code</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
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
                    <Text style={styles.saleCommission}>+${sale.commission}</Text>
                  </View>
                  <View style={styles.saleDetails}>
                    <Text style={styles.salePlan}>{sale.plan}</Text>
                    <Text style={styles.saleDate}>
                      {sale.createdAt ? new Date(sale.createdAt).toLocaleDateString('fr-FR') : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

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
  tabsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 24, backgroundColor: CARD, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: ACCENT },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: '#0f172a' },
  codesSection: { margin: 16 },
  codesSummary: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 16, padding: 20, justifyContent: 'space-around' },
  codeStat: { alignItems: 'center', gap: 4 },
  codeStatValue: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  codeStatLabel: { fontSize: 12, color: '#94a3b8' },
  salesSection: { margin: 16, gap: 10 },
  emptyText: { color: '#64748b', textAlign: 'center', padding: 20 },
  saleCard: { backgroundColor: CARD, borderRadius: 12, padding: 16 },
  saleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saleClient: { fontSize: 15, fontWeight: '600', color: '#fff' },
  saleCommission: { fontSize: 16, fontWeight: 'bold', color: '#34d399' },
  saleDetails: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  salePlan: { fontSize: 13, color: '#94a3b8', textTransform: 'capitalize' },
  saleDate: { fontSize: 13, color: '#64748b' },
});
