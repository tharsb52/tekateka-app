import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import i18n from '../../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, CURRENCIES } from '../../utils/currencies';

export default function SellScreen() {
  const { products, addSale } = useData();
  const { user } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [quantity, setQuantity] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mobileMoney'>('cash');
  const [currency, setCurrency] = useState(user?.currency || 'CDF');

  const availableProducts = products.filter(p => p.stock > 0);

  const handleRecordSale = async () => {
    if (!selectedProduct) {
      Alert.alert(i18n.t('error'), i18n.t('selectProduct'));
      return;
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert(i18n.t('error'), 'Invalid quantity');
      return;
    }

    if (qty > selectedProduct.stock) {
      Alert.alert(i18n.t('error'), `Only ${selectedProduct.stock} in stock`);
      return;
    }

    try {
      await addSale({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: qty,
        price: selectedProduct.price,
        totalAmount: selectedProduct.price * qty,
        paymentMethod,
        currency,
      });

      Alert.alert(i18n.t('success'), 'Sale recorded!');
      setSelectedProduct(null);
      setQuantity('1');
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Failed to record sale');
    }
  };

  const totalAmount = selectedProduct ? selectedProduct.price * parseInt(quantity || '0') : 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="cart" size={32} color="#2563eb" />
        <Text style={styles.title}>{i18n.t('sell')}</Text>
      </View>

      {/* Product Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{i18n.t('selectProduct')}</Text>
        {availableProducts.length === 0 ? (
          <Text style={styles.noData}>{i18n.t('noData')}</Text>
        ) : (
          <View style={styles.productGrid}>
            {availableProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={[
                  styles.productCard,
                  selectedProduct?.id === product.id && styles.productCardSelected,
                ]}
                onPress={() => setSelectedProduct(product)}
              >
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productPrice}>
                  {formatCurrency(product.price, currency)}
                </Text>
                <Text style={styles.productStock}>Stock: {product.stock}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {selectedProduct && (
        <>
          {/* Quantity */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('quantity')}</Text>
            <View style={styles.quantityContainer}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}
              >
                <Ionicons name="remove" size={24} color="#fff" />
              </TouchableOpacity>
              <TextInput
                style={styles.quantityInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => setQuantity((parseInt(quantity) + 1).toString())}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Currency Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('currency')}</Text>
            <View style={styles.currencyRow}>
              {CURRENCIES.map((curr) => (
                <TouchableOpacity
                  key={curr.code}
                  style={[
                    styles.currencyButton,
                    currency === curr.code && styles.currencyButtonSelected,
                  ]}
                  onPress={() => setCurrency(curr.code)}
                >
                  <Text
                    style={[
                      styles.currencyText,
                      currency === curr.code && styles.currencyTextSelected,
                    ]}
                  >
                    {curr.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('paymentMethod')}</Text>
            <View style={styles.paymentRow}>
              <TouchableOpacity
                style={[
                  styles.paymentButton,
                  paymentMethod === 'cash' && styles.paymentButtonSelected,
                ]}
                onPress={() => setPaymentMethod('cash')}
              >
                <Ionicons
                  name="cash"
                  size={24}
                  color={paymentMethod === 'cash' ? '#fff' : '#2563eb'}
                />
                <Text
                  style={[
                    styles.paymentText,
                    paymentMethod === 'cash' && styles.paymentTextSelected,
                  ]}
                >
                  {i18n.t('cash')}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.paymentButton,
                  paymentMethod === 'mobileMoney' && styles.paymentButtonSelected,
                ]}
                onPress={() => setPaymentMethod('mobileMoney')}
              >
                <Ionicons
                  name="phone-portrait"
                  size={24}
                  color={paymentMethod === 'mobileMoney' ? '#fff' : '#2563eb'}
                />
                <Text
                  style={[
                    styles.paymentText,
                    paymentMethod === 'mobileMoney' && styles.paymentTextSelected,
                  ]}
                >
                  {i18n.t('mobileMoney')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Total Amount */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{i18n.t('totalAmount')}</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalAmount, currency)}</Text>
          </View>

          {/* Record Sale Button */}
          <TouchableOpacity style={styles.recordButton} onPress={handleRecordSale}>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.recordButtonText}>{i18n.t('recordSale')}</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
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
    padding: 20,
    backgroundColor: '#fff',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 12,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  productCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    width: '48%',
    minHeight: 100,
  },
  productCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 4,
  },
  productStock: {
    fontSize: 12,
    color: '#64748b',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  quantityButton: {
    backgroundColor: '#2563eb',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    minWidth: 100,
  },
  currencyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  currencyButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  currencyButtonSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  currencyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  currencyTextSelected: {
    color: '#fff',
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  paymentButtonSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  paymentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  paymentTextSelected: {
    color: '#fff',
  },
  totalCard: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  totalLabel: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  recordButton: {
    backgroundColor: '#10b981',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  noData: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 20,
  },
});
