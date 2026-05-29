import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, CURRENCIES, convertCurrency } from '../../utils/currencies';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatLocal, localDayKey } from '../../utils/dateUtils';
import { cardShadow } from '../../utils/shadows';
import AppHeader from '../../components/AppHeader';
import { VoiceInputButton } from '../../components/VoiceInputButton';

const BG = '#fef3e7';

export default function SellScreen() {
  const { products, sales, addSale, updateSale, deleteSale } = useData();
  const { user } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobileMoney' | 'card'>('cash');
  const [currency, setCurrency] = useState(user?.currency || 'USD');
  const [showHistory, setShowHistory] = useState(false);
  const [editSaleModal, setEditSaleModal] = useState(false);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [editQty, setEditQty] = useState('');

  // Keep local currency in sync when the user changes their preferred currency
  // in the "Plus" / settings screen. Without this, the sell screen would keep
  // its initial value forever and prices would not re-convert.
  useEffect(() => {
    if (user?.currency && user.currency !== currency) {
      setCurrency(user.currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.currency]);

  const availableProducts = products.filter(p => p.stock > 0);

  // Effective price (promo or normal) in the PRODUCT's native currency.
  const getEffectivePriceNative = (p: any) => p.promotionPrice && p.promotionPrice > 0 ? p.promotionPrice : (p.salePrice || p.price || 0);
  // Price converted to the currently displayed currency so changing devise
  // re-applies the parity instead of just swapping the symbol.
  const getDisplayPrice = (p: any) => {
    const native = getEffectivePriceNative(p);
    const fromCur = (p as any).currency || user?.currency || currency;
    return convertCurrency(native, fromCur, currency);
  };
  // Backwards-compat alias used elsewhere
  const getEffectivePrice = getDisplayPrice;

  // Group sales by day
  const salesByDay = useMemo(() => {
    const filtered = [...sales]
      .filter(s => s.productId !== 'debt-payment')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const groups: { label: string; date: string; sales: typeof filtered; total: number }[] = [];
    const dayMap = new Map<string, typeof filtered>();
    
    filtered.forEach(sale => {
      try {
        const dateKey = localDayKey(sale.createdAt);
        if (!dateKey) return;
        if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
        dayMap.get(dateKey)!.push(sale);
      } catch {
        // skip invalid dates
      }
    });
    
    dayMap.forEach((daySales, dateKey) => {
      const date = new Date(dateKey);
      let label: string;
      if (isToday(date)) {
        label = "Aujourd'hui";
      } else if (isYesterday(date)) {
        label = 'Hier';
      } else {
        try {
          label = format(date, 'EEEE dd MMMM yyyy', { locale: fr });
          label = label.charAt(0).toUpperCase() + label.slice(1);
        } catch {
          label = dateKey;
        }
      }
      const total = daySales.reduce((s, sale) => s + convertCurrency(sale.totalAmount, sale.currency || currency, currency), 0);
      groups.push({ label, date: dateKey, sales: daySales, total });
    });
    
    return groups;
  }, [sales, currency]);

  // Debt payments (shown separately)
  const debtPayments = [...sales]
    .filter(s => s.productId === 'debt-payment')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleRecordSale = async () => {
    if (!selectedProduct) { Alert.alert(i18n.t('error'), i18n.t('selectProduct')); return; }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) { Alert.alert(i18n.t('error'), 'Quantite invalide'); return; }
    if (qty > selectedProduct.stock) { Alert.alert(i18n.t('error'), `Stock: ${selectedProduct.stock}`); return; }

    const price = getEffectivePrice(selectedProduct);
    try {
      await addSale({
        productId: selectedProduct.id, productName: selectedProduct.name,
        quantity: qty, price, totalAmount: price * qty, paymentMethod, currency,
      });
      Alert.alert(i18n.t('success'), `Vente enregistree: ${qty}x ${selectedProduct.name}`);
      setSelectedProduct(null); setQuantity('1');
    } catch (err) { Alert.alert(i18n.t('error'), 'Echec'); }
  };

  const openEditSale = (sale: any) => {
    setEditingSale(sale); setEditQty(sale.quantity.toString()); setEditSaleModal(true);
  };

  const handleUpdateSale = async () => {
    if (!editingSale) return;
    const qty = parseInt(editQty);
    if (isNaN(qty) || qty <= 0) { Alert.alert(i18n.t('error'), 'Quantite invalide'); return; }
    const newTotal = editingSale.price * qty;
    await updateSale(editingSale.id, { quantity: qty, totalAmount: newTotal });
    setEditSaleModal(false);
    Alert.alert(i18n.t('success'), 'Vente modifiee');
  };

  const handleDeleteSale = (id: string) => {
    Alert.alert(
      'Supprimer la vente',
      'Voulez-vous vraiment supprimer cette vente ?\n\nLe stock du produit sera réajusté. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteSale(id);
            Alert.alert(i18n.t('success'), 'Vente supprimée');
          },
        },
      ]
    );
  };

  const totalAmount = selectedProduct ? getEffectivePrice(selectedProduct) * parseInt(quantity || '0') : 0;

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView style={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>{i18n.t('sell')}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.historyBtn} onPress={() => setShowHistory(!showHistory)}>
          <Ionicons name={showHistory ? 'close' : 'time'} size={20} color="#2563eb" />
          <Text style={styles.historyBtnText}>{showHistory ? 'Fermer' : 'Historique'}</Text>
        </TouchableOpacity>
      </View>

      {showHistory ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historique des ventes ({sales.filter(s => s.productId !== 'debt-payment').length})</Text>
          {salesByDay.length === 0 ? (
            <Text style={styles.noData}>Aucune vente</Text>
          ) : (
            salesByDay.map((dayGroup) => (
              <View key={dayGroup.date} style={styles.dayGroup}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayLabelRow}>
                    <Ionicons name="calendar-outline" size={16} color="#2563eb" />
                    <Text style={styles.dayLabel}>{dayGroup.label}</Text>
                  </View>
                  <Text style={styles.dayTotal}>{formatCurrency(dayGroup.total, currency)}</Text>
                </View>
                {dayGroup.sales.map((sale) => (
                  <View key={sale.id} style={styles.saleCard}>
                    <View style={styles.saleInfo}>
                      <Text style={styles.saleName}>{sale.productName}</Text>
                      <Text style={styles.saleDate}>
                        {formatLocal(sale.createdAt, 'HH:mm')}
                      </Text>
                      <Text style={styles.saleDetail}>{sale.quantity}x {formatCurrency(sale.price, sale.currency)}</Text>
                    </View>
                    <View style={styles.saleRight}>
                      <Text style={styles.saleTotal}>{formatCurrency(sale.totalAmount, sale.currency)}</Text>
                      <View style={styles.saleActions}>
                        <TouchableOpacity onPress={() => openEditSale(sale)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                          <Ionicons name="pencil" size={16} color="#2563eb" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteSale(sale.id)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                          <Ionicons name="trash" size={16} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
          {/* Debt payments section */}
          {debtPayments.length > 0 && (
            <View style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <View style={styles.dayLabelRow}>
                  <Ionicons name="receipt-outline" size={16} color="#10b981" />
                  <Text style={[styles.dayLabel, { color: '#10b981' }]}>Dettes payées</Text>
                </View>
                <Text style={[styles.dayTotal, { color: '#10b981' }]}>
                  {formatCurrency(debtPayments.reduce((s, p) => s + convertCurrency(p.totalAmount, p.currency || currency, currency), 0), currency)}
                </Text>
              </View>
              {debtPayments.map((sale) => (
                <View key={sale.id} style={[styles.saleCard, { borderLeftWidth: 3, borderLeftColor: '#10b981' }]}>
                  <View style={styles.saleInfo}>
                    <Text style={styles.saleName}>{sale.productName}</Text>
                    <Text style={styles.saleDate}>
                      {formatLocal(sale.createdAt, 'dd/MM/yyyy HH:mm')}
                    </Text>
                  </View>
                  <Text style={[styles.saleTotal, { color: '#10b981' }]}>{formatCurrency(sale.totalAmount, sale.currency)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('selectProduct')}</Text>
            {availableProducts.length === 0 ? (
              <Text style={styles.noData}>{i18n.t('noData')}</Text>
            ) : (
              <View style={styles.productGrid}>
                {availableProducts.map((product) => {
                  const effPrice = getEffectivePrice(product);
                  const hasPromo = product.promotionPrice && product.promotionPrice > 0;
                  return (
                    <TouchableOpacity key={product.id}
                      style={[styles.productCard, selectedProduct?.id === product.id && styles.productCardSelected]}
                      onPress={() => setSelectedProduct(product)}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productPrice}>{formatCurrency(effPrice, currency)}</Text>
                      {hasPromo ? <Text style={styles.promoLabel}>Promo!</Text> : null}
                      <Text style={styles.productStock}>Stock: {product.stock}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {selectedProduct && (
            <Modal
              visible={!!selectedProduct}
              animationType="slide"
              transparent
              onRequestClose={() => setSelectedProduct(null)}
            >
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              >
                <View style={styles.sellModalOverlay}>
                  <View style={styles.sellModalSheet}>
                    {/* Header with close button */}
                    <View style={styles.sellModalHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sellModalTitle} numberOfLines={1}>{selectedProduct.name}</Text>
                        <Text style={styles.sellModalSubtitle}>
                          {formatCurrency(getEffectivePrice(selectedProduct), currency)} · Stock: {selectedProduct.stock}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedProduct(null)} style={styles.sellModalClose}>
                        <Ionicons name="close" size={24} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    <ScrollView
                      style={{ flexGrow: 0 }}
                      contentContainerStyle={{ paddingBottom: 12 }}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{i18n.t('quantity')}</Text>
                        <View style={styles.quantityContainer}>
                          <TouchableOpacity style={styles.quantityButton}
                            onPress={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}>
                            <Ionicons name="remove" size={24} color="#fff" />
                          </TouchableOpacity>
                          <TextInput style={styles.quantityInput} value={quantity}
                            onChangeText={setQuantity} keyboardType="number-pad" />
                          <TouchableOpacity style={styles.quantityButton}
                            onPress={() => setQuantity((parseInt(quantity) + 1).toString())}>
                            <Ionicons name="add" size={24} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{i18n.t('paymentMethod')}</Text>
                        <View style={styles.paymentRow}>
                          {(['cash', 'mobileMoney', 'card'] as const).map((m) => (
                            <TouchableOpacity key={m}
                              style={[styles.paymentButton, paymentMethod === m && styles.paymentButtonSelected]}
                              onPress={() => setPaymentMethod(m)}>
                              <Ionicons name={m === 'cash' ? 'cash' : m === 'mobileMoney' ? 'phone-portrait' : 'card'} size={22}
                                color={paymentMethod === m ? '#fff' : '#2563eb'} />
                              <Text style={[styles.paymentText, paymentMethod === m && styles.paymentTextSelected]}>
                                {m === 'cash' ? i18n.t('cash') : m === 'mobileMoney' ? i18n.t('mobileMoney') : 'Carte'}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Devise du client</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          {CURRENCIES.map((c) => (
                            <TouchableOpacity key={c.code}
                              style={[styles.currencyChip, currency === c.code && styles.currencyChipSelected]}
                              onPress={() => setCurrency(c.code)}>
                              <Text style={[styles.currencyChipText, currency === c.code && styles.currencyChipTextSelected]}>
                                {c.symbol} {c.code}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>

                      <View style={styles.totalCard}>
                        <Text style={styles.totalLabel}>{i18n.t('totalAmount')}</Text>
                        <Text style={styles.totalAmount}>{formatCurrency(totalAmount, currency)}</Text>
                      </View>
                    </ScrollView>

                    <TouchableOpacity style={[styles.recordButton, { marginTop: 8 }]} onPress={async () => { await handleRecordSale(); setSelectedProduct(null); }}>
                      <Ionicons name="checkmark-circle" size={24} color="#fff" />
                      <Text style={styles.recordButtonText}>{i18n.t('recordSale')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          )}
        </>
      )}

      <View style={{ height: 40 }} />

      {/* Edit Sale Modal */}
      <Modal visible={editSaleModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier la vente</Text>
              <TouchableOpacity onPress={() => setEditSaleModal(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            {editingSale && (
              <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.editLabel}>Produit: {editingSale.productName}</Text>
                <Text style={styles.editLabel}>Prix unitaire: {formatCurrency(editingSale.price, editingSale.currency)}</Text>
                <Text style={styles.editLabel}>Date: {formatLocal(editingSale.createdAt, 'dd/MM/yyyy HH:mm')}</Text>
                <Text style={[styles.label, { marginTop: 16 }]}>Nouvelle quantite</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={editQty}
                    onChangeText={setEditQty} keyboardType="number-pad" />
                  <VoiceInputButton onTranscript={(t) => { const n = t.replace(/[^0-9]/g, ''); if (n) setEditQty(n); }} />
                </View>
                {editQty && (
                  <Text style={styles.editTotal}>Nouveau total: {formatCurrency(editingSale.price * (parseInt(editQty) || 0), editingSale.currency)}</Text>
                )}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditSaleModal(false)}>
                <Text style={styles.cancelButtonText}>{i18n.t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleUpdateSale}>
                <Text style={styles.saveButtonText}>{i18n.t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scrollContent: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: '#f0d9c0', gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  historyBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 12 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productCard: { backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#e2e8f0', width: '48%', minHeight: 90 },
  productCardSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  productName: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  productPrice: { fontSize: 17, fontWeight: 'bold', color: '#2563eb', marginBottom: 2 },
  promoLabel: { fontSize: 11, color: '#92400e', fontWeight: '700', backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 2 },
  productStock: { fontSize: 12, color: '#64748b' },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  quantityButton: { backgroundColor: '#2563eb', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  quantityInput: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 24, fontWeight: 'bold', textAlign: 'center', minWidth: 90 },
  paymentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  paymentButton: { flex: 1, minWidth: 100, backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  paymentButtonSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  paymentText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  paymentTextSelected: { color: '#fff' },
  // Currency chips
  currencyChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#fff', marginRight: 8 },
  currencyChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  currencyChipText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  currencyChipTextSelected: { color: '#fff' },
  totalCard: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#2563eb' },
  totalLabel: { fontSize: 14, color: '#64748b', marginBottom: 6 },
  totalAmount: { fontSize: 30, fontWeight: 'bold', color: '#2563eb' },
  recordButton: { backgroundColor: '#10b981', margin: 16, padding: 18, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  recordButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  // Bottom-sheet modal qu'on ouvre quand un produit est tapé. Évite de
  // scroller la page entière vers le bas pour saisir la quantité/devise/etc.
  sellModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sellModalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32, maxHeight: '85%' },
  sellModalHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  sellModalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sellModalSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  sellModalClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  noData: { textAlign: 'center', color: '#94a3b8', fontSize: 15, marginTop: 20 },
  // Sales history
  saleCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#ede0d4', ...cardShadow },
  saleInfo: { flex: 1 },
  saleName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  saleDate: { fontSize: 12, color: '#2563eb', fontWeight: '500', marginTop: 2 },
  saleDetail: { fontSize: 12, color: '#64748b', marginTop: 2 },
  saleRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  saleTotal: { fontSize: 17, fontWeight: 'bold', color: '#10b981' },
  saleActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  // Day grouping
  dayGroup: { marginBottom: 20, backgroundColor: '#fff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#ede0d4', ...cardShadow },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1e5d8' },
  dayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  dayTotal: { fontSize: 16, fontWeight: '800', color: '#1e293b', backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 16 },
  editLabel: { fontSize: 15, color: '#475569', marginBottom: 4 },
  editTotal: { fontSize: 18, fontWeight: 'bold', color: '#2563eb', marginTop: 12, textAlign: 'center' },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  cancelButton: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  saveButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
