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
  ActivityIndicator,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'expo-router';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, convertCurrency } from '../../utils/currencies';
import { getUrgencyLevel, getUrgencyColor, shouldShowInAppAlert, markAlertShown } from '../../services/notificationService';
import { getCountryFromPhone } from '../../utils/countryFlags';
// Lazy import to prevent module-load crash if expo-print/expo-sharing native modules are missing
const lazyExport = {
  pdf: async (...args: any[]) => {
    try { const m = require('../../utils/exportService'); return m.exportSalesToPDF(...args); }
    catch (e) { console.warn('PDF export unavailable', e); Alert.alert('Export indisponible', "Cette fonction n'est pas disponible dans cette version."); }
  },
  excel: async (...args: any[]) => {
    try { const m = require('../../utils/exportService'); return m.exportSalesToExcel(...args); }
    catch (e) { console.warn('Excel export unavailable', e); Alert.alert('Export indisponible', "Cette fonction n'est pas disponible dans cette version."); }
  },
};
const exportSalesToPDF = lazyExport.pdf as any;
const exportSalesToExcel = lazyExport.excel as any;
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatLocal, localDayKey } from '../../utils/dateUtils';

import AppHeader from '../../components/AppHeader';
import { cardShadow } from '../../utils/shadows';

const BG = '#fef3e7';

export default function DashboardScreen() {
  const { sales, expenses, products, debts, purchases, refreshData } = useData();
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

  const [refreshing, setRefreshing] = useState(false);

  // Live clock — refreshes every 30 seconds so the displayed time stays current
  const [nowTime, setNowTime] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };
  const country = getCountryFromPhone(user?.phoneNumber || '');

  // State for chart period filter
  type Period = '1d' | '7d' | '30d' | 'custom';
  const [period, setPeriod] = useState<Period>('7d');
  const [customStartDate, setCustomStartDate] = useState<Date>(subDays(new Date(), 6));
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);

  // State for monthly report + graphs (use a "month anchor" date that points
  // to the 1st of the selected month at noon — avoids DST edge cases).
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0);
  });
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [monthlyOpen, setMonthlyOpen] = useState<boolean>(false);

  // Stock indicator: low = 1 unit, empty = 0 units
  const stockStats = useMemo(() => {
    const empty = products.filter(p => (p.stock ?? 0) === 0);
    const low = products.filter(p => (p.stock ?? 0) === 1);
    return { empty, low };
  }, [products]);

  // Monthly per-product report.
  //
  // Important business rule (user request):
  //   "Achats" come from PRODUCTS that were registered with a purchase price
  //   in the Products page — NOT from a separate purchases collection. So for
  //   each product whose `createdAt` falls in the selected month and which has
  //   `purchasePrice > 0`, we count it as a purchase of `stock + soldThisMonth`
  //   units (we add back what was sold to recover the original quantity).
  const monthlyReport = useMemo(() => {
    const start = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1, 0, 0, 0);
    const end = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1, 0, 0, 0);
    const userCurrency = user?.currency || 'USD';
    type Row = {
      productId: string;
      name: string;
      purchaseQty: number;
      purchaseAmount: number;
      purchaseDates: string[]; // ISO
      saleQty: number;
      saleAmount: number;
      saleDates: string[]; // ISO
    };
    const map = new Map<string, Row>();
    const ensure = (id: string, name: string): Row => {
      let row = map.get(id);
      if (!row) {
        row = { productId: id, name, purchaseQty: 0, purchaseAmount: 0, purchaseDates: [], saleQty: 0, saleAmount: 0, saleDates: [] };
        map.set(id, row);
      }
      return row;
    };

    // Pre-compute units sold *in the selected month* per product so we can
    // reconstruct the original purchased quantity.
    const soldThisMonthByProduct = new Map<string, number>();
    (sales || []).forEach(s => {
      try {
        const d = new Date(s.createdAt);
        if (d < start || d >= end) return;
        const pid = (s as any).productId || (s as any).id;
        soldThisMonthByProduct.set(pid, (soldThisMonthByProduct.get(pid) || 0) + Number((s as any).quantity || 0));
      } catch {}
    });

    // Sales rows
    (sales || []).forEach(s => {
      try {
        const d = new Date(s.createdAt);
        if (d < start || d >= end) return;
        const pid = (s as any).productId || (s as any).id;
        const row = ensure(pid, (s as any).productName || 'Produit');
        row.saleQty += Number((s as any).quantity || 0);
        row.saleAmount += convertCurrency(Number((s as any).totalAmount || 0), (s as any).currency || userCurrency, userCurrency);
        row.saleDates.push(s.createdAt);
      } catch {}
    });

    // Purchase rows derived from products registered this month
    (products || []).forEach(p => {
      try {
        if (!p.createdAt || !(p as any).purchasePrice || (p as any).purchasePrice <= 0) return;
        const d = new Date(p.createdAt);
        if (d < start || d >= end) return;
        const row = ensure(p.id, p.name);
        const soldThisMonth = soldThisMonthByProduct.get(p.id) || 0;
        const originalQty = Math.max(0, (p.stock ?? 0) + soldThisMonth);
        const unitCost = Number((p as any).purchasePrice || 0);
        row.purchaseQty += originalQty;
        row.purchaseAmount += convertCurrency(unitCost * originalQty, (p as any).currency || userCurrency, userCurrency);
        row.purchaseDates.push(p.createdAt);
      } catch {}
    });

    return Array.from(map.values()).sort((a, b) => (b.saleAmount + b.purchaseAmount) - (a.saleAmount + a.purchaseAmount));
  }, [selectedMonth, products, sales, user]);

  // Daily series for monthly graphs (purchases / sales / expenses)
  const monthlyDailySeries = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const userCurrency = user?.currency || 'USD';
    const purchasesArr: number[] = new Array(daysInMonth).fill(0);
    const salesArr: number[] = new Array(daysInMonth).fill(0);
    const expensesArr: number[] = new Array(daysInMonth).fill(0);

    // Sold-per-day-per-product for purchase qty reconstruction
    const soldByPidThisMonth: Record<string, number> = {};
    (sales || []).forEach(s => {
      try {
        const d = new Date(s.createdAt);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const pid = (s as any).productId || (s as any).id;
        soldByPidThisMonth[pid] = (soldByPidThisMonth[pid] || 0) + Number((s as any).quantity || 0);
      } catch {}
    });

    // Purchases = products with purchasePrice, created in this month
    (products || []).forEach(p => {
      try {
        if (!p.createdAt || !(p as any).purchasePrice || (p as any).purchasePrice <= 0) return;
        const d = new Date(p.createdAt);
        if (d.getFullYear() !== year || d.getMonth() !== month) return;
        const soldThisMonth = soldByPidThisMonth[p.id] || 0;
        const originalQty = Math.max(0, (p.stock ?? 0) + soldThisMonth);
        const unitCost = Number((p as any).purchasePrice || 0);
        const amount = convertCurrency(unitCost * originalQty, (p as any).currency || userCurrency, userCurrency);
        purchasesArr[d.getDate() - 1] += amount;
      } catch {}
    });

    (sales || []).forEach(s => {
      try {
        const d = new Date(s.createdAt);
        if (d.getFullYear() === year && d.getMonth() === month) {
          salesArr[d.getDate() - 1] += convertCurrency(Number((s as any).totalAmount || 0), (s as any).currency || userCurrency, userCurrency);
        }
      } catch {}
    });
    (expenses || []).forEach(e => {
      try {
        const d = new Date(e.createdAt);
        if (d.getFullYear() === year && d.getMonth() === month) {
          expensesArr[d.getDate() - 1] += convertCurrency(Number((e as any).amount || 0), (e as any).currency || userCurrency, userCurrency);
        }
      } catch {}
    });

    const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    return { labels, purchasesArr, salesArr, expensesArr, daysInMonth };
  }, [selectedMonth, products, sales, expenses, user]);

  const goPrevMonth = () => {
    setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1, 12, 0, 0));
    setExpandedProductId(null);
  };
  const goNextMonth = () => {
    const next = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1, 12, 0, 0);
    // Don't allow going BEYOND the current month (we compare year+month, not full dates,
    // so the user can navigate INTO the current month).
    const now = new Date();
    const nextIsFuture =
      next.getFullYear() > now.getFullYear() ||
      (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth());
    if (nextIsFuture) return;
    setSelectedMonth(next);
    setExpandedProductId(null);
  };
  const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: fr });

  // Revenue chart data based on selected period - converted to user currency
  const { chartData, periodLabel, filteredSales } = useMemo(() => {
    const userCurrency = user?.currency || 'USD';
    let startDate: Date;
    let endDate: Date = new Date();
    let label = '';

    if (period === '1d') {
      startDate = new Date(); startDate.setHours(0, 0, 0, 0);
      label = "Aujourd'hui";
    } else if (period === '7d') {
      startDate = subDays(new Date(), 6); startDate.setHours(0, 0, 0, 0);
      label = '7 jours';
    } else if (period === '30d') {
      startDate = subDays(new Date(), 29); startDate.setHours(0, 0, 0, 0);
      label = '30 jours';
    } else {
      startDate = new Date(customStartDate); startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate); endDate.setHours(23, 59, 59, 999);
      label = `${format(startDate, 'dd/MM')} - ${format(endDate, 'dd/MM')}`;
    }

    const filtered = sales.filter(s => {
      try {
        const d = new Date(s.createdAt);
        return d >= startDate && d <= endDate;
      } catch { return false; }
    });

    // Compute daily buckets
    const dayCount = Math.min(30, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)) + 1);
    const days: { label: string; value: number }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = format(date, 'yyyy-MM-dd');
      const dayLabel = dayCount <= 7
        ? (i === dayCount - 1 ? 'Auj' : format(date, 'EEE', { locale: fr }))
        : format(date, 'd MMM', { locale: fr });
      const dayRevenue = filtered
        .filter(s => {
          try { return localDayKey(s.createdAt) === dateKey; } catch { return false; }
        })
        .reduce((sum, s) => sum + convertCurrency(s.totalAmount, s.currency || userCurrency, userCurrency), 0);
      days.push({ label: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), value: dayRevenue });
    }
    return { chartData: days, periodLabel: label, filteredSales: filtered };
  }, [sales, user?.currency, period, customStartDate, customEndDate]);

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
        try { return localDayKey(s.createdAt) === dateKey; } catch { return false; }
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

      {/* Date row + Refresh */}
      <View style={styles.subHeader}>
        <Text style={styles.dateTime}>
          {nowTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {'  '}
          {nowTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <Ionicons name="refresh" size={22} color="#2563eb" />
          )}
          <Text style={styles.refreshText}>Actualiser</Text>
        </TouchableOpacity>
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

      {/* ============ STOCK ALERT (re-ordered to top per spec) ============ */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alerte Stock</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/stock-alerts', params: { type: 'low' } })}
            style={[styles.stockCard, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="warning" size={22} color="#f97316" />
              <Text style={{ color: '#9a3412', fontWeight: '700', fontSize: 13 }}>Stock faible</Text>
            </View>
            <Text style={[styles.stockCardValue, { color: '#f97316' }]}>{stockStats.low.length}</Text>
            <Text style={styles.stockCardHint}>produit(s) sous seuil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/stock-alerts', params: { type: 'empty' } })}
            style={[styles.stockCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="close-circle" size={22} color="#dc2626" />
              <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 13 }}>Stock nul</Text>
            </View>
            <Text style={[styles.stockCardValue, { color: '#dc2626' }]}>{stockStats.empty.length}</Text>
            <Text style={styles.stockCardHint}>produit(s) épuisé(s)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ============ Meilleures ventes (re-ordered to top per spec) ============ */}
      <View style={styles.section}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/best-sellers')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fef3c7', padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#fde68a' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="trophy" size={20} color="#d97706" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>Meilleures ventes</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, color: '#d97706', fontWeight: '600' }}>Voir la liste</Text>
            <Ionicons name="arrow-forward" size={18} color="#d97706" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Main Stats Cards (Total ventes / Total Charges / Total Dettes / Bénéfices) */}
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
                {isProfit ? 'Bénéfices' : i18n.t('loss')}
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

      {/* Revenue Chart with period filter */}
      <View style={styles.section}>
        <View style={styles.chartHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Historique des ventes</Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{periodLabel} · {filteredSales.length} vente(s)</Text>
          </View>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: '#eff6ff' }]}
              onPress={() => setShowPeriodPicker(true)}
            >
              <Ionicons name="calendar" size={16} color="#2563eb" />
              <Text style={[styles.exportBtnText, { color: '#2563eb' }]}>Période</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => exportSalesToPDF(filteredSales, currency, user?.phoneNumber || '')}
            >
              <Ionicons name="document-text" size={16} color="#dc2626" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0 }}>
          <View style={[styles.chartContainer, { minWidth: chartData.length > 7 ? chartData.length * 38 : screenWidth - 32 }]}>
            {chartData.map((day, index) => (
              <TouchableOpacity key={index} style={[styles.chartColumn, chartData.length > 7 && { minWidth: 38 }]} onPress={() => openDaySales(index)} activeOpacity={0.7}>
                <Text style={[styles.chartValue, chartData.length > 7 && { fontSize: 9 }]}>
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
                <Text style={[styles.chartLabel, chartData.length > 7 && { fontSize: 9 }, index === chartData.length - 1 && { fontWeight: '700', color: '#2563eb' }]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* (Stock Alert + Meilleures ventes ré-ordonnés tout en haut — sections originales supprimées ici) */}

      {/* (Old low stock section removed — replaced by the dedicated "État du stock" card above) */}

      <View style={{ height: 80 }} />

    {/* Period Picker Modal */}
    <Modal visible={showPeriodPicker} animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 }}>Choisir la période</Text>
          {([
            { key: '1d', label: "Aujourd'hui", icon: 'today' },
            { key: '7d', label: '7 derniers jours', icon: 'calendar' },
            { key: '30d', label: '30 derniers jours', icon: 'calendar-outline' },
            { key: 'custom', label: 'Période personnalisée', icon: 'calendar-clear' },
          ] as const).map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8, backgroundColor: period === opt.key ? '#eff6ff' : '#f8fafc' }}
              onPress={() => {
                setPeriod(opt.key);
                setShowPeriodPicker(false);
                if (opt.key === 'custom') setShowCustomDateModal(true);
              }}
            >
              <Ionicons name={opt.icon as any} size={22} color={period === opt.key ? '#2563eb' : '#64748b'} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: period === opt.key ? '#2563eb' : '#1e293b' }}>{opt.label}</Text>
              {period === opt.key && <Ionicons name="checkmark-circle" size={20} color="#2563eb" />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setShowPeriodPicker(false)} style={{ marginTop: 8, alignItems: 'center', padding: 12 }}>
            <Text style={{ color: '#64748b', fontSize: 14 }}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Custom Date Range Modal */}
    <Modal visible={showCustomDateModal} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 }}>Période personnalisée</Text>

          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Date de début</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => setCustomStartDate(subDays(customStartDate, 1))}
            >
              <Ionicons name="chevron-back" size={20} color="#1e293b" />
            </TouchableOpacity>
            <View style={{ flex: 1, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>
                {format(customStartDate, 'dd MMM yyyy', { locale: fr })}
              </Text>
            </View>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                const next = new Date(customStartDate);
                next.setDate(next.getDate() + 1);
                if (next <= customEndDate) setCustomStartDate(next);
              }}
            >
              <Ionicons name="chevron-forward" size={20} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 16, marginBottom: 8 }}>Date de fin</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                const prev = new Date(customEndDate);
                prev.setDate(prev.getDate() - 1);
                if (prev >= customStartDate) setCustomEndDate(prev);
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#1e293b" />
            </TouchableOpacity>
            <View style={{ flex: 1, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>
                {format(customEndDate, 'dd MMM yyyy', { locale: fr })}
              </Text>
            </View>
            <TouchableOpacity
              style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                const next = new Date(customEndDate);
                next.setDate(next.getDate() + 1);
                if (next <= new Date()) setCustomEndDate(next);
              }}
            >
              <Ionicons name="chevron-forward" size={20} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' }} onPress={() => setShowCustomDateModal(false)}>
              <Text style={{ color: '#64748b', fontWeight: '600' }}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' }} onPress={() => { setPeriod('custom'); setShowCustomDateModal(false); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Appliquer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Day Sales Modal */}
    <Modal visible={selectedDay !== null} animationType="slide" transparent onRequestClose={() => setSelectedDay(null)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { flex: 1, maxHeight: '85%' }]}>
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

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={true}
          >
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
                      {formatLocal(sale.createdAt, 'HH:mm')}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateTime: {
    fontSize: 12,
    color: '#64748b',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
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
  // Stock indicator
  stockCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
  },
  stockCardValue: {
    fontSize: 30,
    fontWeight: '800',
    marginTop: 6,
  },
  stockCardHint: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  stockListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Monthly overview
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthlyChartBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  productReportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
