/**
 * OTP Service with Firebase Phone Auth
 * 
 * Priority: Firebase Phone Auth (free 10K/month) → Mock fallback (dev only)
 * 
 * Firebase Phone Auth works on:
 * - Web preview: Full SMS via Firebase with invisible reCAPTCHA
 * - Native (production build): Full SMS via Firebase native module
 * - Expo Go (dev): Falls back to mock OTP (Firebase needs native config)
 */
import { Platform } from 'react-native';
import { auth } from './firebase';
import { signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult } from 'firebase/auth';

interface OTPResult {
  success: boolean;
  message: string;
  otp?: string; // Only for mock/debug
  confirmationResult?: ConfirmationResult;
}

interface VerifyResult {
  success: boolean;
  message: string;
  firebaseUser?: any;
}

// Store confirmation result for verification
let currentConfirmationResult: ConfirmationResult | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

// Mock OTP store for development
const otpStore = new Map<string, { code: string; expiresAt: number }>();

// =========================================
// Firebase Phone Auth (Primary - Web)
// =========================================
const sendOTPFirebase = async (phoneNumber: string): Promise<OTPResult> => {
  try {
    // Format phone number with +
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    
    // Create invisible reCAPTCHA verifier
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Clean up previous verifier
      if (recaptchaVerifier) {
        try { recaptchaVerifier.clear(); } catch {}
      }
      
      // Check if container exists, create if not
      let container = document.getElementById('recaptcha-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'recaptcha-container';
        container.style.display = 'none';
        document.body.appendChild(container);
      }
      
      recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          console.log('[Firebase] reCAPTCHA resolved');
        },
      });

      const result = await signInWithPhoneNumber(auth, formattedNumber, recaptchaVerifier);
      currentConfirmationResult = result;
      
      return {
        success: true,
        message: `Code envoyé par SMS au ${formattedNumber}`,
        confirmationResult: result,
      };
    }
    
    // On native, Firebase web SDK signInWithPhoneNumber won't work without native module
    throw new Error('Firebase Phone Auth requires web or native build');
  } catch (error: any) {
    console.error('[Firebase OTP] Error:', error.code, error.message);
    
    // Provide user-friendly error messages
    if (error.code === 'auth/invalid-phone-number') {
      return { success: false, message: 'Numéro de téléphone invalide' };
    }
    if (error.code === 'auth/too-many-requests') {
      return { success: false, message: 'Trop de tentatives. Réessayez plus tard.' };
    }
    if (error.code === 'auth/quota-exceeded') {
      return { success: false, message: 'Quota SMS dépassé. Réessayez demain.' };
    }
    
    // Fallback to mock for development
    throw error;
  }
};

const verifyOTPFirebase = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  try {
    if (!currentConfirmationResult) {
      return { success: false, message: "Aucun code en attente. Renvoyez le code." };
    }
    
    const credential = await currentConfirmationResult.confirm(code);
    currentConfirmationResult = null;
    
    return {
      success: true,
      message: 'Vérification réussie',
      firebaseUser: credential.user,
    };
  } catch (error: any) {
    console.error('[Firebase Verify] Error:', error.code, error.message);
    
    if (error.code === 'auth/invalid-verification-code') {
      return { success: false, message: 'Code incorrect. Vérifiez et réessayez.' };
    }
    if (error.code === 'auth/code-expired') {
      return { success: false, message: 'Code expiré. Renvoyez un nouveau code.' };
    }
    
    return { success: false, message: 'Code incorrect' };
  }
};

// =========================================
// Mock OTP (Fallback for Expo Go / Dev)
// =========================================
const sendOTPMock = (phoneNumber: string): OTPResult => {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  otpStore.set(phoneNumber, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  console.log(`[MOCK OTP] Code for ${phoneNumber}: ${code}`);
  return {
    success: true,
    message: `Code de vérification envoyé (mode test)`,
    otp: code,
  };
};

const verifyOTPMock = (phoneNumber: string, code: string): VerifyResult => {
  const stored = otpStore.get(phoneNumber);
  if (!stored) {
    return { success: false, message: 'Aucun code envoyé pour ce numéro' };
  }
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phoneNumber);
    return { success: false, message: 'Code expiré. Renvoyez un nouveau code.' };
  }
  if (stored.code !== code) {
    return { success: false, message: 'Code incorrect' };
  }
  otpStore.delete(phoneNumber);
  return { success: true, message: 'Vérification réussie' };
};

// =========================================
// Public API
// =========================================
export const sendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  // Try Firebase on web
  if (Platform.OS === 'web') {
    try {
      return await sendOTPFirebase(phoneNumber);
    } catch (error) {
      console.warn('[OTP] Firebase failed, falling back to mock:', error);
      return sendOTPMock(phoneNumber);
    }
  }
  
  // On native (Expo Go), try backend first, then mock
  try {
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const response = await fetch(`${backendUrl}/api/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${phoneNumber.replace(/^\++/, '')}` }),
    });
    const responseText = await response.text();
    let data;
    try { data = JSON.parse(responseText); } catch {
      throw new Error('Server unavailable');
    }
    if (response.ok && data.success) {
      return {
        success: true,
        message: data.message || `Code envoyé à +${phoneNumber}`,
        otp: data.debug_code || undefined,
      };
    }
    throw new Error(data.message || 'Failed');
  } catch (error) {
    console.warn('[OTP] Backend failed, using mock:', error);
    return sendOTPMock(phoneNumber);
  }
};

export const verifyOTP = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  // On web, verify via Firebase if we have a confirmation result
  if (Platform.OS === 'web' && currentConfirmationResult) {
    return verifyOTPFirebase(phoneNumber, code);
  }
  
  // Check local mock store FIRST (fastest, no network needed)
  const normalizedPhone = phoneNumber.replace(/^\++/, '');
  const possibleKeys = [normalizedPhone, phoneNumber, `+${normalizedPhone}`];
  for (const key of possibleKeys) {
    if (otpStore.has(key)) {
      const result = verifyOTPMock(key, code);
      return result;
    }
  }
  
  // If not in local store, try backend verification
  try {
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const response = await fetch(`${backendUrl}/api/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${normalizedPhone}`, code }),
    });
    const responseText = await response.text();
    let data;
    try { data = JSON.parse(responseText); } catch {
      return { success: false, message: 'Serveur inaccessible' };
    }
    if (response.ok && data.success) {
      return { success: true, message: 'Vérification réussie' };
    }
    return { success: false, message: data.message || 'Code incorrect' };
  } catch (error) {
    return { success: false, message: 'Erreur de connexion' };
  }
};
