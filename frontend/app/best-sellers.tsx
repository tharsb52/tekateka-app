import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, convertCurrency } from '../utils/currencies';

type Row = {
  productId: string;
  productName: string;
  totalQty: number;
  totalRevenue: number;
  lastSaleAt?: string;
};

export default function BestSellersScreen() {
  const router = useRouter();
  const { sales, products } = useData();
  const { user } = useAuth();
  const userCurrency = user?.currency || 'EUR';

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    (sales || []).forEach((s: any) => {
      const pid = s.productId || s.id;
      if (!pid) return;
      let row = map.get(pid);
      if (!row) {
        row = { productId: pid, productName: s.productName || 'Produit', totalQty: 0, totalRevenue: 0 };
        map.set(pid, row);
      }
      row.totalQty += Number(s.quantity || 0);
      row.totalRevenue += convertCurrency(Number(s.totalAmount || 0), s.currency || userCurrency, userCurrency);
      if (!row.lastSaleAt || new Date(s.createdAt) > new Date(row.lastSaleAt)) row.lastSaleAt = s.createdAt;
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [sales, userCurrency]);

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalUnits = rows.reduce((s, r) => s + r.totalQty, 0);

  const medalForIndex = (i: number) => i === 0 ? { c: '#fbbf24', n: '🥇' }
                                       : i === 1 ? { c: '#94a3b8', n: '🥈' }
                                       : i === 2 ? { c: '#d97706', n: '🥉' }
                                       : { c: '#cbd5e1', n: `#${i + 1}` };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#2563eb" />
          <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 15 }}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meilleures ventes</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>Total ventes</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalRevenue, userCurrency)}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 16 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryLabel}>Unités vendues</Text>
            <Text style={styles.summaryValue}>{totalUnits}</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>Aucune vente enregistrée</Text>
            <Text style={styles.emptySub}>Faites votre première vente pour voir apparaître votre classement.</Text>
          </View>
        ) : (
          rows.map((r, idx) => {
            const medal = medalForIndex(idx);
            const product = products.find(p => p.id === r.productId);
            const stock = product?.stock ?? 0;
            return (
              <View key={r.productId} style={styles.row}>
                <View style={[styles.rank, { backgroundColor: idx < 3 ? medal.c : '#f1f5f9' }]}>
                  <Text style={{ color: idx < 3 ? '#fff' : '#64748b', fontWeight: '900', fontSize: idx < 3 ? 18 : 14 }}>
                    {medal.n}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.productName} numberOfLines={1}>{r.productName}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{r.totalQty} unités</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: stock === 0 ? '#fee2e2' : stock <= 1 ? '#fef3c7' : '#dcfce7' }]}>
                      <Text style={[styles.badgeText, { color: stock === 0 ? '#dc2626' : stock <= 1 ? '#d97706' : '#16a34a' }]}>
                        Stock: {stock}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.revenue}>{formatCurrency(r.totalRevenue, userCurrency)}</Text>
                  <Text style={styles.percent}>
                    {totalRevenue > 0 ? `${Math.round((r.totalRevenue / totalRevenue) * 100)}%` : '0%'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#eff6ff', borderRadius: 10,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b', flex: 1, textAlign: 'center' },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 16, padding: 18, marginBottom: 16,
  },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  summaryValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  rank: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  badge: { backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, color: '#2563eb', fontWeight: '700' },
  revenue: { fontSize: 16, fontWeight: '800', color: '#16a34a' },
  percent: { fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
