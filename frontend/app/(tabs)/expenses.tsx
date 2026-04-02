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
import { formatCurrency } from '../../utils/currencies';
import { ExpenseCategoryType } from '../../types';
import { format } from 'date-fns';

const EXPENSE_CATEGORIES: ExpenseCategoryType[] = [
  'inventory',
  'transport',
  'rent',
  'electricity',
  'water',
  'internet',
  'salaries',
  'mobileMoneyFees',
  'taxes',
  'maintenance',
  'supplies',
  'miscellaneous',
];

export default function ExpensesScreen() {
  const { expenses, addExpense } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [formData, setFormData] = useState({
    category: 'inventory' as ExpenseCategoryType,
    customCategory: '',
    amount: '',
    notes: '',
  });

  const handleSave = async () => {
    if (!formData.amount) {
      Alert.alert(i18n.t('error'), 'Please enter amount');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(i18n.t('error'), 'Invalid amount');
      return;
    }

    if (formData.category === 'custom' && !formData.customCategory) {
      Alert.alert(i18n.t('error'), 'Please enter custom category');
      return;
    }

    try {
      await addExpense({
        category: formData.category,
        customCategory: formData.category === 'custom' ? formData.customCategory : undefined,
        amount,
        currency: user?.currency || 'CFA',
        notes: formData.notes,
      });
      setModalVisible(false);
      setFormData({ category: 'inventory', customCategory: '', amount: '', notes: '' });
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Failed to save expense');
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="wallet" size={32} color="#dc2626" />
          <View>
            <Text style={styles.title}>{i18n.t('expenses')}</Text>
            <Text style={styles.totalText}>
              {formatCurrency(totalExpenses, user?.currency || 'CFA')}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {expenses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>{i18n.t('noData')}</Text>
            <Text style={styles.emptySubtext}>Tap + to record your first expense</Text>
          </View>
        ) : (
          expenses
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((expense) => (
              <View key={expense.id} style={styles.expenseCard}>
                <View style={styles.expenseHeader}>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.expenseName}>
                      {expense.category === 'custom'
                        ? expense.customCategory
                        : i18n.t(expense.category)}
                    </Text>
                    <Text style={styles.expenseDate}>
                      {format(new Date(expense.createdAt), 'dd MMM yyyy, HH:mm')}
                    </Text>
                  </View>
                  <Text style={styles.expenseAmount}>
                    {formatCurrency(expense.amount, expense.currency)}
                  </Text>
                </View>
                {expense.notes && (
                  <Text style={styles.expenseNotes}>{expense.notes}</Text>
                )}
              </View>
            ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{i18n.t('addExpense')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.label}>{i18n.t('expenseCategory')}</Text>
              <View style={styles.categoryGrid}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      formData.category === cat && styles.categoryButtonSelected,
                    ]}
                    onPress={() => setFormData({ ...formData, category: cat })}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        formData.category === cat && styles.categoryTextSelected,
                      ]}
                    >
                      {i18n.t(cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.categoryButton,
                    formData.category === 'custom' && styles.categoryButtonSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, category: 'custom' })}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      formData.category === 'custom' && styles.categoryTextSelected,
                    ]}
                  >
                    {i18n.t('customExpense')}
                  </Text>
                </TouchableOpacity>
              </View>

              {formData.category === 'custom' && (
                <>
                  <Text style={styles.label}>Custom Category Name</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.customCategory}
                    onChangeText={(text) => setFormData({ ...formData, customCategory: text })}
                    placeholder="e.g., Marketing"
                  />
                </>
              )}

              <Text style={styles.label}>{i18n.t('expenseAmount')}</Text>
              <TextInput
                style={styles.input}
                value={formData.amount}
                onChangeText={(text) => setFormData({ ...formData, amount: text })}
                keyboardType="decimal-pad"
                placeholder="0"
              />

              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Add notes..."
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
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
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
    color: '#dc2626',
    fontWeight: '600',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#dc2626',
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
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  expenseDate: {
    fontSize: 12,
    color: '#64748b',
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  expenseNotes: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    fontStyle: 'italic',
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  categoryButtonSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  categoryText: {
    fontSize: 13,
    color: '#64748b',
  },
  categoryTextSelected: {
    color: '#fff',
    fontWeight: '600',
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
    backgroundColor: '#dc2626',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
