import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Animated, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BG = '#fef3e7';
const PIN_LENGTH = 4;

interface PinScreenProps {
  userId: string;
  onSuccess: () => void;
  onLogout: () => void;
}

export default function PinScreen({ userId, onSuccess, onLogout }: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [isSetup, setIsSetup] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'check' | 'setup' | 'confirm'>('check');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    checkPinExists();
  }, []);

  const checkPinExists = async () => {
    const savedPin = await AsyncStorage.getItem(`@tekateka:${userId}:pin`);
    if (savedPin) {
      setStep('check');
      setIsSetup(true);
    } else {
      setStep('setup');
      setIsSetup(false);
    }
  };

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handlePinChange = async (value: string) => {
    if (value.length > PIN_LENGTH) return;
    setPin(value);
    setError('');

    if (value.length === PIN_LENGTH) {
      if (step === 'setup') {
        setConfirmPin(value);
        setPin('');
        setStep('confirm');
        return;
      }

      if (step === 'confirm') {
        if (value === confirmPin) {
          await AsyncStorage.setItem(`@tekateka:${userId}:pin`, value);
          Alert.alert('Code PIN créé', 'Votre code PIN a été configuré avec succès !');
          onSuccess();
        } else {
          shake();
          setError('Les codes ne correspondent pas');
          setPin('');
          setStep('setup');
          setConfirmPin('');
        }
        return;
      }

      if (step === 'check') {
        const savedPin = await AsyncStorage.getItem(`@tekateka:${userId}:pin`);
        if (value === savedPin) {
          onSuccess();
        } else {
          shake();
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          setPin('');
          if (newAttempts >= 5) {
            setError('Trop de tentatives. Veuillez vous reconnecter.');
          } else {
            setError(`Code incorrect (${newAttempts}/5)`);
          }
        }
      }
    }
  };

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
  ));

  return (
    <View style={styles.container}>
      <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logo} />
      <Text style={styles.title}>TekaTeka</Text>

      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed" size={40} color="#2563eb" />
      </View>

      <Text style={styles.subtitle}>
        {step === 'setup' ? 'Créez votre code PIN' :
         step === 'confirm' ? 'Confirmez votre code PIN' :
         'Entrez votre code PIN'}
      </Text>

      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {dots}
      </Animated.View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={pin}
        onChangeText={handlePinChange}
        keyboardType="number-pad"
        maxLength={PIN_LENGTH}
        autoFocus
        secureTextEntry
      />

      <TouchableOpacity style={styles.inputArea} onPress={() => inputRef.current?.focus()}>
        <Text style={styles.tapText}>Tapez ici pour saisir</Text>
      </TouchableOpacity>

      {attempts >= 5 ? (
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color="#64748b" />
          <Text style={[styles.logoutText, { color: '#64748b' }]}>Changer de compte</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  logo: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 24,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
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
    marginBottom: 8,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  inputArea: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    marginBottom: 24,
  },
  tapText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
});
