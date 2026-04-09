import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Animated, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BG = '#fef3e7';
const PIN_LENGTH = 4;

interface PinScreenProps {
  userId: string;
  mode: 'verify' | 'setup' | 'change';
  onSuccess: () => void;
  onLogout?: () => void;
  onCancel?: () => void;
}

export default function PinScreen({ userId, mode, onSuccess, onLogout, onCancel }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'enter' | 'setup' | 'confirm' | 'old'>('enter');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [attempts, setAttempts] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode === 'setup') {
      setStep('setup');
    } else if (mode === 'change') {
      setStep('old');
    } else {
      setStep('enter');
    }
  }, [mode]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleDigit = async (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      // Process after a small delay for visual feedback
      setTimeout(() => processPin(newPin), 150);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const processPin = async (value: string) => {
    if (step === 'old') {
      // Verify old PIN before allowing change
      const savedPin = await AsyncStorage.getItem(`@tekateka:${userId}:pin`);
      if (value === savedPin) {
        setPin('');
        setStep('setup');
      } else {
        shake();
        setPin('');
        setError('Code actuel incorrect');
      }
      return;
    }

    if (step === 'setup') {
      setConfirmPin(value);
      setPin('');
      setStep('confirm');
      return;
    }

    if (step === 'confirm') {
      if (value === confirmPin) {
        await AsyncStorage.setItem(`@tekateka:${userId}:pin`, value);
        setSuccessMsg('Code PIN configuré !');
        setTimeout(() => onSuccess(), 800);
      } else {
        shake();
        setError('Les codes ne correspondent pas');
        setPin('');
        setStep('setup');
        setConfirmPin('');
      }
      return;
    }

    if (step === 'enter') {
      const savedPin = await AsyncStorage.getItem(`@tekateka:${userId}:pin`);
      if (value === savedPin) {
        onSuccess();
      } else {
        shake();
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        if (newAttempts >= 5) {
          setError('Trop de tentatives');
        } else {
          setError(`Code incorrect (${newAttempts}/5)`);
        }
      }
    }
  };

  const getTitle = () => {
    switch (step) {
      case 'old': return 'Entrez votre code actuel';
      case 'setup': return 'Créez votre code PIN';
      case 'confirm': return 'Confirmez votre code PIN';
      case 'enter': return 'Entrez votre code PIN';
    }
  };

  const getIcon = () => {
    switch (step) {
      case 'setup':
      case 'confirm':
        return 'key';
      default:
        return 'lock-closed';
    }
  };

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
  ));

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  if (successMsg) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={styles.successCircle}>
          <Ionicons name="checkmark-circle" size={64} color="#10b981" />
        </View>
        <Text style={styles.successText}>{successMsg}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      {/* Logo & Title */}
      <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logo} />
      <Text style={styles.appName}>TekaTeka</Text>

      <View style={[styles.lockIcon, step === 'setup' || step === 'confirm' ? styles.lockIconSetup : null]}>
        <Ionicons name={getIcon()} size={32} color={step === 'setup' || step === 'confirm' ? '#f59e0b' : '#2563eb'} />
      </View>

      <Text style={styles.subtitle}>{getTitle()}</Text>

      {/* PIN Dots */}
      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {dots}
      </Animated.View>

      {error ? <Text style={styles.errorText}>{error}</Text> : <View style={{ height: 22 }} />}

      {/* Custom Numpad */}
      <View style={styles.numpad}>
        {numpadKeys.map((row, ri) => (
          <View key={ri} style={styles.numpadRow}>
            {row.map((key, ki) => {
              if (key === '') {
                return <View key={ki} style={styles.numpadKeyEmpty} />;
              }
              if (key === 'del') {
                return (
                  <TouchableOpacity key={ki} style={styles.numpadKey} onPress={handleDelete}>
                    <Ionicons name="backspace-outline" size={26} color="#64748b" />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={ki}
                  style={styles.numpadKey}
                  onPress={() => handleDigit(key)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.numpadKeyText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Bottom actions */}
      <View style={styles.bottomActions}>
        {attempts >= 5 && onLogout ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#dc2626" />
            <Text style={[styles.actionText, { color: '#dc2626' }]}>Déconnexion</Text>
          </TouchableOpacity>
        ) : onLogout && step === 'enter' ? (
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#64748b" />
            <Text style={[styles.actionText, { color: '#64748b' }]}>Changer de compte</Text>
          </TouchableOpacity>
        ) : null}

        {onCancel && (
          <TouchableOpacity style={styles.logoutBtn} onPress={onCancel}>
            <Ionicons name="close-outline" size={20} color="#64748b" />
            <Text style={[styles.actionText, { color: '#64748b' }]}>Annuler</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  logo: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    marginBottom: 4,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 16,
  },
  lockIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  lockIconSetup: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 12,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2563eb',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#2563eb',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
    height: 22,
    textAlign: 'center',
  },
  successCircle: {
    marginBottom: 16,
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10b981',
  },
  // Custom numpad
  numpad: {
    width: '100%',
    maxWidth: 300,
    marginTop: 8,
  },
  numpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
  },
  numpadKey: {
    width: 72,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  numpadKeyEmpty: {
    width: 72,
    height: 56,
    marginHorizontal: 8,
  },
  numpadKeyText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  bottomActions: {
    marginTop: 16,
    alignItems: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
