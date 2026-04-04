/**
 * OTP Service - Architecture d'intégration
 * 
 * Fournisseur actuel : MOCK (pour développement)
 * Fournisseur cible : Africa's Talking SMS API
 * 
 * Pour activer Africa's Talking :
 * 1. Créer un compte sur https://africastalking.com
 * 2. Obtenir API Key + Username dans le dashboard
 * 3. Ajouter dans .env :
 *    EXPO_PUBLIC_OTP_PROVIDER=africas_talking
 *    EXPO_PUBLIC_AT_USERNAME=your_username
 *    EXPO_PUBLIC_AT_API_KEY=your_api_key
 * 4. Le service basculera automatiquement
 */

export type OTPProvider = 'mock' | 'africas_talking';

interface OTPResult {
  success: boolean;
  message: string;
  otp?: string; // Only returned in mock mode
}

interface VerifyResult {
  success: boolean;
  message: string;
}

// Determine provider from env
const getProvider = (): OTPProvider => {
  const provider = process.env.EXPO_PUBLIC_OTP_PROVIDER;
  if (provider === 'africas_talking') return 'africas_talking';
  return 'mock';
};

// Store OTPs temporarily (in-memory for mock, server-side for production)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

/**
 * Send OTP to a phone number
 */
export const sendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  const provider = getProvider();

  switch (provider) {
    case 'africas_talking':
      return sendOTPAfricasTalking(phoneNumber);
    case 'mock':
    default:
      return sendOTPMock(phoneNumber);
  }
};

/**
 * Verify OTP code
 */
export const verifyOTP = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  const provider = getProvider();

  switch (provider) {
    case 'africas_talking':
      return verifyOTPAfricasTalking(phoneNumber, code);
    case 'mock':
    default:
      return verifyOTPMock(phoneNumber, code);
  }
};

/**
 * Get current provider info
 */
export const getOTPProviderInfo = () => {
  const provider = getProvider();
  return {
    provider,
    isMock: provider === 'mock',
    name: provider === 'africas_talking' ? "Africa's Talking" : 'Mode Test',
  };
};

// ==========================================
// MOCK Provider (Development)
// ==========================================

const sendOTPMock = async (phoneNumber: string): Promise<OTPResult> => {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  otpStore.set(phoneNumber, { code, expiresAt });

  console.log('\n======================');
  console.log('MOCK OTP CODE:', code);
  console.log('Phone:', phoneNumber);
  console.log('Expires in 5 minutes');
  console.log('======================\n');

  return {
    success: true,
    message: `Code envoyé à +${phoneNumber} (mode test)`,
    otp: code, // Returned for display in dev mode
  };
};

const verifyOTPMock = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  const stored = otpStore.get(phoneNumber);

  if (!stored) {
    return { success: false, message: 'Aucun code envoyé pour ce numéro' };
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phoneNumber);
    return { success: false, message: 'Code expiré. Veuillez en demander un nouveau.' };
  }

  if (stored.code !== code) {
    return { success: false, message: 'Code incorrect' };
  }

  otpStore.delete(phoneNumber);
  return { success: true, message: 'Vérification réussie' };
};

// ==========================================
// Africa's Talking Provider (Production)
// ==========================================

const sendOTPAfricasTalking = async (phoneNumber: string): Promise<OTPResult> => {
  /**
   * TODO: Implémenter quand les clés API sont disponibles
   * 
   * L'implémentation utilisera l'API backend :
   * POST /api/otp/send
   * Body: { phoneNumber: "+243..." }
   * 
   * Le backend appellera Africa's Talking SMS API :
   * - Endpoint: https://api.africastalking.com/version1/messaging
   * - Headers: { apiKey: AT_API_KEY, Accept: 'application/json' }
   * - Body: { username: AT_USERNAME, to: phoneNumber, message: `Votre code TekaTeka: ${otp}` }
   */
  
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
  
  try {
    const response = await fetch(`${backendUrl}/api/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${phoneNumber}` }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return {
        success: true,
        message: `Code envoyé à +${phoneNumber}`,
      };
    }

    return {
      success: false,
      message: data.message || "Échec de l'envoi du code",
    };
  } catch (error) {
    console.error("Africa's Talking OTP error:", error);
    // Fallback to mock in case of network error
    console.warn('Falling back to mock OTP due to network error');
    return sendOTPMock(phoneNumber);
  }
};

const verifyOTPAfricasTalking = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';

  try {
    const response = await fetch(`${backendUrl}/api/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: `+${phoneNumber}`, code }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return { success: true, message: 'Vérification réussie' };
    }

    return {
      success: false,
      message: data.message || 'Code incorrect',
    };
  } catch (error) {
    console.error("Africa's Talking verify error:", error);
    return verifyOTPMock(phoneNumber, code);
  }
};
