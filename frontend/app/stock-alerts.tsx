import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';

type Tab = 'low' | 'empty';

export default function StockAlertsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { products } = useData();
  const [tab, setTab] = useState<Tab>((params.type === 'empty' ? 'empty' : 'low'));

  const { low, empty } = useMemo(() => {
    // Recomputed on every render from the live products list so alerts
    // disappear automatically after a restock and reappear if stock drops
    // back to or below the threshold. The threshold lives per product
    // (default 5) — set when creating/editing the product.
    return {
      empty: products.filter(p => (p.stock ?? 0) <= 0),
      low: products.filter(p => {
        const stock = p.stock ?? 0;
        const threshold = (p as any).lowStockThreshold ?? 5;
        return stock > 0 && stock <= threshold;
      }),
    };
  }, [products]);

  const list = tab === 'low' ? low : empty;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#2563eb" />
          <Text style={{ color: '#2563eb', fontWeight: '700', fontSize: 15 }}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alerte Stock</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'low' && styles.tabActiveLow]}
          onPress={() => setTab('low')}
        >
          <Ionicons name="warning" size={18} color={tab === 'low' ? '#fff' : '#f97316'} />
          <Text style={[styles.tabText, tab === 'low' && { color: '#fff' }]}>
            Stock faible ({low.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'empty' && styles.tabActiveEmpty]}
          onPress={() => setTab('empty')}
        >
          <Ionicons name="close-circle" size={18} color={tab === 'empty' ? '#fff' : '#dc2626'} />
          <Text style={[styles.tabText, tab === 'empty' && { color: '#fff' }]}>
            Stock nul ({empty.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name={tab === 'low' ? 'checkmark-circle-outline' : 'cube-outline'}
              size={64}
              color="#cbd5e1"
            />
            <Text style={styles.emptyText}>
              {tab === 'low' ? 'Aucun produit en stock faible' : 'Aucun produit épuisé'}
            </Text>
            <Text style={styles.emptySub}>
              {tab === 'low'
                ? 'Tous vos produits ont plus d\'une unité en stock.'
                : 'Tous vos produits ont du stock disponible.'}
            </Text>
          </View>
        ) : (
          list.map(p => (
            <View key={p.id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: tab === 'low' ? '#fff7ed' : '#fef2f2' }]}>
                <Ionicons
                  name={tab === 'low' ? 'warning' : 'close-circle'}
                  size={22}
                  color={tab === 'low' ? '#f97316' : '#dc2626'}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.productSub}>
                  Prix vente: {p.price?.toFixed(2)} {(p as any).currency || 'EUR'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.stock, { color: tab === 'low' ? '#f97316' : '#dc2626' }]}>
                  {p.stock ?? 0}
                </Text>
                <Text style={styles.stockLabel}>en stock</Text>
              </View>
            </View>
          ))
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
  tabs: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  tabActiveLow: { backgroundColor: '#f97316' },
  tabActiveEmpty: { backgroundColor: '#dc2626' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  productSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  stock: { fontSize: 22, fontWeight: '900' },
  stockLabel: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#475569', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
