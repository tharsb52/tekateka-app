import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/currencies';
import { ExpenseCategoryType } from '../../types';
import { format } from 'date-fns';
import { formatLocal } from '../../utils/dateUtils';
import { cardShadow } from '../../utils/shadows';
import { VoiceInputButton } from '../../components/VoiceInputButton';
import AppHeader from '../../components/AppHeader';
import CurrencyAmountInput from '../../components/CurrencyAmountInput';

const BG = '#fef3e7';
const EXPENSE_CATEGORIES: ExpenseCategoryType[] = [
  'transport', 'rent', 'electricity', 'water', 'internet',
  'salaries', 'mobileMoneyFees', 'taxes', 'maintenance', 'supplies', 'miscellaneous',
];

export default function ExpensesScreen() {
  const { expenses, products, addExpense, updateExpense, deleteExpense } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [formData, setFormData] = useState({
    category: 'transport' as ExpenseCategoryType,
    customCategory: '', amount: '', notes: '', productId: '',
  });
  const [formCurrency, setFormCurrency] = useState(user?.currency || 'USD');

  const currency = user?.currency || 'USD';
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const openAddModal = () => {
    setEditingExpense(null);
    setFormData({ category: 'inventory', customCategory: '', amount: '', notes: '', productId: '' });
    setFormCurrency(currency);
    setModalVisible(true);
  };

  const openEditModal = (exp: any) => {
    setEditingExpense(exp);
    setFormData({
      category: exp.category || 'inventory',
      customCategory: exp.customCategory || '',
      amount: exp.amount.toString(),
      notes: exp.notes || '',
      productId: exp.productId || '',
    });
    setFormCurrency(exp.currency || currency);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.amount) { Alert.alert(i18n.t('error'), 'Montant requis'); return; }
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) { Alert.alert(i18n.t('error'), 'Montant invalide'); return; }
    if (formData.category === 'custom' && !formData.customCategory) { Alert.alert(i18n.t('error'), 'Nom de categorie requis'); return; }

    const linkedProduct = products.find(p => p.id === formData.productId);
    try {
      const data = {
        category: formData.category,
        customCategory: formData.category === 'custom' ? formData.customCategory : undefined,
        amount, currency: formCurrency,
        notes: formData.notes,
        productId: formData.productId || undefined,
        productName: linkedProduct?.name || undefined,
      };
      if (editingExpense) {
        await updateExpense(editingExpense.id, data);
      } else {
        await addExpense(data);
      }
      setModalVisible(false);
    } catch (err) { Alert.alert(i18n.t('error'), 'Echec'); }
  };

  const handleDelete = (id: string) => {
    deleteExpense(id);
    Alert.alert(i18n.t('success'), 'Charge supprimée');
  };

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{i18n.t('expenses')}</Text>
          <Text style={styles.totalText}>{formatCurrency(totalExpenses, currency)}</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {expenses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>{i18n.t('noData')}</Text>
            <Text style={styles.emptySubtext}>Appuyez + pour enregistrer une charge</Text>
          </View>
        ) : (
          expenses
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((expense) => (
              <View key={expense.id} style={styles.expenseCard}>
                <View style={styles.expenseHeader}>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseName}>
                      {expense.category === 'custom' ? expense.customCategory : i18n.t(expense.category)}
                    </Text>
                    {expense.productName ? (
                      <Text style={styles.linkedProduct}>
                        <Ionicons name="link" size={11} color="#7c3aed" /> {expense.productName}
                      </Text>
                    ) : null}
                    <Text style={styles.expenseDate}>
                      {formatLocal(expense.createdAt, 'dd/MM/yyyy HH:mm')}
                    </Text>
                  </View>
                  <View style={styles.expenseRight}>
                    <Text style={styles.expenseAmount}>{formatCurrency(expense.amount, expense.currency)}</Text>
                    <View style={styles.expenseActions}>
                      <TouchableOpacity onPress={() => openEditModal(expense)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                        <Ionicons name="pencil" size={16} color="#2563eb" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(expense.id)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                        <Ionicons name="trash" size={16} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                {expense.notes ? <Text style={styles.expenseNotes}>{expense.notes}</Text> : null}
              </View>
            ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingExpense ? 'Modifier Charge' : i18n.t('addExpense')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Categorie</Text>
              <View style={styles.categoryGrid}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity key={cat}
                    style={[styles.categoryButton, formData.category === cat && styles.categoryButtonSelected]}
                    onPress={() => setFormData({ ...formData, category: cat })}>
                    <Text style={[styles.categoryText, formData.category === cat && styles.categoryTextSelected]}>
                      {i18n.t(cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.categoryButton, formData.category === 'custom' && styles.categoryButtonSelected]}
                  onPress={() => setFormData({ ...formData, category: 'custom' })}>
                  <Text style={[styles.categoryText, formData.category === 'custom' && styles.categoryTextSelected]}>
                    {i18n.t('customExpense')}
                  </Text>
                </TouchableOpacity>
              </View>

              {formData.category === 'custom' && (
                <><Text style={styles.label}>Nom de la categorie</Text>
                <TextInput style={styles.input} value={formData.customCategory}
                  onChangeText={(t) => setFormData({ ...formData, customCategory: t })} placeholder="Ex: Marketing" /></>
              )}

              <CurrencyAmountInput
                label="Montant *"
                value={formData.amount}
                currency={formCurrency}
                onChangeAmount={(t) => setFormData({ ...formData, amount: t })}
                onChangeCurrency={setFormCurrency}
                voiceButton={<VoiceInputButton onTranscript={(t) => { const n = t.replace(/[^0-9.,]/g, '').replace(',', '.'); setFormData({ ...formData, amount: n }); }} />}
              />

              <Text style={styles.label}>Produit lie (optionnel)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.productChip, !formData.productId && styles.productChipSelected]}
                  onPress={() => setFormData({ ...formData, productId: '' })}>
                  <Text style={[styles.productChipText, !formData.productId && styles.productChipTextSelected]}>Aucun</Text>
                </TouchableOpacity>
                {products.map((p) => (
                  <TouchableOpacity key={p.id}
                    style={[styles.productChip, formData.productId === p.id && styles.productChipSelected]}
                    onPress={() => setFormData({ ...formData, productId: p.id })}>
                    <Text style={[styles.productChipText, formData.productId === p.id && styles.productChipTextSelected]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Notes (optionnel)</Text>
              <TextInput style={[styles.input, styles.textArea]} value={formData.notes}
                onChangeText={(t) => setFormData({ ...formData, notes: t })}
                placeholder="Notes..." multiline numberOfLines={3} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: '#f0d9c0' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  totalText: { fontSize: 14, color: '#dc2626', fontWeight: '600', marginTop: 2 },
  addButton: { backgroundColor: '#dc2626', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: 12 },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 20, fontWeight: '600', color: '#94a3b8', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#cbd5e1', marginTop: 8 },
  expenseCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#ede0d4', ...cardShadow },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  expenseInfo: { flex: 1 },
  expenseName: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  linkedProduct: { fontSize: 12, color: '#7c3aed', marginBottom: 2 },
  expenseDate: { fontSize: 12, color: '#64748b' },
  expenseRight: { alignItems: 'flex-end' },
  expenseAmount: { fontSize: 17, fontWeight: 'bold', color: '#dc2626' },
  expenseActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  expenseNotes: { fontSize: 13, color: '#64748b', marginTop: 6, fontStyle: 'italic' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  modalForm: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  categoryButtonSelected: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  categoryText: { fontSize: 13, color: '#64748b' },
  categoryTextSelected: { color: '#fff', fontWeight: '600' },
  productChip: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  productChipSelected: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  productChipText: { fontSize: 13, color: '#64748b' },
  productChipTextSelected: { color: '#fff', fontWeight: '600' },
  modalActions: { flexDirection: 'row', padding: 20, gap: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  cancelButton: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#64748b' },
  saveButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
