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
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/currencies';
import { format } from 'date-fns';

export default function DebtsScreen() {
  const { debts, addDebt, updateDebt, deleteDebt, addSale } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingDebt, setEditingDebt] = useState<any>(null);
  const [formData, setFormData] = useState({
    debtorName: '',
    amount: '',
    description: '',
    dueDate: new Date(),
  });

  const unpaidDebts = debts.filter(d => !d.isPaid);
  const paidDebts = debts.filter(d => d.isPaid);
  const totalUnpaidAmount = unpaidDebts.reduce((sum, debt) => sum + debt.amount, 0);

  const handleSave = async () => {
    if (!formData.debtorName || !formData.amount) {
      Alert.alert(i18n.t('error'), 'Veuillez remplir les champs requis');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(i18n.t('error'), 'Montant invalide');
      return;
    }

    try {
      await addDebt({
        debtorName: formData.debtorName,
        amount,
        currency: user?.currency || 'USD',
        description: formData.description,
        dueDate: formData.dueDate.toISOString(),
        isPaid: false,
      });
      setModalVisible(false);
      setFormData({ debtorName: '', amount: '', description: '', dueDate: new Date() });
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Échec de l\'enregistrement');
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData({ ...formData, dueDate: selectedDate });
    }
  };

  const handleMarkAsPaid = (debtId: string) => {
    Alert.alert(
      i18n.t('markAsPaid'),
      'Marquer cette dette comme payée?',
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('confirm'),
          onPress: async () => {
            await updateDebt(debtId, { isPaid: true, paidAt: new Date().toISOString() });
          },
        },
      ]
    );
  };

  const handleDelete = (debtId: string, debtorName: string) => {
    Alert.alert(
      i18n.t('delete'),
      `Supprimer la dette de "${debtorName}"?`,
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('delete'),
          style: 'destructive',
          onPress: () => deleteDebt(debtId),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="receipt" size={32} color="#f59e0b" />
          <View>
            <Text style={styles.title}>{i18n.t('debts')}</Text>
            <Text style={styles.totalText}>
              {formatCurrency(totalUnpaidAmount, user?.currency || 'USD')} non payé
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Unpaid Debts */}
        {unpaidDebts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('unpaidDebts')} ({unpaidDebts.length})</Text>
            {unpaidDebts.map((debt) => (
              <View key={debt.id} style={[styles.debtCard, styles.unpaidCard]}>
                <View style={styles.debtHeader}>
                  <View style={styles.debtInfo}>
                    <Text style={styles.debtorName}>{debt.debtorName}</Text>
                    {debt.description && (
                      <Text style={styles.debtDescription}>{debt.description}</Text>
                    )}
                    {debt.dueDate && (
                      <Text style={styles.dueDate}>
                        <Ionicons name="calendar-outline" size={12} color="#64748b" /> 
                        {' '}Échéance: {(() => {
                          try {
                            const date = new Date(debt.dueDate);
                            return !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : 'Date invalide';
                          } catch {
                            return 'Date invalide';
                          }
                        })()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.debtAmount}>
                    {formatCurrency(debt.amount, debt.currency)}
                  </Text>
                </View>
                <View style={styles.debtActions}>
                  <TouchableOpacity
                    style={styles.paidButton}
                    onPress={() => handleMarkAsPaid(debt.id)}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                    <Text style={styles.paidButtonText}>{i18n.t('markAsPaid')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(debt.id, debt.debtorName)}
                  >
                    <Ionicons name="trash" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Paid Debts */}
        {paidDebts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('paidDebts')} ({paidDebts.length})</Text>
            {paidDebts.map((debt) => (
              <View key={debt.id} style={[styles.debtCard, styles.paidCard]}>
                <View style={styles.debtHeader}>
                  <View style={styles.debtInfo}>
                    <Text style={[styles.debtorName, styles.paidText]}>{debt.debtorName}</Text>
                    {debt.description && (
                      <Text style={[styles.debtDescription, styles.paidText]}>{debt.description}</Text>
                    )}
                    {debt.paidAt && (
                      <Text style={styles.paidDate}>
                        <Ionicons name="checkmark-done" size={12} color="#10b981" /> 
                        {' '}Payé le {(() => {
                          try {
                            const date = new Date(debt.paidAt);
                            return !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : 'Date invalide';
                          } catch {
                            return 'Date invalide';
                          }
                        })()}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.debtAmount, styles.paidText]}>
                    {formatCurrency(debt.amount, debt.currency)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {debts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>{i18n.t('noData')}</Text>
            <Text style={styles.emptySubtext}>Tap + pour ajouter une dette</Text>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add Debt Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{i18n.t('addDebt')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.label}>{i18n.t('debtorName')} *</Text>
              <TextInput
                style={styles.input}
                value={formData.debtorName}
                onChangeText={(text) => setFormData({ ...formData, debtorName: text })}
                placeholder="Nom du client"
              />

              <Text style={styles.label}>{i18n.t('debtAmount')} *</Text>
              <TextInput
                style={styles.input}
                value={formData.amount}
                onChangeText={(text) => setFormData({ ...formData, amount: text })}
                keyboardType="decimal-pad"
                placeholder="0"
              />

              <Text style={styles.label}>{i18n.t('debtDescription')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Description (optionnel)"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>{i18n.t('dueDate')}</Text>
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#2563eb" />
                <Text style={styles.dateText}>
                  {format(formData.dueDate, 'dd/MM/yyyy')}
                </Text>
              </TouchableOpacity>
              
              {showDatePicker && (
                <DateTimePicker
                  value={formData.dueDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  minimumDate={new Date()}
                />
              )}
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
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '600',
    marginTop: 4,
  },
  addButton: {
    backgroundColor: '#f59e0b',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  debtCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
  },
  unpaidCard: {
    borderColor: '#fbbf24',
  },
  paidCard: {
    borderColor: '#e2e8f0',
    opacity: 0.7,
  },
  debtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  debtInfo: {
    flex: 1,
  },
  debtorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  debtDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  dueDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  paidDate: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 4,
  },
  debtAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f59e0b',
  },
  paidText: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  debtActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-start',
  },
  paidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  paidButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  deleteButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  datePickerButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
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
    backgroundColor: '#f59e0b',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
