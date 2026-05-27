import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, Modal, Switch, ActivityIndicator,
  KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/currencies';
import { CategoryType } from '../../types';
import { cardShadow } from '../../utils/shadows';
import AppHeader from '../../components/AppHeader';
import CurrencyAmountInput from '../../components/CurrencyAmountInput';
import { VoiceInputButton } from '../../components/VoiceInputButton';

const BG = '#fef3e7';
const CATEGORIES: CategoryType[] = ['food', 'drinks', 'clothes', 'cosmetics', 'electronics', 'other'];

// Hybrid unit list per spec: predefined choices + "autre" -> custom free text.
// Used for stock management, sales, search, stats AND duplicate detection.
const UNIT_OPTIONS = [
  'pcs', 'kg', 'g', 'L', 'mL', 'sac', 'carton', 'bouteille',
  'paquet', 'caisse', 'botte', 'mètre', 'boîte', 'douzaine', 'autre',
] as const;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export default function ProductsScreen() {
  const { products, addProduct, updateProduct, deleteProduct, restockProduct, loading } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [hasPromo, setHasPromo] = useState(false);
  const [unitPickerVisible, setUnitPickerVisible] = useState(false);
  const [restockModal, setRestockModal] = useState<null | {
    product: any;
    samePrice: boolean;
    suggestedQty: string;
    suggestedPrice: string;
    pendingName: string;
  }>(null);
  const [formData, setFormData] = useState({
    name: '', purchasePrice: '', salePrice: '', promotionPrice: '', stock: '',
    category: 'food' as CategoryType,
    unit: '' as string,           // preset value OR custom if user chose "autre"
    customUnit: '',               // shown when unit === 'autre'
    lowStockThreshold: String(DEFAULT_LOW_STOCK_THRESHOLD),
  });
  const [formCurrency, setFormCurrency] = useState(user?.currency || 'USD');

  const currency = user?.currency || 'USD';
  const totalInventoryValue = products.reduce((s, p) => s + (p.purchasePrice || 0) * p.stock, 0);

  const openAddModal = () => {
    setEditingProduct(null);
    setHasPromo(false);
    setFormData({
      name: '', purchasePrice: '', salePrice: '', promotionPrice: '', stock: '',
      category: 'food', unit: '', customUnit: '',
      lowStockThreshold: String(DEFAULT_LOW_STOCK_THRESHOLD),
    });
    setFormCurrency(currency);
    setModalVisible(true);
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setHasPromo(!!product.promotionPrice);
    // For editing, we pre-fill unit. If the stored unit matches a preset, the
    // picker shows that preset; otherwise we show "autre" + the custom value.
    const storedUnit: string = product.unit || '';
    const isPreset = (UNIT_OPTIONS as readonly string[]).includes(storedUnit) && storedUnit !== 'autre';
    setFormData({
      name: product.name,
      purchasePrice: (product.purchasePrice || 0).toString(),
      salePrice: (product.salePrice || product.price || 0).toString(),
      promotionPrice: (product.promotionPrice || '').toString(),
      stock: product.stock.toString(),
      category: product.category,
      unit: isPreset ? storedUnit : (storedUnit ? 'autre' : ''),
      customUnit: isPreset ? '' : storedUnit,
      lowStockThreshold: String(product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD),
    });
    setModalVisible(true);
  };

  /**
   * Confirm and execute a restock of an existing product the user tried to
   * recreate. If newPurchasePrice differs from the existing one, the backend
   * automatically writes a purchase_price_history record so the old price
   * stays available for accounting.
   */
  const confirmRestock = async () => {
    if (!restockModal) return;
    const qty = parseInt(restockModal.suggestedQty || '0', 10);
    if (!qty || qty <= 0) {
      Alert.alert(i18n.t('error'), 'Quantité à ajouter invalide');
      return;
    }
    const newPriceNum = restockModal.suggestedPrice ? parseFloat(restockModal.suggestedPrice) : NaN;
    const newPurchasePrice = !isNaN(newPriceNum) && newPriceNum >= 0 ? newPriceNum : undefined;
    try {
      await restockProduct(restockModal.product.id, {
        quantityAdded: qty,
        newPurchasePrice,
        currency: formCurrency,
        note: 'Réapprovisionnement depuis "Ajouter produit"',
      });
      const wasPriceChange =
        newPurchasePrice !== undefined &&
        Math.abs(newPurchasePrice - (restockModal.product.purchasePrice || 0)) > 1e-9;
      Alert.alert(
        i18n.t('success'),
        `Stock de "${restockModal.product.name}" augmenté de ${qty}.` +
        (wasPriceChange ? '\n📊 Nouveau prix d\'achat enregistré dans l\'historique.' : '')
      );
      setRestockModal(null);
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert(i18n.t('error'), e?.message || 'Échec du réapprovisionnement');
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.purchasePrice || !formData.salePrice || !formData.stock) {
      Alert.alert(i18n.t('error'), 'Veuillez remplir tous les champs obligatoires');
      return;
    }
    const purchasePrice = parseFloat(formData.purchasePrice);
    const salePrice = parseFloat(formData.salePrice);
    const stock = parseInt(formData.stock);
    const promotionPrice = hasPromo && formData.promotionPrice ? parseFloat(formData.promotionPrice) : undefined;
    const lowStockThreshold = Math.max(
      0,
      parseInt(formData.lowStockThreshold || String(DEFAULT_LOW_STOCK_THRESHOLD), 10) || DEFAULT_LOW_STOCK_THRESHOLD,
    );

    if (isNaN(purchasePrice) || isNaN(salePrice) || isNaN(stock) || purchasePrice < 0 || salePrice <= 0 || stock < 0) {
      Alert.alert(i18n.t('error'), 'Valeurs invalides');
      return;
    }

    // Resolve the unit: if user picked "autre", promote customUnit; else use preset.
    const resolvedUnit = formData.unit === 'autre'
      ? (formData.customUnit || '').trim() || undefined
      : (formData.unit || undefined);

    if (formData.unit === 'autre' && !resolvedUnit) {
      Alert.alert(i18n.t('error'), 'Veuillez préciser l\'unité personnalisée');
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          name: formData.name, purchasePrice, salePrice, promotionPrice, stock,
          category: formData.category,
          unit: resolvedUnit as any,
          lowStockThreshold,
        });
        setModalVisible(false);
        return;
      }

      // CREATE path -> backend may detect a duplicate and ask us to restock instead.
      const result = await addProduct({
        name: formData.name, purchasePrice, salePrice, promotionPrice, stock,
        category: formData.category,
        unit: resolvedUnit as any,
        customUnit: undefined as any,
        lowStockThreshold,
      } as any);

      if (result?.duplicate && result.existing) {
        // Ask the user whether to restock the existing product. The dialog
        // also surfaces a price change so they don't accidentally overwrite
        // their purchase price without realizing.
        const existing = result.existing;
        const samePrice = !!result.samePrice;
        Alert.alert(
          'Produit déjà existant',
          `Ce produit existe déjà (${existing.sku || 'sans SKU'}, stock actuel: ${existing.stock} ${existing.unit || ''}).\n\n` +
          'Voulez-vous augmenter le stock existant ?' +
          (!samePrice ? '\n\n⚠️ Le prix d\'achat saisi est différent — l\'historique sera conservé.' : ''),
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Augmenter le stock',
              onPress: () => {
                setRestockModal({
                  product: existing,
                  samePrice,
                  suggestedQty: String(stock || 1),
                  suggestedPrice: samePrice ? '' : String(purchasePrice),
                  pendingName: formData.name,
                });
              },
            },
          ]
        );
        return; // keep the main modal open in background while restockModal shows
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert(i18n.t('error'), err?.message || 'Echec de sauvegarde');
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Supprimer le produit',
      `Voulez-vous vraiment supprimer "${name}" ?\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteProduct(id);
            Alert.alert(i18n.t('success'), `"${name}" supprimé`);
          },
        },
      ]
    );
  };

  const getEffectivePrice = (p: any) => p.promotionPrice && p.promotionPrice > 0 ? p.promotionPrice : (p.salePrice || p.price || 0);
  const getMargin = (p: any) => {
    const sell = getEffectivePrice(p);
    const buy = p.purchasePrice || 0;
    return buy > 0 ? sell - buy : 0;
  };

  const qtyVal = formData.stock ? parseInt(formData.stock) : 0;
  const ppVal = formData.purchasePrice ? parseFloat(formData.purchasePrice) : 0;
  const totalCostPreview = qtyVal * ppVal;

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{i18n.t('products')}</Text>
          <Text style={styles.totalText}>Inventaire: {formatCurrency(totalInventoryValue, currency)}</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Column Headers */}
      {products.length > 0 && (
        <View style={styles.columnHeader}>
          <Text style={[styles.colText, { flex: 2.5 }]}>Produit</Text>
          <Text style={[styles.colText, { flex: 1.5 }]}>Achat/u</Text>
          <Text style={[styles.colText, { flex: 1 }]}>Qte</Text>
          <Text style={[styles.colText, { flex: 1.5 }]}>Total</Text>
        </View>
      )}

      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.emptySubtext}>Chargement...</Text>
          </View>
        ) : products.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>{i18n.t('noData')}</Text>
            <Text style={styles.emptySubtext}>Appuyez + pour ajouter un produit</Text>
          </View>
        ) : (
          products.map((product) => {
            const effectivePrice = getEffectivePrice(product);
            const margin = getMargin(product);
            const totalCost = (product.purchasePrice || 0) * product.stock;
            return (
              <TouchableOpacity key={product.id} style={styles.productCard} onPress={() => openEditModal(product)} activeOpacity={0.7}>
                {/* Row 1: Table-like columns */}
                <View style={styles.tableRow}>
                  <View style={{ flex: 2.5 }}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {product.name}
                      {product.unit ? <Text style={styles.unitInline}>  · {product.unit}</Text> : null}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={styles.productCategory}>{i18n.t(product.category)}</Text>
                      {product.sku ? (
                        <View style={styles.skuBadge}>
                          <Text style={styles.skuBadgeText}>{product.sku}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.cellText, { flex: 1.5 }]}>{formatCurrency(product.purchasePrice || 0, currency)}</Text>
                  <Text style={[styles.cellText, { flex: 1, textAlign: 'center' }]}>{product.stock}</Text>
                  <Text style={[styles.cellTextBold, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(totalCost, currency)}</Text>
                </View>
                {/* Row 2: Prix vente + marge + stock alert */}
                <View style={styles.priceRow}>
                  <View style={styles.priceTag}>
                    <Ionicons name="pricetag" size={12} color="#2563eb" />
                    <Text style={styles.salePriceText}>Vente: {formatCurrency(product.salePrice || 0, currency)}</Text>
                  </View>
                  {product.promotionPrice && product.promotionPrice > 0 ? (
                    <View style={styles.promoBadge}>
                      <Text style={styles.promoText}>Promo: {formatCurrency(product.promotionPrice, currency)}</Text>
                    </View>
                  ) : null}
                  {margin > 0 ? (
                    <View style={styles.marginBadge}>
                      <Text style={styles.marginText}>+{formatCurrency(margin, currency)}/u</Text>
                    </View>
                  ) : null}
                  {/* Stock-state badge. Recomputed from live product fields so
                      it disappears immediately after a restock and reappears
                      automatically if the stock drops back at/below threshold. */}
                  {(() => {
                    const stock = product.stock ?? 0;
                    const threshold = (product as any).lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
                    if (stock <= 0) {
                      return <View style={styles.stockBadgeEmpty}><Text style={styles.stockBadgeEmptyText}>Rupture</Text></View>;
                    }
                    if (stock <= threshold) {
                      return <View style={styles.stockBadgeLow}><Text style={styles.stockBadgeLowText}>Faible</Text></View>;
                    }
                    return null;
                  })()}
                  <View style={{ flex: 1 }} />
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => openEditModal(product)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                      <Ionicons name="pencil" size={18} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(product.id, product.name)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                      <Ionicons name="trash" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingProduct ? 'Modifier Produit' : 'Ajouter Produit'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalForm}
              contentContainerStyle={{ paddingBottom: 240 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
              <View style={styles.fieldRow}>
                <Text style={styles.label}>Nom du produit *</Text>
                <VoiceInputButton onTranscript={(t) => setFormData({ ...formData, name: t })} />
              </View>
              <TextInput style={styles.input} value={formData.name}
                onChangeText={(t) => setFormData({ ...formData, name: t })} placeholder="Ex: Coca Cola 50cl" />

              <CurrencyAmountInput
                label="Prix d'achat / unité *"
                value={formData.purchasePrice}
                currency={formCurrency}
                onChangeAmount={(t) => setFormData({ ...formData, purchasePrice: t })}
                onChangeCurrency={setFormCurrency}
                voiceButton={<VoiceInputButton onTranscript={(t) => { const n = t.replace(/[^0-9.,]/g, '').replace(',', '.'); setFormData({ ...formData, purchasePrice: n }); }} />}
              />

              <Text style={styles.label}>Quantité *</Text>
              <TextInput style={styles.input} value={formData.stock}
                onChangeText={(t) => setFormData({ ...formData, stock: t })}
                keyboardType="number-pad" placeholder="0" />

              {/* Unit picker (predefined + 'autre' free text) */}
              <Text style={styles.label}>Unité de vente</Text>
              <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => { Keyboard.dismiss(); setUnitPickerVisible(true); }}
              >
                <Text style={{ color: formData.unit ? '#0f172a' : '#94a3b8', fontSize: 16 }}>
                  {formData.unit
                    ? (formData.unit === 'autre'
                        ? (formData.customUnit ? `autre: ${formData.customUnit}` : 'autre (à préciser)')
                        : formData.unit)
                    : '— Choisir une unité —'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#64748b" />
              </TouchableOpacity>
              {formData.unit === 'autre' && (
                <TextInput
                  style={styles.input}
                  value={formData.customUnit}
                  onChangeText={(t) => setFormData({ ...formData, customUnit: t })}
                  placeholder="Unité personnalisée (ex: tasse, bidon...)"
                />
              )}

              {/* Per-product low-stock threshold */}
              <Text style={styles.label}>Seuil d'alerte stock faible</Text>
              <TextInput
                style={styles.input}
                value={formData.lowStockThreshold}
                onChangeText={(t) => setFormData({ ...formData, lowStockThreshold: t.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
                placeholder={String(DEFAULT_LOW_STOCK_THRESHOLD)}
              />
              <Text style={styles.helpText}>
                Une alerte s'affiche dès que la quantité tombe à ce seuil ou en dessous.
              </Text>

              {totalCostPreview > 0 && (
                <View style={styles.totalPreview}>
                  <Text style={styles.totalPreviewLabel}>Montant total (achat)</Text>
                  <Text style={styles.totalPreviewValue}>{formatCurrency(totalCostPreview, currency)}</Text>
                </View>
              )}

              <CurrencyAmountInput
                label="Prix de vente *"
                value={formData.salePrice}
                currency={formCurrency}
                onChangeAmount={(t) => setFormData({ ...formData, salePrice: t })}
                onChangeCurrency={setFormCurrency}
              />

              <View style={styles.promoRow}>
                <Text style={styles.label}>Promotion ?</Text>
                <Switch value={hasPromo} onValueChange={setHasPromo} trackColor={{ true: '#2563eb' }} />
              </View>
              {hasPromo && (
                <CurrencyAmountInput
                  label="Prix promo"
                  value={formData.promotionPrice}
                  currency={formCurrency}
                  onChangeAmount={(t) => setFormData({ ...formData, promotionPrice: t })}
                  onChangeCurrency={setFormCurrency}
                />
              )}

              <Text style={styles.label}>Categorie</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity key={cat}
                    style={[styles.categoryButton, formData.category === cat && styles.categoryButtonSelected]}
                    onPress={() => setFormData({ ...formData, category: cat })}>
                    <Text style={[styles.categoryText, formData.category === cat && styles.categoryTextSelected]}>
                      {i18n.t(cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>{i18n.t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>{i18n.t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Unit picker modal: predefined list + 'autre' shows the customUnit input */}
      <Modal visible={unitPickerVisible} transparent animationType="fade" onRequestClose={() => setUnitPickerVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setUnitPickerVisible(false)}>
          <View style={styles.pickerBackdrop} />
        </TouchableWithoutFeedback>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Choisir une unité</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {UNIT_OPTIONS.map((opt) => {
              const selected = formData.unit === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                  onPress={() => {
                    setFormData({ ...formData, unit: opt, customUnit: opt === 'autre' ? formData.customUnit : '' });
                    setUnitPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, selected && styles.pickerItemTextSelected]}>{opt}</Text>
                  {selected && <Ionicons name="checkmark" size={20} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Restock confirmation modal — shown when backend detects a duplicate
          and user agreed to augment the existing product's stock. */}
      <Modal visible={!!restockModal} transparent animationType="slide" onRequestClose={() => setRestockModal(null)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Augmenter le stock</Text>
                  <TouchableOpacity onPress={() => setRestockModal(null)}>
                    <Ionicons name="close" size={28} color="#64748b" />
                  </TouchableOpacity>
                </View>
                {restockModal && (
                  <ScrollView style={styles.modalForm} keyboardShouldPersistTaps="handled">
                    <Text style={styles.restockInfo}>
                      {restockModal.product.name} ({restockModal.product.sku || 'sans SKU'})
                      {restockModal.product.unit ? `  ·  ${restockModal.product.unit}` : ''}
                    </Text>
                    <Text style={styles.restockInfoSub}>
                      Stock actuel : <Text style={{ fontWeight: '700' }}>{restockModal.product.stock}</Text>
                      {'   '}·   Prix d'achat actuel : {formatCurrency(restockModal.product.purchasePrice || 0, currency)}
                    </Text>

                    <Text style={styles.label}>Quantité à ajouter *</Text>
                    <TextInput
                      style={styles.input}
                      value={restockModal.suggestedQty}
                      onChangeText={(t) => setRestockModal({ ...restockModal, suggestedQty: t.replace(/[^0-9]/g, '') })}
                      keyboardType="number-pad"
                      placeholder="1"
                    />

                    <Text style={styles.label}>
                      Nouveau prix d'achat {restockModal.samePrice ? '(facultatif)' : ' '}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={restockModal.suggestedPrice}
                      onChangeText={(t) => setRestockModal({ ...restockModal, suggestedPrice: t.replace(/[^0-9.,]/g, '').replace(',', '.') })}
                      keyboardType="decimal-pad"
                      placeholder={String(restockModal.product.purchasePrice || 0)}
                    />
                    {!restockModal.samePrice && (
                      <Text style={styles.helpText}>
                        💡 Le prix d'achat précédent ({formatCurrency(restockModal.product.purchasePrice || 0, currency)})
                        sera conservé dans l'historique. Le nouveau prix s'appliquera aux futures ventes.
                      </Text>
                    )}
                  </ScrollView>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setRestockModal(null)}>
                    <Text style={styles.cancelButtonText}>{i18n.t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={confirmRestock}>
                    <Text style={styles.saveButtonText}>Augmenter le stock</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: '#f0d9c0' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  totalText: { fontSize: 13, color: '#2563eb', fontWeight: '600', marginTop: 2 },
  addButton: { backgroundColor: '#2563eb', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  columnHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f5e6d3', borderBottomWidth: 1, borderBottomColor: '#edd5be' },
  colText: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  content: { flex: 1, padding: 12 },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 20, fontWeight: '600', color: '#94a3b8', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#cbd5e1', marginTop: 8 },
  productCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ede0d4', ...cardShadow },
  tableRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  productName: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  productCategory: { fontSize: 11, color: '#94a3b8' },
  cellText: { fontSize: 13, color: '#475569' },
  cellTextBold: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  priceTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  salePriceText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  promoBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  promoText: { fontSize: 11, color: '#92400e', fontWeight: '600' },
  marginBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  marginText: { fontSize: 11, color: '#065f46', fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 12 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  modalForm: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 10 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 16 },
  totalPreview: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 12, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe' },
  totalPreviewLabel: { fontSize: 12, color: '#2563eb' },
  totalPreviewValue: { fontSize: 22, fontWeight: 'bold', color: '#2563eb', marginTop: 4 },
  promoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  categoryButtonSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  categoryText: { fontSize: 14, color: '#64748b' },
  categoryTextSelected: { color: '#fff', fontWeight: '600' },
  modalActions: { flexDirection: 'row', padding: 20, paddingBottom: 36, gap: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  cancelButton: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  saveButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  // Stock/SKU badges & helpers (new)
  unitInline: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  skuBadge: { backgroundColor: '#e2e8f0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  skuBadgeText: { fontSize: 10, color: '#475569', fontWeight: '700', letterSpacing: 0.3 },
  stockBadgeEmpty: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stockBadgeEmptyText: { fontSize: 11, color: '#991b1b', fontWeight: '700' },
  stockBadgeLow: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  stockBadgeLowText: { fontSize: 11, color: '#92400e', fontWeight: '700' },
  helpText: { fontSize: 12, color: '#64748b', marginTop: 4, fontStyle: 'italic' },
  // Unit picker bottom sheet
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  pickerHandle: { width: 36, height: 4, backgroundColor: '#cbd5e1', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8, textAlign: 'center' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10 },
  pickerItemSelected: { backgroundColor: '#eff6ff' },
  pickerItemText: { fontSize: 16, color: '#0f172a' },
  pickerItemTextSelected: { color: '#2563eb', fontWeight: '700' },
  // Restock modal extras
  restockInfo: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  restockInfoSub: { fontSize: 13, color: '#475569', marginBottom: 12 },
});
