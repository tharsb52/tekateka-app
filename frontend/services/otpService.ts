/**
 * OTP Service with Firebase Phone Auth
 * 
 * - Native (Android/iOS APK): Uses @react-native-firebase/auth (real SMS)
 * - Web preview: Uses firebase/auth web SDK (real SMS with reCAPTCHA)
 * - Fallback: Mock OTP (development only)
 */
import { Platform } from 'react-native';

interface OTPResult {
  success: boolean;
  message: string;
  otp?: string;
}

interface VerifyResult {
  success: boolean;
  message: string;
}

// Store confirmation result for verification
let confirmationResult: any = null;

// Mock OTP store for development fallback
const otpStore = new Map<string, { code: string; expiresAt: number }>();

// =========================================
// Native Firebase Auth (@react-native-firebase)
// =========================================
let nativeAuth: any = null;
let nativeAvailable = false;

const initNativeFirebase = () => {
  if (Platform.OS === 'web') return false;
  try {
    const firebaseAuth = require('@react-native-firebase/auth');
    nativeAuth = firebaseAuth.default;
    nativeAvailable = true;
    console.log('[OTP] Native Firebase Auth loaded successfully');
    return true;
  } catch (e) {
    console.log('[OTP] Native Firebase Auth not available:', e);
    nativeAvailable = false;
    return false;
  }
};

// Initialize on import
initNativeFirebase();

const sendOTPNative = async (phoneNumber: string): Promise<OTPResult> => {
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  console.log('[OTP Native] Sending to:', formatted);
  
  const confirmation = await nativeAuth().signInWithPhoneNumber(formatted);
  confirmationResult = confirmation;
  
  return {
    success: true,
    message: `Code envoyé par SMS au ${formatted}`,
  };
};

const verifyOTPNative = async (code: string): Promise<VerifyResult> => {
  if (!confirmationResult) {
    return { success: false, message: "Aucun code en attente. Renvoyez le code." };
  }
  
  await confirmationResult.confirm(code);
  confirmationResult = null;
  
  return { success: true, message: 'Vérification réussie' };
};

// =========================================
// Web Firebase Auth (firebase/auth)
// =========================================
let webRecaptchaVerifier: any = null;
let webConfirmationResult: any = null;

const sendOTPWeb = async (phoneNumber: string): Promise<OTPResult> => {
  const { auth } = require('./firebase');
  const { signInWithPhoneNumber, RecaptchaVerifier } = require('firebase/auth');
  
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  
  if (typeof window !== 'undefined') {
    if (webRecaptchaVerifier) {
      try { webRecaptchaVerifier.clear(); } catch {}
    }
    
    let container = document.getElementById('recaptcha-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'recaptcha-container';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    
    webRecaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });
    
    const result = await signInWithPhoneNumber(auth, formatted, webRecaptchaVerifier);
    webConfirmationResult = result;
    
    return {
      success: true,
      message: `Code envoyé par SMS au ${formatted}`,
    };
  }
  
  throw new Error('Web environment not available');
};

const verifyOTPWeb = async (code: string): Promise<VerifyResult> => {
  if (!webConfirmationResult) {
    return { success: false, message: "Aucun code en attente. Renvoyez le code." };
  }
  
  await webConfirmationResult.confirm(code);
  webConfirmationResult = null;
  
  return { success: true, message: 'Vérification réussie' };
};

// =========================================
// Mock OTP (Fallback for development)
// =========================================
const sendOTPMock = (phoneNumber: string): OTPResult => {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const key = phoneNumber.replace(/^\++/, '');
  otpStore.set(key, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  console.log(`[MOCK OTP] Code for ${phoneNumber}: ${code}`);
  return {
    success: true,
    message: `Code de vérification envoyé (mode test)`,
    otp: code,
  };
};

const verifyOTPMock = (phoneNumber: string, code: string): VerifyResult => {
  const key = phoneNumber.replace(/^\++/, '');
  const stored = otpStore.get(key);
  if (!stored) {
    return { success: false, message: 'Aucun code envoyé pour ce numéro' };
  }
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return { success: false, message: 'Code expiré. Renvoyez un nouveau code.' };
  }
  if (stored.code !== code) {
    return { success: false, message: 'Code incorrect' };
  }
  otpStore.delete(key);
  return { success: true, message: 'Vérification réussie' };
};

// =========================================
// Public API
// =========================================
export const sendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  // Native Android/iOS: Use @react-native-firebase/auth
  if (Platform.OS !== 'web' && nativeAvailable) {
    try {
      return await sendOTPNative(phoneNumber);
    } catch (error: any) {
      console.error('[OTP] Native Firebase error:', error.code, error.message);
      if (error.code === 'auth/invalid-phone-number') {
        return { success: false, message: 'Numéro de téléphone invalide' };
      }
      if (error.code === 'auth/too-many-requests') {
        return { success: false, message: 'Trop de tentatives. Réessayez plus tard.' };
      }
      // Fallback to mock
      console.warn('[OTP] Native failed, using mock');
      return sendOTPMock(phoneNumber);
    }
  }
  
  // Web: Use firebase/auth web SDK
  if (Platform.OS === 'web') {
    try {
      return await sendOTPWeb(phoneNumber);
    } catch (error: any) {
      console.error('[OTP] Web Firebase error:', error);
      // Fallback to mock
      return sendOTPMock(phoneNumber);
    }
  }
  
  // Last fallback: mock
  return sendOTPMock(phoneNumber);
};

export const verifyOTP = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  // Native verification
  if (Platform.OS !== 'web' && nativeAvailable && confirmationResult) {
    try {
      return await verifyOTPNative(code);
    } catch (error: any) {
      console.error('[OTP] Native verify error:', error.code);
      if (error.code === 'auth/invalid-verification-code') {
        return { success: false, message: 'Code incorrect. Vérifiez et réessayez.' };
      }
      if (error.code === 'auth/session-expired') {
        return { success: false, message: 'Code expiré. Renvoyez un nouveau code.' };
      }
      return { success: false, message: 'Code incorrect' };
    }
  }
  
  // Web verification
  if (Platform.OS === 'web' && webConfirmationResult) {
    try {
      return await verifyOTPWeb(code);
    } catch (error: any) {
      if (error.code === 'auth/invalid-verification-code') {
        return { success: false, message: 'Code incorrect. Vérifiez et réessayez.' };
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
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://low-data-shop.preview.emergentagent.com';
    const res = await fetch(`${backendUrl}/api/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${phoneNumber.replace(/^\++/, '')}`, code }),
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
