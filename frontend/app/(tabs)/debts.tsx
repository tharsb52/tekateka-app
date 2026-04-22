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
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/currencies';
import { format } from 'date-fns';
import AppHeader from '../../components/AppHeader';
import CurrencyAmountInput from '../../components/CurrencyAmountInput';

import { cardShadow } from '../../utils/shadows';
import { VoiceInputButton } from '../../components/VoiceInputButton';

const BG = '#fef3e7';

export default function DebtsScreen() {
  const { debts, addDebt, updateDebt, deleteDebt, markDebtAsPaidWithRevenue } = useData();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingDebt, setEditingDebt] = useState<any>(null);
  const [quickDateDebt, setQuickDateDebt] = useState<any>(null);
  const [quickDate, setQuickDate] = useState(new Date());
  const [showQuickDatePicker, setShowQuickDatePicker] = useState(false);
  const [formData, setFormData] = useState({
    debtorName: '',
    amount: '',
    description: '',
    dueDate: new Date(),
  });
  const [formCurrency, setFormCurrency] = useState(user?.currency || 'USD');

  const unpaidDebts = debts.filter(d => !d.isPaid);
  const paidDebts = debts.filter(d => d.isPaid);
  const totalUnpaidAmount = unpaidDebts.reduce((sum, debt) => sum + debt.amount, 0);

  const openAddModal = () => {
    setEditingDebt(null);
    setFormData({ debtorName: '', amount: '', description: '', dueDate: new Date() });
    setFormCurrency(user?.currency || 'USD');
    setModalVisible(true);
  };

  const openEditModal = (debt: any) => {
    setEditingDebt(debt);
    setFormData({
      debtorName: debt.debtorName,
      amount: debt.amount.toString(),
      description: debt.description || '',
      dueDate: debt.dueDate ? new Date(debt.dueDate) : new Date(),
    });
    setFormCurrency(debt.currency || user?.currency || 'USD');
    setModalVisible(true);
  };

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
      if (editingDebt) {
        await updateDebt(editingDebt.id, {
          debtorName: formData.debtorName,
          amount,
          description: formData.description,
          dueDate: formData.dueDate.toISOString(),
        });
      } else {
        await addDebt({
          debtorName: formData.debtorName,
          amount,
          currency: formCurrency,
          description: formData.description,
          dueDate: formData.dueDate.toISOString(),
          isPaid: false,
        });
      }
      setModalVisible(false);
      setEditingDebt(null);
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

  const handleMarkAsPaid = async (debtId: string, debtorName: string, amount: number) => {
    try {
      await markDebtAsPaidWithRevenue(debtId);
      Alert.alert(
        i18n.t('success'),
        `${formatCurrency(amount, user?.currency || 'USD')} de "${debtorName}" ajouté au chiffre d'affaires !`
      );
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Échec de la mise à jour');
    }
  };

  const openQuickDateChange = (debt: any) => {
    setQuickDateDebt(debt);
    setQuickDate(debt.dueDate ? new Date(debt.dueDate) : new Date());
    setShowQuickDatePicker(true);
  };

  const handleQuickDateChange = async (event: any, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') setShowQuickDatePicker(false);
    if (selectedDate && quickDateDebt) {
      setQuickDate(selectedDate);
      await updateDebt(quickDateDebt.id, { dueDate: selectedDate.toISOString() });
      Alert.alert(i18n.t('success'), `Échéance mise à jour au ${format(selectedDate, 'dd/MM/yyyy')}`);
      setQuickDateDebt(null);
    }
  };

  const handleDelete = (debtId: string, debtorName: string) => {
    deleteDebt(debtId);
    Alert.alert(i18n.t('success'), `Dette de "${debtorName}" supprimée`);
  };

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.totalText}>
              {formatCurrency(totalUnpaidAmount, user?.currency || 'USD')} non payé
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
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
                    {debt.description ? (
                      <Text style={styles.debtDescription}>{debt.description}</Text>
                    ) : null}
                    {debt.dueDate ? (
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
                    ) : null}
                  </View>
                  <Text style={styles.debtAmount}>
                    {formatCurrency(debt.amount, debt.currency)}
                  </Text>
                </View>
                <View style={styles.debtActions}>
                  <TouchableOpacity
                    style={styles.editDebtButton}
                    onPress={() => openEditModal(debt)}
                  >
                    <Ionicons name="pencil" size={16} color="#2563eb" />
                    <Text style={styles.editDebtButtonText}>{i18n.t('edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editDebtButton, { borderColor: '#f59e0b' }]}
                    onPress={() => openQuickDateChange(debt)}
                  >
                    <Ionicons name="calendar" size={16} color="#f59e0b" />
                    <Text style={[styles.editDebtButtonText, { color: '#f59e0b' }]}>Date</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.paidButton}
                    onPress={() => handleMarkAsPaid(debt.id, debt.debtorName, debt.amount)}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
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
                    {debt.description ? (
                      <Text style={[styles.debtDescription, styles.paidText]}>{debt.description}</Text>
                    ) : null}
                    {debt.paidAt ? (
                      <View style={styles.paidBadge}>
                        <Ionicons name="checkmark-done" size={14} color="#10b981" /> 
                        <Text style={styles.paidDate}>
                          Payé le {(() => {
                            try {
                              const date = new Date(debt.paidAt);
                              return !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : 'Date invalide';
                            } catch {
                              return 'Date invalide';
                            }
                          })()}
                        </Text>
                        <Text style={styles.addedToRevenue}>+ Chiffre d'affaires</Text>
                      </View>
                    ) : null}
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

      {/* Quick Date Picker */}
      {showQuickDatePicker && (
        <DateTimePicker
          value={quickDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleQuickDateChange}
        />
      )}

      {/* Add/Edit Debt Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDebt ? i18n.t('editDebt') : i18n.t('addDebt')}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setEditingDebt(null); }}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <Text style={styles.label}>{i18n.t('debtorName')} *</Text>
                <VoiceInputButton onTranscript={(t) => setFormData({ ...formData, debtorName: t })} />
              </View>
              <TextInput
                style={styles.input}
                value={formData.debtorName}
                onChangeText={(text) => setFormData({ ...formData, debtorName: text })}
                placeholder="Nom du client"
              />

              <CurrencyAmountInput
                label={`${i18n.t('debtAmount')} *`}
                value={formData.amount}
                currency={formCurrency}
                onChangeAmount={(text) => setFormData({ ...formData, amount: text })}
                onChangeCurrency={setFormCurrency}
                voiceButton={<VoiceInputButton onTranscript={(t) => { const n = t.replace(/[^0-9.,]/g, '').replace(',', '.'); setFormData({ ...formData, amount: n }); }} />}
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
                onPress={() => { setModalVisible(false); setEditingDebt(null); }}
              >
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
    ...cardShadow,
  },
  unpaidCard: {
    borderColor: '#fbbf24',
  },
  paidCard: {
    borderColor: '#d1fae5',
    opacity: 0.8,
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
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  paidDate: {
    fontSize: 12,
    color: '#10b981',
  },
  addedToRevenue: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '700',
    backgroundColor: '#d1fae5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
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
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  editDebtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  editDebtButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  paidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  paidButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
  },
  deleteButton: {
    width: 36,
    height: 36,
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
