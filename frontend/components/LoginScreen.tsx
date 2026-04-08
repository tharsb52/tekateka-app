import React, { useState } from 'react';
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
  Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import i18n from '../utils/i18n';
import { Ionicons } from '@expo/vector-icons';
import { sendOTP, verifyOTP, getOTPProviderInfo } from '../services/otpService';

const BG = '#fef3e7';

export default function LoginScreen() {
  const { login } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mockOtp, setMockOtp] = useState('');

  const otpInfo = getOTPProviderInfo();

  const handleSendOTP = async () => {
    if (phoneNumber.length < 8) {
      Alert.alert(i18n.t('error'), 'Veuillez entrer un numéro valide');
      return;
    }

    setLoading(true);
    try {
      const result = await sendOTP(phoneNumber);

      if (result.success) {
        setOtpSent(true);
        if (result.otp) {
          setMockOtp(result.otp);
        }
        Alert.alert(i18n.t('success'), result.message);
      } else {
        Alert.alert(i18n.t('error'), result.message);
      }
    } catch (error) {
      Alert.alert(i18n.t('error'), "Échec de l'envoi du code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 4) {
      Alert.alert(i18n.t('error'), 'Entrez le code à 4 chiffres');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyOTP(phoneNumber, otp);

      if (result.success) {
        await login(phoneNumber, otp);
      } else {
        Alert.alert(i18n.t('error'), result.message);
      }
    } catch (error) {
      Alert.alert(i18n.t('error'), 'Vérification échouée');
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
          <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
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
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendOTP}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{i18n.t('sendOTP')}</Text>
                )}
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
              
              {mockOtp ? (
                <View style={styles.mockOtpBox}>
                  <Text style={styles.mockOtpLabel}>Code test ({otpInfo.name}) :</Text>
                  <Text style={styles.mockOtpText}>{mockOtp}</Text>
                </View>
              ) : null}
              
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
                onPress={() => { setOtpSent(false); setOtp(''); setMockOtp(''); }}
              >
                <Ionicons name="arrow-back" size={16} color="#64748b" />
                <Text style={styles.backButtonText}>Changer de numéro</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Provider indicator */}
        <View style={styles.providerBadge}>
          <Ionicons name={otpInfo.isMock ? "flask" : "cellular"} size={14} color={otpInfo.isMock ? "#92400e" : "#065f46"} />
          <Text style={[styles.providerText, !otpInfo.isMock && { color: '#065f46' }]}>{otpInfo.name}</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
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
  logoImage: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
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
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  backButtonText: {
    color: '#64748b',
    fontSize: 16,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    alignSelf: 'center',
  },
  providerText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
  },
});
