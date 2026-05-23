import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCIES, getCurrencySymbol } from '../utils/currencies';

interface CurrencyAmountInputProps {
  value: string;
  currency: string;
  onChangeAmount: (amount: string) => void;
  onChangeCurrency: (currency: string) => void;
  placeholder?: string;
  label?: string;
  voiceButton?: React.ReactNode;
}

export default function CurrencyAmountInput({
  value,
  currency,
  onChangeAmount,
  onChangeCurrency,
  placeholder = '0',
  label,
  voiceButton,
}: CurrencyAmountInputProps) {
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const symbol = getCurrencySymbol(currency);

  return (
    <View>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {voiceButton}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.amountInput}
          value={value}
          onChangeText={onChangeAmount}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity
          style={styles.currencyButton}
          onPress={() => setShowCurrencyPicker(true)}
        >
          <Text style={styles.currencySymbol}>{symbol}</Text>
          <Ionicons name="chevron-down" size={14} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {/* Preview formatted amount */}
      {value && parseFloat(value.replace(',', '.')) > 0 && (
        <Text style={styles.previewText}>
          {formatPreview(value, currency)}
        </Text>
      )}

      {/* Currency Picker Modal */}
      <Modal visible={showCurrencyPicker} animationType="slide" transparent onRequestClose={() => setShowCurrencyPicker(false)}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Devise</Text>
              <TouchableOpacity onPress={() => setShowCurrencyPicker(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.pickerList}
              contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
              showsVerticalScrollIndicator={true}
            >
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    styles.pickerItem,
                    currency === c.code && styles.pickerItemSelected,
                  ]}
                  onPress={() => {
                    onChangeCurrency(c.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <View style={styles.pickerRow}>
                    <Text style={[
                      styles.pickerSymbol,
                      currency === c.code && styles.pickerSymbolSelected,
                    ]}>
                      {c.symbol}
                    </Text>
                    <Text style={[
                      styles.pickerCode,
                      currency === c.code && styles.pickerCodeSelected,
                    ]}>
                      {c.code}
                    </Text>
                  </View>
                  <Text style={[
                    styles.pickerName,
                    currency === c.code && styles.pickerNameSelected,
                  ]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {currency === c.code && (
                    <Ionicons name="checkmark-circle" size={22} color="#2563eb" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function formatPreview(value: string, currencyCode: string): string {
  const num = parseFloat(value.replace(',', '.'));
  if (isNaN(num)) return '';
  const symbol = getCurrencySymbol(currencyCode);
  const formatted = num.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currencyCode === 'USD') return `${symbol}${formatted}`;
  return `${formatted}${symbol}`;
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#93c5fd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minWidth: 70,
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2563eb',
  },
  previewText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    minHeight: 320,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  pickerList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickerItemSelected: {
    backgroundColor: '#eff6ff',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  pickerSymbol: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748b',
  },
  pickerSymbolSelected: {
    color: '#2563eb',
  },
  pickerName: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  pickerNameSelected: {
    fontWeight: '700',
    color: '#2563eb',
  },
  pickerCode: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  pickerCodeSelected: {
    color: '#60a5fa',
  },
});
