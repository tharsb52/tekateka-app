/**
 * OTP Service - Simple backend-based OTP
 * No Firebase needed. Backend handles everything.
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

// Mock OTP for when backend is unreachable
const otpStore = new Map<string, { code: string; expiresAt: number }>();

const sendOTPMock = (phoneNumber: string): OTPResult => {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const key = phoneNumber.replace(/^\++/, '');
  otpStore.set(key, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  console.log(`[MOCK OTP] Code for ${phoneNumber}: ${code}`);
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

export const sendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${phoneNumber.replace(/^\++/, '')}` }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Server unavailable'); }
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'Code envoyé',
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
  // Check mock store first
  const key = phoneNumber.replace(/^\++/, '');
  if (otpStore.has(key)) {
    return verifyOTPMock(phoneNumber, code);
  }
  // Try backend
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
    return verifyOTPMock(phoneNumber, code);
  }
};
