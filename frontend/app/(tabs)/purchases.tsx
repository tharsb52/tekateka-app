import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, convertCurrency } from '../../utils/currencies';
import { format } from 'date-fns';
import { formatLocal } from '../../utils/dateUtils';

import { cardShadow } from '../../utils/shadows';

const BG = '#fef3e7';

export default function PurchasesScreen() {
  const { purchases, addPurchase, updatePurchase, deletePurchase } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [formData, setFormData] = useState({
    productName: '',
    supplier: '',
    quantity: '',
    unitPrice: '',
    notes: '',
  });

  const userCurrency = user?.currency || 'USD';
  // Convert each purchase total to the user's preferred currency so the
  // displayed grand total is correct even when purchases use different
  // currencies (CDF, USD, EUR, etc.).
  const totalPurchases = purchases.reduce(
    (sum, p) => sum + convertCurrency(p.totalCost, p.currency || userCurrency, userCurrency),
    0,
  );

  const openAddModal = () => {
    setEditingPurchase(null);
    setFormData({ productName: '', supplier: '', quantity: '', unitPrice: '', notes: '' });
    setModalVisible(true);
  };

  const openEditModal = (purchase: any) => {
    setEditingPurchase(purchase);
    setFormData({
      productName: purchase.productName,
      supplier: purchase.supplier || '',
      quantity: purchase.quantity.toString(),
      unitPrice: purchase.unitPrice.toString(),
      notes: purchase.notes || '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.productName || !formData.quantity || !formData.unitPrice) {
      Alert.alert(i18n.t('error'), 'Veuillez remplir les champs requis');
      return;
    }

    const quantity = parseInt(formData.quantity);
    const unitPrice = parseFloat(formData.unitPrice);

    if (isNaN(quantity) || quantity <= 0 || isNaN(unitPrice) || unitPrice <= 0) {
      Alert.alert(i18n.t('error'), 'Quantité ou prix invalide');
      return;
    }

    const totalCost = quantity * unitPrice;

    try {
      if (editingPurchase) {
        await updatePurchase(editingPurchase.id, {
          productName: formData.productName,
          supplier: formData.supplier,
          quantity,
          unitPrice,
          totalCost,
          notes: formData.notes,
        });
      } else {
        await addPurchase({
          productName: formData.productName,
          supplier: formData.supplier,
          quantity,
          unitPrice,
          totalCost,
          currency: user?.currency || 'USD',
          notes: formData.notes,
        });
      }
      setModalVisible(false);
      setFormData({ productName: '', supplier: '', quantity: '', unitPrice: '', notes: '' });
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Échec de l\'enregistrement');
    }
  };

  const handleDelete = (purchaseId: string, name: string) => {
    Alert.alert(
      i18n.t('delete'),
      `Supprimer l'achat "${name}" ?`,
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => deletePurchase(purchaseId),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bag-handle" size={32} color="#7c3aed" />
          <View>
            <Text style={styles.title}>{i18n.t('purchases')}</Text>
            <Text style={styles.totalText}>
              {formatCurrency(totalPurchases, user?.currency || 'USD')}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {purchases.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bag-handle-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>{i18n.t('noPurchases')}</Text>
            <Text style={styles.emptySubtext}>Tap + pour ajouter un achat</Text>
          </View>
        ) : (
          purchases
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((purchase) => (
              <View key={purchase.id} style={styles.purchaseCard}>
                <View style={styles.purchaseHeader}>
                  <View style={styles.purchaseInfo}>
                    <Text style={styles.purchaseName}>{purchase.productName}</Text>
                    {purchase.supplier ? (
                      <Text style={styles.purchaseSupplier}>
                        <Ionicons name="person-outline" size={12} color="#64748b" /> {purchase.supplier}
                      </Text>
                    ) : null}
                    <Text style={styles.purchaseDate}>
                      {formatLocal(purchase.createdAt, 'dd/MM/yyyy HH:mm')}
                    </Text>
                  </View>
                  <View style={styles.purchaseRight}>
                    <Text style={styles.purchaseTotal}>
                      {formatCurrency(purchase.totalCost, purchase.currency)}
                    </Text>
                    <Text style={styles.purchaseDetail}>
                      {purchase.quantity} x {formatCurrency(purchase.unitPrice, purchase.currency)}
                    </Text>
                  </View>
                </View>
                {purchase.notes ? (
                  <Text style={styles.purchaseNotes}>{purchase.notes}</Text>
                ) : null}
                <View style={styles.purchaseActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(purchase)}
                  >
                    <Ionicons name="pencil" size={16} color="#7c3aed" />
                    <Text style={styles.editButtonText}>{i18n.t('edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(purchase.id, purchase.productName)}
                  >
                    <Ionicons name="trash" size={16} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPurchase ? i18n.t('editPurchase') : i18n.t('addPurchase')}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.label}>{i18n.t('purchaseProduct')} *</Text>
              <TextInput
                style={styles.input}
                value={formData.productName}
                onChangeText={(text) => setFormData({ ...formData, productName: text })}
                placeholder="Ex: Coca Cola, Savon, Riz..."
              />

              <Text style={styles.label}>{i18n.t('supplier')}</Text>
              <TextInput
                style={styles.input}
                value={formData.supplier}
                onChangeText={(text) => setFormData({ ...formData, supplier: text })}
                placeholder="Nom du fournisseur"
              />

              <Text style={styles.label}>{i18n.t('quantity')} *</Text>
              <TextInput
                style={styles.input}
                value={formData.quantity}
                onChangeText={(text) => setFormData({ ...formData, quantity: text })}
                keyboardType="number-pad"
                placeholder="0"
              />

              <Text style={styles.label}>{i18n.t('unitPrice')} *</Text>
              <TextInput
                style={styles.input}
                value={formData.unitPrice}
                onChangeText={(text) => setFormData({ ...formData, unitPrice: text })}
                keyboardType="decimal-pad"
                placeholder="0"
              />

              {formData.quantity && formData.unitPrice ? (
                <View style={styles.totalPreview}>
                  <Text style={styles.totalPreviewLabel}>{i18n.t('totalCost')}</Text>
                  <Text style={styles.totalPreviewValue}>
                    {formatCurrency(
                      (parseInt(formData.quantity) || 0) * (parseFloat(formData.unitPrice) || 0),
                      user?.currency || 'USD'
                    )}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Notes (optionnel)"
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
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
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: '#f0d9c0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  totalText: {
    fontSize: 16,
    color: '#7c3aed',
    fontWeight: '600',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#7c3aed',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#cbd5e1',
    marginTop: 8,
  },
  purchaseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ede0d4',
    ...cardShadow,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  purchaseInfo: {
    flex: 1,
  },
  purchaseName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  purchaseSupplier: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 2,
  },
  purchaseDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  purchaseRight: {
    alignItems: 'flex-end',
  },
  purchaseTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#7c3aed',
    marginBottom: 2,
  },
  purchaseDetail: {
    fontSize: 12,
    color: '#94a3b8',
  },
  purchaseNotes: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 4,
  },
  purchaseActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e8ff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7c3aed',
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalForm: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  totalPreview: {
    backgroundColor: '#f3e8ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  totalPreviewLabel: {
    fontSize: 13,
    color: '#7c3aed',
    fontWeight: '500',
    marginBottom: 4,
  },
  totalPreviewValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#7c3aed',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
