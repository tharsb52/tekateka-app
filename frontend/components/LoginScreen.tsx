import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import i18n from '../utils/i18n';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { login } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mockOtp, setMockOtp] = useState('');

  const handleSendOTP = () => {
    if (phoneNumber.length < 8) {
      Alert.alert(i18n.t('error'), 'Please enter a valid phone number');
      return;
    }

    // Generate mock OTP
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setMockOtp(generatedOtp);
    console.log('\n======================');
    console.log('MOCK OTP CODE:', generatedOtp);
    console.log('Phone:', phoneNumber);
    console.log('======================\n');
    
    setOtpSent(true);
    Alert.alert(
      i18n.t('success'),
      `Mock OTP sent! Check console.\nCode: ${generatedOtp}`,
      [{ text: 'OK' }]
    );
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 4) {
      Alert.alert(i18n.t('error'), 'Please enter 4-digit code');
      return;
    }

    setLoading(true);
    try {
      await login(phoneNumber, otp);
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="storefront" size={80} color="#2563eb" />
          <Text style={styles.title}>TekaTeka</Text>
          <Text style={styles.subtitle}>{i18n.t('welcome')}</Text>
        </View>

        <View style={styles.form}>
          {!otpSent ? (
            <>
              <Text style={styles.label}>{i18n.t('phoneNumber')}</Text>
              <TextInput
                style={styles.input}
                placeholder={i18n.t('enterPhone')}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                maxLength={15}
                autoFocus
              />
              <TouchableOpacity
                style={styles.button}
                onPress={handleSendOTP}
              >
                <Text style={styles.buttonText}>{i18n.t('sendOTP')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>{i18n.t('enterOTP')}</Text>
              <Text style={styles.phoneDisplay}>+{phoneNumber}</Text>
              
              <TextInput
                style={styles.input}
                placeholder="0000"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
              />
              
              {mockOtp && (
                <View style={styles.mockOtpBox}>
                  <Text style={styles.mockOtpLabel}>Mock OTP (for testing):</Text>
                  <Text style={styles.mockOtpText}>{mockOtp}</Text>
                </View>
              )}
              
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyOTP}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{i18n.t('verifyOTP')}</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setOtpSent(false)}
              >
                <Text style={styles.backButtonText}>Change number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fef3e7',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 18,
    color: '#64748b',
    marginTop: 8,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#1e293b',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  phoneDisplay: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
    marginBottom: 8,
  },
  mockOtpBox: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
    alignItems: 'center',
  },
  mockOtpLabel: {
    fontSize: 12,
    color: '#92400e',
    marginBottom: 4,
  },
  mockOtpText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#92400e',
    letterSpacing: 4,
  },
  backButton: {
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 16,
  },
});
