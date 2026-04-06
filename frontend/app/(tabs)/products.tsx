import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, Modal, Switch, ActivityIndicator,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/currencies';
import { CategoryType } from '../../types';
import { cardShadow } from '../../utils/shadows';
import AppHeader from '../../components/AppHeader';
import { VoiceInputButton } from '../../components/VoiceInputButton';

const BG = '#fef3e7';
const CATEGORIES: CategoryType[] = ['food', 'drinks', 'clothes', 'cosmetics', 'electronics', 'other'];

export default function ProductsScreen() {
  const { products, addProduct, updateProduct, deleteProduct, loading } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [hasPromo, setHasPromo] = useState(false);
  const [formData, setFormData] = useState({
    name: '', purchasePrice: '', salePrice: '', promotionPrice: '', stock: '', category: 'food' as CategoryType,
  });

  const currency = user?.currency || 'USD';
  const totalInventoryValue = products.reduce((s, p) => s + (p.purchasePrice || 0) * p.stock, 0);

  const openAddModal = () => {
    setEditingProduct(null);
    setHasPromo(false);
    setFormData({ name: '', purchasePrice: '', salePrice: '', promotionPrice: '', stock: '', category: 'food' });
    setModalVisible(true);
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setHasPromo(!!product.promotionPrice);
    setFormData({
      name: product.name,
      purchasePrice: (product.purchasePrice || 0).toString(),
      salePrice: (product.salePrice || product.price || 0).toString(),
      promotionPrice: (product.promotionPrice || '').toString(),
      stock: product.stock.toString(),
      category: product.category,
    });
    setModalVisible(true);
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

    if (isNaN(purchasePrice) || isNaN(salePrice) || isNaN(stock) || purchasePrice < 0 || salePrice <= 0 || stock < 0) {
      Alert.alert(i18n.t('error'), 'Valeurs invalides');
      return;
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          name: formData.name, purchasePrice, salePrice, promotionPrice, stock, category: formData.category,
        });
      } else {
        await addProduct({
          name: formData.name, purchasePrice, salePrice, promotionPrice, stock, category: formData.category,
        });
      }
      setModalVisible(false);
    } catch (err) {
      Alert.alert(i18n.t('error'), 'Echec de sauvegarde');
    }
  };

  const handleDelete = (id: string, name: string) => {
    deleteProduct(id);
    Alert.alert(i18n.t('success'), `"${name}" supprimé`);
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
      <AppHeader title="Produits" />
      <View style={styles.header}>
          <View>
            <Text style={styles.title}>{i18n.t('products')}</Text>
            <Text style={styles.totalText}>Inventaire: {formatCurrency(totalInventoryValue, currency)}</Text>
          </View>
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
                    <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
                    <Text style={styles.productCategory}>{i18n.t(product.category)}</Text>
                  </View>
                  <Text style={[styles.cellText, { flex: 1.5 }]}>{formatCurrency(product.purchasePrice || 0, currency)}</Text>
                  <Text style={[styles.cellText, { flex: 1, textAlign: 'center' }]}>{product.stock}</Text>
                  <Text style={[styles.cellTextBold, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(totalCost, currency)}</Text>
                </View>
                {/* Row 2: Prix vente + marge */}
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
      <Modal visible={modalVisible} animationType="slide" transparent>
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

            <ScrollView style={styles.modalForm}>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>Nom du produit *</Text>
                <VoiceInputButton onTranscript={(t) => setFormData({ ...formData, name: t })} />
              </View>
              <TextInput style={styles.input} value={formData.name}
                onChangeText={(t) => setFormData({ ...formData, name: t })} placeholder="Ex: Coca Cola 50cl" />

              <View style={styles.fieldRow}>
                <Text style={styles.label}>Prix d'achat / unite *</Text>
                <VoiceInputButton onTranscript={(t) => { const n = t.replace(/[^0-9.,]/g, '').replace(',', '.'); setFormData({ ...formData, purchasePrice: n }); }} />
              </View>
              <TextInput style={styles.input} value={formData.purchasePrice}
                onChangeText={(t) => setFormData({ ...formData, purchasePrice: t })}
                keyboardType="decimal-pad" placeholder="0" />

              <Text style={styles.label}>Quantite *</Text>
              <TextInput style={styles.input} value={formData.stock}
                onChangeText={(t) => setFormData({ ...formData, stock: t })}
                keyboardType="number-pad" placeholder="0" />

              {totalCostPreview > 0 && (
                <View style={styles.totalPreview}>
                  <Text style={styles.totalPreviewLabel}>Montant total (achat)</Text>
                  <Text style={styles.totalPreviewValue}>{formatCurrency(totalCostPreview, currency)}</Text>
                </View>
              )}

              <Text style={styles.label}>Prix de vente *</Text>
              <TextInput style={styles.input} value={formData.salePrice}
                onChangeText={(t) => setFormData({ ...formData, salePrice: t })}
                keyboardType="decimal-pad" placeholder="0" />

              <View style={styles.promoRow}>
                <Text style={styles.label}>Promotion ?</Text>
                <Switch value={hasPromo} onValueChange={setHasPromo} trackColor={{ true: '#2563eb' }} />
              </View>
              {hasPromo && (
                <>
                  <Text style={styles.label}>Prix promo</Text>
                  <TextInput style={styles.input} value={formData.promotionPrice}
                    onChangeText={(t) => setFormData({ ...formData, promotionPrice: t })}
                    keyboardType="decimal-pad" placeholder="0" />
                </>
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
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  cancelButton: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  saveButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
