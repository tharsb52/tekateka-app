/**
 * OTP Service - Firebase Phone Auth
 * 
 * Android/iOS APK: @react-native-firebase/auth → vrais SMS Firebase
 * Web preview: Mock OTP (développement uniquement)
 */
import { Platform } from 'react-native';
import { API_BASE_URL } from './constants';

interface OTPResult {
  success: boolean;
  message: string;
  otp?: string;
}

interface VerifyResult {
  success: boolean;
  message: string;
}

let firebaseAuth: any = null;
let confirmationResult: any = null;
let firebaseAvailable = false;

// Initialize Firebase Auth on native
if (Platform.OS !== 'web') {
  try {
    firebaseAuth = require('@react-native-firebase/auth').default;
    firebaseAvailable = true;
    console.log('[OTP] Firebase Phone Auth ready');
  } catch (e) {
    console.log('[OTP] Firebase not available (Expo Go?):', e);
    firebaseAvailable = false;
  }
}

// Mock OTP store (fallback for web/dev)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

const sendOTPMock = (phoneNumber: string): OTPResult => {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const key = phoneNumber.replace(/^\++/, '');
  otpStore.set(key, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  console.log(`[MOCK OTP] Code: ${code}`);
  return { success: true, message: 'Code envoyé (mode test)', otp: code };
};

const verifyOTPMock = (phoneNumber: string, code: string): VerifyResult => {
  const key = phoneNumber.replace(/^\++/, '');
  const stored = otpStore.get(key);
  if (!stored) return { success: false, message: 'Aucun code envoyé' };
  if (Date.now() > stored.expiresAt) { otpStore.delete(key); return { success: false, message: 'Code expiré' }; }
  if (stored.code !== code) return { success: false, message: 'Code incorrect' };
  otpStore.delete(key);
  return { success: true, message: 'OK' };
};

// =========================================
// Public API
// =========================================
export const sendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

  // Native: Use Firebase Phone Auth (real SMS)
  if (Platform.OS !== 'web' && firebaseAvailable) {
    try {
      console.log('[OTP] Sending Firebase SMS to:', formatted);
      const confirmation = await firebaseAuth().signInWithPhoneNumber(formatted);
      confirmationResult = confirmation;
      return { success: true, message: `Code envoyé par SMS au ${formatted}` };
    } catch (error: any) {
      console.error('[OTP] Firebase error:', error.code, error.message);
      if (error.code === 'auth/invalid-phone-number') {
        return { success: false, message: 'Numéro de téléphone invalide' };
      }
      if (error.code === 'auth/too-many-requests') {
        return { success: false, message: 'Trop de tentatives. Réessayez dans quelques minutes.' };
      }
      if (error.code === 'auth/network-request-failed') {
        return { success: false, message: 'Erreur réseau. Vérifiez votre connexion.' };
      }
      // Fallback to mock if Firebase fails
      console.warn('[OTP] Firebase failed, using mock');
      return sendOTPMock(phoneNumber);
    }
  }

  // Web: Mock OTP (dev only)
  return sendOTPMock(phoneNumber);
};

export const verifyOTP = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  // Native: Verify with Firebase
  if (Platform.OS !== 'web' && firebaseAvailable && confirmationResult) {
    try {
      await confirmationResult.confirm(code);
      confirmationResult = null;
      return { success: true, message: 'Vérification réussie' };
    } catch (error: any) {
      console.error('[OTP] Firebase verify error:', error.code);
      if (error.code === 'auth/invalid-verification-code') {
        return { success: false, message: 'Code incorrect. Vérifiez et réessayez.' };
      }
      if (error.code === 'auth/session-expired') {
        return { success: false, message: 'Code expiré. Renvoyez un nouveau code.' };
      }
      return { success: false, message: 'Code incorrect' };
    }
  }

  // Mock verification
  const key = phoneNumber.replace(/^\++/, '');
  if (otpStore.has(key)) {
    return verifyOTPMock(phoneNumber, code);
  }

  // Backend fallback
  try {
    const res = await fetch(`${API_BASE_URL}/api/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${key}`, code }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return { success: false, message: 'Serveur inaccessible' }; }
    if (res.ok && data.success) return { success: true, message: 'OK' };
    return { success: false, message: data.message || 'Code incorrect' };
  } catch {
    return { success: false, message: 'Erreur de connexion' };
  }
};
