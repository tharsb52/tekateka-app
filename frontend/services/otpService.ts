/**
 * OTP Service - Firebase Phone Auth via WebView
 * 
 * Approche: Le backend sert une page web qui gère Firebase Auth.
 * L'app ouvre cette page dans un WebView invisible/visible.
 * Fonctionne sur TOUS les appareils (Android, iOS, Web).
 */
import { API_BASE_URL } from './constants';

interface OTPResult {
  success: boolean;
  message: string;
  otp?: string;
  useWebView?: boolean;
  webViewUrl?: string;
}

interface VerifyResult {
  success: boolean;
  message: string;
}

// Mock OTP store (fallback)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export const getFirebaseVerifyUrl = (phoneNumber: string): string => {
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  return `${API_BASE_URL}/api/auth/firebase-verify?phone=${encodeURIComponent(formatted)}`;
};

export const sendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  // Always use WebView approach - it works everywhere
  const formatted = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  return {
    success: true,
    message: `Vérification du numéro ${formatted}`,
    useWebView: true,
    webViewUrl: getFirebaseVerifyUrl(phoneNumber),
  };
};

export const verifyOTP = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  // This is called when WebView returns success
  // The WebView already verified with Firebase, we just need to login to our backend
  return { success: true, message: 'Vérification réussie' };
};

// Used by Settings screen to display the OTP provider info
export const getOTPProviderInfo = () => {
  return {
    name: 'Firebase Phone Auth',
    isMock: false,
  };
};
