import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, convertCurrency } from '../utils/currencies';
import { formatLocal } from '../utils/dateUtils';

type Row = {
  productId: string;
  name: string;
  purchaseQty: number;
  purchaseAmount: number;
  purchaseDates: string[];
  saleQty: number;
  saleAmount: number;
  saleDates: string[];
};

export default function MonthlyReportScreen() {
  const router = useRouter();
  const { products, sales, expenses } = useData();
  const { user } = useAuth();
  const userCurrency = user?.currency || 'EUR';
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
  });
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const goPrevMonth = () => {
    setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1, 12, 0, 0));
    setExpandedProductId(null);
  };
  const goNextMonth = () => {
    const next = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1, 12, 0, 0);
    const now = new Date();
    const nextIsFuture =
      next.getFullYear() > now.getFullYear() ||
      (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth());
    if (nextIsFuture) return;
    setSelectedMonth(next);
    setExpandedProductId(null);
  };
  const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: fr });

  const monthlyReport: Row[] = useMemo(() => {
    const start = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1, 0, 0, 0);
    const end = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1, 0, 0, 0);
    const map = new Map<string, Row>();
    const ensure = (id: string, name: string): Row => {
      let row = map.get(id);
      if (!row) {
        row = { productId: id, name, purchaseQty: 0, purchaseAmount: 0, purchaseDates: [], saleQty: 0, saleAmount: 0, saleDates: [] };
        map.set(id, row);
      }
      return row;
    };
    const soldThisMonthByPid = new Map<string, number>();
    (sales || []).forEach((s: any) => {
      try {
        const d = new Date(s.createdAt);
        if (d < start || d >= end) return;
        const pid = s.productId || s.id;
        soldThisMonthByPid.set(pid, (soldThisMonthByPid.get(pid) || 0) + Number(s.quantity || 0));
      } catch {}
    });
    (sales || []).forEach((s: any) => {
      try {
        const d = new Date(s.createdAt);
        if (d < start || d >= end) return;
        const pid = s.productId || s.id;
        const row = ensure(pid, s.productName || 'Produit');
        row.saleQty += Number(s.quantity || 0);
        row.saleAmount += convertCurrency(Number(s.totalAmount || 0), s.currency || userCurrency, userCurrency);
        row.saleDates.push(s.createdAt);
      } catch {}
    });
    (products || []).forEach((p: any) => {
      try {
        if (!p.createdAt || !p.purchasePrice || p.purchasePrice <= 0) return;
        const d = new Date(p.createdAt);
        if (d < start || d >= end) return;
        const row = ensure(p.id, p.name);
        const soldThisMonth = soldThisMonthByPid.get(p.id) || 0;
        const originalQty = Math.max(0, (p.stock ?? 0) + soldThisMonth);
        const unitCost = Number(p.purchasePrice || 0);
        row.purchaseQty += originalQty;
        row.purchaseAmount += convertCurrency(unitCost * originalQty, p.currency || userCurrency, userCurrency);
        row.purchaseDates.push(p.createdAt);
      } catch {}
    });
    return Array.from(map.values()).sort((a, b) => (b.saleAmount + b.purchaseAmount) - (a.saleAmount + a.purchaseAmount));
  }, [selectedMonth, products, sales, userCurrency]);

  const monthlyDailySeries = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const purchasesArr: number[] = new Array(daysInMonth).fill(0);
    const salesArr: number[] = new Array(daysInMonth).fill(0);
    const expensesArr: number[] = new Array(daysInMonth).fill(0);

    const soldByPid: Record<string, number> = {};
    (sales || []).forEach((s: any) => {
      try {
        const d = new Date(s.createdAt);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const pid = s.productId || s.id;
        soldByPid[pid] = (soldByPid[pid] || 0) + Number(s.quantity || 0);
      } catch {}
    });
    (products || []).forEach((p: any) => {
      try {
        if (!p.createdAt || !p.purchasePrice || p.purchasePrice <= 0) return;
        const d = new Date(p.createdAt);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const originalQty = Math.max(0, (p.stock ?? 0) + (soldByPid[p.id] || 0));
        purchasesArr[d.getDate() - 1] += convertCurrency(Number(p.purchasePrice) * originalQty, p.currency || userCurrency, userCurrency);
      } catch {}
    });
    (sales || []).forEach((s: any) => {
      try {
        const d = new Date(s.createdAt);
        if (d.getFullYear() === year && d.getMonth() === month) {
          salesArr[d.getDate() - 1] += convertCurrency(Number(s.totalAmount || 0), s.currency || userCurrency, userCurrency);
        }
      } catch {}
    });
    (expenses || []).forEach((e: any) => {
      try {
        const d = new Date(e.createdAt);
        if (d.getFullYear() === year && d.getMonth() === month) {
          expensesArr[d.getDate() - 1] += convertCurrency(Number(e.amount || 0), e.currency || userCurrency, userCurrency);
        }
      } catch {}
    });
    return { labels: Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), purchasesArr, salesArr, expensesArr, daysInMonth };
  }, [selectedMonth, products, sales, expenses, userCurrency]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#2563eb" />
          <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 15 }}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bilan mensuel</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Month selector */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={goPrevMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-back" size={22} color="#2563eb" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={goNextMonth} style={styles.monthArrow}>
            <Ionicons name="chevron-forward" size={22} color="#2563eb" />
          </TouchableOpacity>
        </View>

        {/* 3 charts */}
        {(['sales', 'purchases', 'expenses'] as const).map((kind) => {
          const arr = kind === 'sales' ? monthlyDailySeries.salesArr
                    : kind === 'purchases' ? monthlyDailySeries.purchasesArr
                    : monthlyDailySeries.expensesArr;
          const max = Math.max(...arr, 1);
          const total = arr.reduce((a, b) => a + b, 0);
          const meta = kind === 'sales'
            ? { title: 'Ventes', color: '#2563eb', light: '#93c5fd', icon: 'trending-up' as const }
            : kind === 'purchases'
              ? { title: 'Achats', color: '#7c3aed', light: '#c4b5fd', icon: 'bag-handle' as const }
              : { title: 'Charges', color: '#dc2626', light: '#fca5a5', icon: 'trending-down' as const };
          return (
            <View key={kind} style={styles.chartBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>{meta.title}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: meta.color }}>
                  {formatCurrency(total, userCurrency)}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', minWidth: monthlyDailySeries.daysInMonth * 22, height: 110 }}>
                  {arr.map((v, i) => (
                    <View key={i} style={{ minWidth: 22, alignItems: 'center' }}>
                      <Text style={{ fontSize: 8, color: '#64748b', height: 12 }}>
                        {v > 0 ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toString()) : ''}
                      </Text>
                      <View style={{ width: 14, height: 70, justifyContent: 'flex-end', backgroundColor: '#f1f5f9', borderRadius: 4 }}>
                        <View
                          style={{
                            height: `${Math.max((v / max) * 100, 2)}%`,
                            backgroundColor: v > 0 ? meta.color : meta.light,
                            borderRadius: 4,
                          }}
                        />
                      </View>
                      <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{monthlyDailySeries.labels[i]}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          );
        })}

        {/* Per-product report */}
        <Text style={styles.sectionTitle}>Détail par produit</Text>
        {monthlyReport.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Aucune activité ce mois-ci</Text>
          </View>
        ) : (
          monthlyReport.map(row => {
            const isOpen = expandedProductId === row.productId;
            return (
              <TouchableOpacity
                key={row.productId}
                style={styles.productCard}
                onPress={() => setExpandedProductId(isOpen ? null : row.productId)}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="cube-outline" size={18} color="#2563eb" />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#1e293b' }} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                </View>
                <View style={{ flexDirection: 'row', marginTop: 8, gap: 10 }}>
                  <View style={{ flex: 1, backgroundColor: '#f3e8ff', padding: 8, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, color: '#6b21a8', fontWeight: '700' }}>ACHATS</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#7c3aed', marginTop: 2 }}>{row.purchaseQty} u.</Text>
                    <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>{formatCurrency(row.purchaseAmount, userCurrency)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#dbeafe', padding: 8, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, color: '#1e40af', fontWeight: '700' }}>VENTES</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#2563eb', marginTop: 2 }}>{row.saleQty} u.</Text>
                    <Text style={{ fontSize: 12, color: '#2563eb', fontWeight: '600' }}>{formatCurrency(row.saleAmount, userCurrency)}</Text>
                  </View>
                </View>
                {isOpen && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
                    {row.purchaseDates.length > 0 && (
                      <View style={{ marginBottom: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#7c3aed', marginBottom: 4 }}>
                          Dates d'achat ({row.purchaseDates.length})
                        </Text>
                        {row.purchaseDates.map((d, i) => (
                          <Text key={i} style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>
                            • {formatLocal(d, 'dd/MM/yyyy HH:mm')}
                          </Text>
                        ))}
                      </View>
                    )}
                    {row.saleDates.length > 0 && (
                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb', marginBottom: 4 }}>
                          Dates de vente ({row.saleDates.length})
                        </Text>
                        {row.saleDates.map((d, i) => (
                          <Text key={i} style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>
                            • {formatLocal(d, 'dd/MM/yyyy HH:mm')}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
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
  monthSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, marginBottom: 16,
    backgroundColor: '#fff', paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  monthArrow: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontSize: 16, fontWeight: '800', color: '#1e293b', textTransform: 'capitalize', minWidth: 140, textAlign: 'center' },
  chartBox: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 10 },
  productCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  empty: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginTop: 8 },
});
