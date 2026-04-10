import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, convertCurrency } from '../../utils/currencies';
import { getUrgencyLevel, getUrgencyColor, shouldShowInAppAlert, markAlertShown } from '../../services/notificationService';
import { getCountryFromPhone } from '../../utils/countryFlags';
import { exportSalesToPDF, exportSalesToExcel } from '../../utils/exportService';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

import AppHeader from '../../components/AppHeader';
import { cardShadow } from '../../utils/shadows';

const BG = '#fef3e7';

export default function DashboardScreen() {
  const { sales, expenses, products, debts, purchases } = useData();
  const { user, getDaysRemaining, isSubscriptionActive, showExpiryReminder, getSubscriptionDaysRemaining, needsSubscription } = useAuth();
  const router = useRouter();

  const stats = useMemo(() => {
    const userCurrency = user?.currency || 'USD';
    
    // Convert all sales to user's currency
    const totalSales = sales.reduce((sum, sale) => {
      return sum + convertCurrency(sale.totalAmount, sale.currency || userCurrency, userCurrency);
    }, 0);
    
    const totalExpenses = expenses.reduce((sum, exp) => {
      return sum + convertCurrency(exp.amount, exp.currency || userCurrency, userCurrency);
    }, 0);
    
    const totalDebts = debts.filter(d => !d.isPaid).reduce((sum, debt) => {
      return sum + convertCurrency(debt.amount, debt.currency || userCurrency, userCurrency);
    }, 0);
    
    const totalPurchases = products.reduce((sum, p) => sum + (p.purchasePrice || 0) * p.stock, 0);
    const netProfit = totalSales - totalExpenses;
    const realProfit = totalSales - totalExpenses - totalPurchases;

    // Top selling products (converted)
    const productSales: Map<string, { name: string; quantity: number; revenue: number }> = new Map();
    sales.forEach((sale) => {
      if (sale.productId === 'debt-payment') return;
      const convertedRevenue = convertCurrency(sale.totalAmount, sale.currency || userCurrency, userCurrency);
      const existing = productSales.get(sale.productId) || { name: sale.productName, quantity: 0, revenue: 0 };
      productSales.set(sale.productId, {
        name: sale.productName,
        quantity: existing.quantity + sale.quantity,
        revenue: existing.revenue + convertedRevenue,
      });
    });

    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return { totalSales, totalExpenses, netProfit, realProfit, topProducts, totalDebts, totalPurchases };
  }, [sales, expenses, debts, purchases, products, user?.currency]);

  const isProfit = stats.realProfit >= 0;
  const currency = user?.currency || 'USD';
  const daysRemaining = getDaysRemaining();
  const isSubActive = isSubscriptionActive();
  const expiryReminder = showExpiryReminder();
  const subDaysLeft = getSubscriptionDaysRemaining();

  // Country flag from phone number
  const country = getCountryFromPhone(user?.phoneNumber || '');

  // Revenue chart data (last 7 days) - converted to user currency
  const chartData = useMemo(() => {
    const userCurrency = user?.currency || 'USD';
    const days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateKey = format(date, 'yyyy-MM-dd');
      const dayLabel = i === 0 ? "Auj" : i === 1 ? "Hier" : format(date, 'EEE', { locale: fr });
      const dayRevenue = sales
        .filter(s => {
          try { return format(new Date(s.createdAt), 'yyyy-MM-dd') === dateKey; } catch { return false; }
        })
        .reduce((sum, s) => sum + convertCurrency(s.totalAmount, s.currency || userCurrency, userCurrency), 0);
      days.push({ label: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), value: dayRevenue });
    }
    return days;
  }, [sales, user?.currency]);

  const maxChartValue = Math.max(...chartData.map(d => d.value), 1);
  const screenWidth = Dimensions.get('window').width - 48;

  // State for day sales modal
  const [selectedDay, setSelectedDay] = useState<{ label: string; dateKey: string; sales: any[]; total: number } | null>(null);

  const openDaySales = (dayIndex: number) => {
    const day = chartData[dayIndex];
    const date = subDays(new Date(), 6 - dayIndex);
    const dateKey = format(date, 'yyyy-MM-dd');
    const userCurrency = user?.currency || 'USD';
    const daySales = sales
      .filter(s => {
        try { return format(new Date(s.createdAt), 'yyyy-MM-dd') === dateKey; } catch { return false; }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = daySales.reduce((sum, s) => sum + convertCurrency(s.totalAmount, s.currency || userCurrency, userCurrency), 0);
    setSelectedDay({ label: day.label, dateKey, sales: daySales, total });
  };

  // Determine urgency for trial or subscription
  const urgencyDays = isSubActive ? subDaysLeft : daysRemaining;
  const urgencyLevel = getUrgencyLevel(urgencyDays);
  const urgencyColors = getUrgencyColor(urgencyLevel);
  const showBanner = (daysRemaining <= 7 && daysRemaining > 0 && !isSubActive) || (expiryReminder && isSubActive);

  // In-app alert on dashboard open for critical urgency
  useEffect(() => {
    if (urgencyLevel === 'critical' || urgencyLevel === 'warning') {
      shouldShowInAppAlert().then(shouldShow => {
        if (shouldShow) {
          const label = isSubActive ? 'abonnement' : 'essai gratuit';
          Alert.alert(
            `${urgencyDays <= 1 ? 'Urgent' : 'Rappel'} - ${label}`,
            urgencyDays <= 1
              ? `Votre ${label} expire ${urgencyDays === 0 ? "aujourd'hui" : 'demain'} ! Renouvelez maintenant pour ne pas perdre l'acces.`
              : `Plus que ${urgencyDays} jours sur votre ${label}. Pensez a renouveler !`
          );
          markAlertShown();
        }
      });
    }
  }, [urgencyLevel]);

  return (
    <View style={styles.container}>
      {/* Fixed Dark Header */}
      <AppHeader showSubscription />

      <ScrollView style={styles.scrollContent}>

      {/* Date & Slogan row */}
      <View style={styles.subHeader}>
        <Text style={styles.slogan}>{i18n.t('slogan')}</Text>
        <Text style={styles.dateTime}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {'  '}
          {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {/* Expiry Reminder Banner */}
      {showBanner && (
        <TouchableOpacity
          style={[styles.expiryBanner, {
            backgroundColor: urgencyColors.bg,
            borderColor: urgencyColors.border,
          }]}
          onPress={() => router.push('/subscription')}
          activeOpacity={0.8}
        >
          <View style={styles.expiryBannerLeft}>
            <Ionicons
              name={urgencyLevel === 'critical' ? 'warning' : urgencyLevel === 'warning' ? 'time' : 'information-circle'}
              size={24}
              color={urgencyColors.icon}
            />
            <View style={styles.expiryBannerText}>
              <Text style={[styles.expiryBannerTitle, { color: urgencyColors.text }]}>
                {urgencyLevel === 'critical'
                  ? (urgencyDays === 0 ? "Expire aujourd'hui !" : 'Expire demain !')
                  : urgencyLevel === 'warning'
                  ? `${urgencyDays} jours restants`
                  : `${urgencyDays} jours restants`}
              </Text>
              <Text style={[styles.expiryBannerSub, { color: urgencyColors.text }]}>
                {isSubActive ? 'Renouvelez votre abonnement' : 'Passez a un abonnement'}
              </Text>
            </View>
          </View>
          <View style={[styles.expiryBannerBtn, { backgroundColor: urgencyColors.icon }]}>
            <Text style={styles.expiryBannerBtnText}>
              {isSubActive ? 'Renouveler' : "S'abonner"}
            </Text>
          </View>
        </TouchableOpacity>
      )}

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
          <View style={styles.storyCard}>
            <Image
              source={{ uri: 'https://images.pexels.com/photos/36534594/pexels-photo-36534594.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940' }}
              style={styles.storyImage}
            />
            <View style={styles.storyOverlay}>
              <Text style={styles.storyName}>Sifa M.</Text>
              <Text style={styles.storyLocation}>Lubumbashi, RDC</Text>
              <Text style={styles.storyQuote}>"Ma pharmacie est mieux gérée!"</Text>
            </View>
          </View>
          <View style={styles.storyCard}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1671468158276-b486e8411457?w=400' }}
              style={styles.storyImage}
            />
            <View style={styles.storyOverlay}>
              <Text style={styles.storyName}>Patrick M.</Text>
              <Text style={styles.storyLocation}>Douala, Cameroun</Text>
              <Text style={styles.storyQuote}>"Je gère mes courses taxi facilement!"</Text>
            </View>
          </View>
          <View style={styles.storyCard}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1649399044617-a9b212467213?w=400' }}
              style={styles.storyImage}
            />
            <View style={styles.storyOverlay}>
              <Text style={styles.storyName}>Aminata D.</Text>
              <Text style={styles.storyLocation}>Dakar, Sénégal</Text>
              <Text style={styles.storyQuote}>"Ma boutique est mieux organisée!"</Text>
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
          <Text style={styles.statCount}>{expenses.length} charges</Text>
        </View>

        {/* Purchases Card */}
        <TouchableOpacity
          style={[styles.statCard, styles.purchasesCard]}
          onPress={() => router.push('/(tabs)/purchases')}
        >
          <View style={styles.statHeader}>
            <Ionicons name="bag-handle" size={24} color="#7c3aed" />
            <Text style={styles.statLabel}>{i18n.t('totalPurchases')}</Text>
          </View>
          <Text style={[styles.statValue, { color: '#7c3aed' }]}>
            {formatCurrency(stats.totalPurchases, user?.currency || 'USD')}
          </Text>
          <Text style={styles.statCount}>{purchases.length} achats</Text>
          <Ionicons name="chevron-forward" size={20} color="#7c3aed" style={styles.cardArrow} />
        </TouchableOpacity>

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

        {/* Real Profit Card */}
        <View style={[styles.profitCard, isProfit ? styles.profitPositive : styles.profitNegative]}>
          <View style={styles.profitHeader}>
            <Ionicons
              name={isProfit ? "happy" : "sad"}
              size={32}
              color="#fff"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.profitLabel}>
                {isProfit ? i18n.t('realProfit') || i18n.t('profit') : i18n.t('loss')}
              </Text>
              <Text style={styles.profitValue}>
                {formatCurrency(Math.abs(stats.realProfit), user?.currency || 'USD')}
              </Text>
              <Text style={styles.profitFormula}>
                Ventes - Charges - Achats
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Revenue Chart - Last 7 days */}
      <View style={styles.section}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Chiffre d'affaires (7 jours)</Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => exportSalesToPDF(sales, currency, user?.phoneNumber || '')}
            >
              <Ionicons name="document-text" size={16} color="#dc2626" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => exportSalesToExcel(sales, currency, user?.phoneNumber || '')}
            >
              <Ionicons name="grid" size={16} color="#10b981" />
              <Text style={[styles.exportBtnText, { color: '#10b981' }]}>Excel</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.chartContainer}>
          {chartData.map((day, index) => (
            <TouchableOpacity key={index} style={styles.chartColumn} onPress={() => openDaySales(index)} activeOpacity={0.7}>
              <Text style={styles.chartValue}>
                {day.value > 0 ? (day.value >= 1000 ? `${(day.value / 1000).toFixed(1)}k` : Math.round(day.value).toString()) : ''}
              </Text>
              <View style={styles.chartBarBg}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: `${Math.max((day.value / maxChartValue) * 100, 2)}%`,
                      backgroundColor: index === chartData.length - 1 ? '#2563eb' : '#93c5fd',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.chartLabel, index === chartData.length - 1 && { fontWeight: '700', color: '#2563eb' }]}>
                {day.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Top Products */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{i18n.t('topProducts')}</Text>
        {stats.topProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Aucune vente</Text>
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
                  {product.quantity} vendus • {formatCurrency(product.revenue, user?.currency || 'USD')}
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
            <Text style={styles.alertTitle}>Stock faible</Text>
          </View>
          {products
            .filter(p => p.stock < 5 && p.stock > 0)
            .map((product) => (
              <View key={product.id} style={styles.alertItem}>
                <Text style={styles.alertProductName}>{product.name}</Text>
                <Text style={styles.alertStock}>{product.stock} restant(s)</Text>
              </View>
            ))}
        </View>
      )}

      <View style={{ height: 80 }} />

    {/* Day Sales Modal */}
    <Modal visible={selectedDay !== null} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Ventes — {selectedDay?.label}
            </Text>
            <TouchableOpacity onPress={() => setSelectedDay(null)}>
              <Ionicons name="close-circle" size={30} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalTotalBanner}>
            <Ionicons name="cash" size={20} color="#10b981" />
            <Text style={styles.modalTotalText}>
              Total : {formatCurrency(selectedDay?.total || 0, currency)}
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 400 }}>
            {selectedDay?.sales.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
                <Text style={{ color: '#94a3b8', marginTop: 8, fontSize: 15 }}>Aucune vente ce jour</Text>
              </View>
            ) : (
              selectedDay?.sales.map((sale: any) => (
                <View key={sale.id} style={styles.modalSaleCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>{sale.productName}</Text>
                    <Text style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>
                      {(() => { try { return format(new Date(sale.createdAt), 'HH:mm'); } catch { return ''; } })()}
                      {' • '}{sale.quantity}x {formatCurrency(sale.price, sale.currency || currency)}
                      {sale.currency && sale.currency !== currency ? ` (${sale.currency})` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#10b981' }}>
                    {formatCurrency(convertCurrency(sale.totalAmount, sale.currency || currency, currency), currency)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    backgroundColor: BG,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoImage: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  flagEmoji: {
    fontSize: 22,
    marginLeft: 4,
  },
  slogan: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  subHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: BG,
  },
  dateTime: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
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
  activeBadge: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  activeText: {
    color: '#065f46',
  },
  warningBadge: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  expiredBadge: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  expiredText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  // Expiry reminder banner
  expiryBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...cardShadow,
  },
  expiryBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  expiryBannerText: {
    flex: 1,
  },
  expiryBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  expiryBannerSub: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
  },
  expiryBannerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 8,
  },
  expiryBannerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  storiesSection: {
    backgroundColor: BG,
    paddingVertical: 20,
    marginBottom: 8,
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
    ...cardShadow,
  },
  salesCard: {
    borderLeftColor: '#10b981',
  },
  expensesCard: {
    borderLeftColor: '#dc2626',
  },
  purchasesCard: {
    borderLeftColor: '#7c3aed',
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
  profitFormula: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    padding: 20,
    ...cardShadow,
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
  // Chart styles
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 180,
    paddingHorizontal: 4,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  chartValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    height: 14,
  },
  chartBarBg: {
    width: '70%',
    height: 130,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    borderRadius: 6,
    minHeight: 3,
  },
  chartLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  // Day sales modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  modalTotalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  modalTotalText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#166534',
  },
  modalSaleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
});
