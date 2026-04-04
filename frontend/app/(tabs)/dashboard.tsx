import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/currencies';

export default function DashboardScreen() {
  const { sales, expenses, products, debts } = useData();
  const { user, getDaysRemaining } = useAuth();
  const router = useRouter();

  const stats = useMemo(() => {
    const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDebts = debts.filter(d => !d.isPaid).reduce((sum, debt) => sum + debt.amount, 0);
    const netProfit = totalSales - totalExpenses;

    // Top selling products
    const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
    sales.forEach((sale) => {
      const existing = productSales.get(sale.productId) || { name: sale.productName, quantity: 0, revenue: 0 };
      productSales.set(sale.productId, {
        name: sale.productName,
        quantity: existing.quantity + sale.quantity,
        revenue: existing.revenue + sale.totalAmount,
      });
    });

    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return { totalSales, totalExpenses, netProfit, topProducts, totalDebts };
  }, [sales, expenses, debts]);

  const isProfit = stats.netProfit >= 0;
  const daysRemaining = getDaysRemaining();

  return (
    <ScrollView style={styles.container}>
      {/* Header with Slogan */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>TekaTeka</Text>
          <Text style={styles.slogan}>{i18n.t('slogan')}</Text>
        </View>
        {!user?.isSubscribed && daysRemaining > 0 && (
          <TouchableOpacity
            style={styles.trialBadge}
            onPress={() => router.push('/subscription')}
          >
            <Text style={styles.trialText}>
              {daysRemaining} {i18n.t('trialDaysLeft')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#92400e" />
          </TouchableOpacity>
        )}
      </View>

      {/* Success Stories with Photos */}
      <View style={styles.storiesSection}>
        <Text style={styles.storiesTitle}>Ils réussissent avec TekaTeka</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesScroll}>
          <View style={styles.storyCard}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1687422809654-579d81c29d32?w=400' }}
              style={styles.storyImage}
            />
            <View style={styles.storyOverlay}>
              <Text style={styles.storyName}>Marie K.</Text>
              <Text style={styles.storyLocation}>Kinshasa, RDC</Text>
              <Text style={styles.storyQuote}>"Mes bénéfices ont augmenté de 40%!"</Text>
            </View>
          </View>
          <View style={styles.storyCard}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400' }}
              style={styles.storyImage}
            />
            <View style={styles.storyOverlay}>
              <Text style={styles.storyName}>Dr. Kouassi</Text>
              <Text style={styles.storyLocation}>Abidjan, Côte d'Ivoire</Text>
              <Text style={styles.storyQuote}>"Gestion simplifiée de ma pharmacie"</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Main Stats Cards */}
      <View style={styles.statsContainer}>
        {/* Sales Card */}
        <View style={[styles.statCard, styles.salesCard]}>
          <View style={styles.statHeader}>
            <Ionicons name="trending-up" size={24} color="#10b981" />
            <Text style={styles.statLabel}>{i18n.t('totalSales')}</Text>
          </View>
          <Text style={[styles.statValue, { color: '#10b981' }]}>
            {formatCurrency(stats.totalSales, user?.currency || 'USD')}
          </Text>
          <Text style={styles.statCount}>{sales.length} transactions</Text>
        </View>

        {/* Expenses Card */}
        <View style={[styles.statCard, styles.expensesCard]}>
          <View style={styles.statHeader}>
            <Ionicons name="trending-down" size={24} color="#dc2626" />
            <Text style={styles.statLabel}>{i18n.t('totalExpenses')}</Text>
          </View>
          <Text style={[styles.statValue, { color: '#dc2626' }]}>
            {formatCurrency(stats.totalExpenses, user?.currency || 'USD')}
          </Text>
          <Text style={styles.statCount}>{expenses.length} expenses</Text>
        </View>

        {/* Debts Card */}
        <TouchableOpacity
          style={[styles.statCard, styles.debtsCard]}
          onPress={() => router.push('/(tabs)/debts')}
        >
          <View style={styles.statHeader}>
            <Ionicons name="receipt" size={24} color="#f59e0b" />
            <Text style={styles.statLabel}>{i18n.t('totalDebts')}</Text>
          </View>
          <Text style={[styles.statValue, { color: '#f59e0b' }]}>
            {formatCurrency(stats.totalDebts, user?.currency || 'USD')}
          </Text>
          <Text style={styles.statCount}>{debts.filter(d => !d.isPaid).length} non payées</Text>
          <Ionicons name="chevron-forward" size={20} color="#f59e0b" style={styles.cardArrow} />
        </TouchableOpacity>

        {/* Profit Card */}
        <View style={[styles.profitCard, isProfit ? styles.profitPositive : styles.profitNegative]}>
          <View style={styles.profitHeader}>
            <Ionicons
              name={isProfit ? "happy" : "sad"}
              size={32}
              color="#fff"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.profitLabel}>
                {isProfit ? i18n.t('profit') : i18n.t('loss')}
              </Text>
              <Text style={styles.profitValue}>
                {formatCurrency(Math.abs(stats.netProfit), user?.currency || 'USD')}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Top Products */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{i18n.t('topProducts')}</Text>
        {stats.topProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>No sales yet</Text>
          </View>
        ) : (
          stats.topProducts.map((product, index) => (
            <View key={index} style={styles.productItem}>
              <View style={styles.productRank}>
                <Text style={styles.rankNumber}>{index + 1}</Text>
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productStats}>
                  {product.quantity} sold • {formatCurrency(product.revenue, user?.currency || 'USD')}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Low Stock Alert */}
      {products.filter(p => p.stock < 5 && p.stock > 0).length > 0 && (
        <View style={styles.section}>
          <View style={styles.alertHeader}>
            <Ionicons name="warning" size={24} color="#f59e0b" />
            <Text style={styles.alertTitle}>Low Stock Alert</Text>
          </View>
          {products
            .filter(p => p.stock < 5 && p.stock > 0)
            .map((product) => (
              <View key={product.id} style={styles.alertItem}>
                <Text style={styles.alertProductName}>{product.name}</Text>
                <Text style={styles.alertStock}>{product.stock} left</Text>
              </View>
            ))}
        </View>
      )}

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  slogan: {
    fontSize: 14,
    color: '#2563eb',
    marginTop: 4,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  trialBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fbbf24',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trialText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  storiesSection: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    marginBottom: 16,
  },
  storiesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  storiesScroll: {
    paddingLeft: 20,
  },
  storyCard: {
    width: 280,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 16,
    position: 'relative',
  },
  storyImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  storyOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
  },
  storyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  storyLocation: {
    fontSize: 12,
    color: '#e2e8f0',
    marginBottom: 4,
  },
  storyQuote: {
    fontSize: 13,
    color: '#fbbf24',
    fontStyle: 'italic',
  },
  statsContainer: {
    padding: 16,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    position: 'relative',
  },
  salesCard: {
    borderLeftColor: '#10b981',
  },
  expensesCard: {
    borderLeftColor: '#dc2626',
  },
  debtsCard: {
    borderLeftColor: '#f59e0b',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
  cardArrow: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  profitCard: {
    borderRadius: 16,
    padding: 24,
    marginTop: 8,
  },
  profitPositive: {
    backgroundColor: '#10b981',
  },
  profitNegative: {
    backgroundColor: '#dc2626',
  },
  profitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profitLabel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    marginBottom: 4,
  },
  profitValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  productRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  productStats: {
    fontSize: 13,
    color: '#64748b',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
  },
  alertItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  alertProductName: {
    fontSize: 14,
    color: '#1e293b',
  },
  alertStock: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
});
