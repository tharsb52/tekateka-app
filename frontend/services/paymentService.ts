/**
 * Payment Service - Architecture d'intégration Mobile Money
 * 
 * Fournisseur actuel : MOCK (simulation de paiement)
 * Fournisseurs cibles :
 *   - MTN Mobile Money (MoMo API)
 *   - Orange Money
 *   - M-Pesa (Safaricom/Vodacom)
 * 
 * Pour activer un fournisseur :
 * 1. Obtenir les clés API du fournisseur
 * 2. Ajouter dans .env :
 *    EXPO_PUBLIC_PAYMENT_PROVIDER=mtn|orange|mpesa
 *    (+ les clés spécifiques au fournisseur)
 * 3. Configurer les endpoints backend correspondants
 */

import { SubscriptionPlan } from '../types/subscription';

export type PaymentProvider = 'mock' | 'mtn' | 'orange' | 'mpesa';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface PaymentRequest {
  amount: number;
  currency: string;
  phoneNumber: string;
  plan: SubscriptionPlan;
  description?: string;
}

export interface PaymentResult {
  success: boolean;
  status: PaymentStatus;
  transactionId?: string;
  message: string;
  provider: PaymentProvider;
}

export interface PaymentProviderInfo {
  provider: PaymentProvider;
  isMock: boolean;
  name: string;
  supportedCurrencies: string[];
  supportedCountries: string[];
}

// Determine provider from env
const getProvider = (): PaymentProvider => {
  const provider = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER;
  if (provider === 'mtn') return 'mtn';
  if (provider === 'orange') return 'orange';
  if (provider === 'mpesa') return 'mpesa';
  return 'mock';
};

/**
 * Process a payment
 */
export const processPayment = async (request: PaymentRequest): Promise<PaymentResult> => {
  const provider = getProvider();

  switch (provider) {
    case 'mtn':
      return processPaymentMTN(request);
    case 'orange':
      return processPaymentOrange(request);
    case 'mpesa':
      return processPaymentMPesa(request);
    case 'mock':
    default:
      return processPaymentMock(request);
  }
};

/**
 * Check payment status
 */
export const checkPaymentStatus = async (transactionId: string): Promise<PaymentResult> => {
  const provider = getProvider();
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://low-data-shop.preview.emergentagent.com';

  if (provider === 'mock') {
    return {
      success: true,
      status: 'success',
      transactionId,
      message: 'Paiement confirmé (mode test)',
      provider: 'mock',
    };
  }

  try {
    const response = await fetch(`${backendUrl}/api/payments/status/${transactionId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      transactionId,
      message: 'Impossible de vérifier le statut',
      provider,
    };
  }
};

/**
 * Get available payment providers for a country
 */
export const getAvailableProviders = (countryCode: string): PaymentProviderInfo[] => {
  const providers: PaymentProviderInfo[] = [];

  // MTN MoMo - Available in DRC, Cameroon, Ivory Coast, etc.
  if (['243', '237', '225', '256', '233', '250'].includes(countryCode)) {
    providers.push({
      provider: 'mtn',
      isMock: getProvider() !== 'mtn',
      name: 'MTN Mobile Money',
      supportedCurrencies: ['CDF', 'CFA', 'USD'],
      supportedCountries: ['RDC', 'Cameroun', "Côte d'Ivoire", 'Ouganda', 'Ghana', 'Rwanda'],
    });
  }

  // Orange Money - Available in DRC, Cameroon, Ivory Coast, etc.
  if (['243', '237', '225', '221', '223'].includes(countryCode)) {
    providers.push({
      provider: 'orange',
      isMock: getProvider() !== 'orange',
      name: 'Orange Money',
      supportedCurrencies: ['CDF', 'CFA', 'USD'],
      supportedCountries: ['RDC', 'Cameroun', "Côte d'Ivoire", 'Sénégal', 'Mali'],
    });
  }

  // M-Pesa - Available in DRC, Kenya, Tanzania, etc.
  if (['243', '254', '255', '258'].includes(countryCode)) {
    providers.push({
      provider: 'mpesa',
      isMock: getProvider() !== 'mpesa',
      name: 'M-Pesa',
      supportedCurrencies: ['CDF', 'KES', 'USD'],
      supportedCountries: ['RDC', 'Kenya', 'Tanzanie', 'Mozambique'],
    });
  }

  return providers;
};

/**
 * Get current provider info
 */
export const getPaymentProviderInfo = (): PaymentProviderInfo => {
  const provider = getProvider();
  const names: Record<PaymentProvider, string> = {
    mock: 'Mode Test',
    mtn: 'MTN Mobile Money',
    orange: 'Orange Money',
    mpesa: 'M-Pesa',
  };

  return {
    provider,
    isMock: provider === 'mock',
    name: names[provider],
    supportedCurrencies: ['CDF', 'CFA', 'USD', 'EUR'],
    supportedCountries: ['RDC', 'Cameroun', "Côte d'Ivoire"],
  };
};

// ==========================================
// MOCK Provider (Development)
// ==========================================

const processPaymentMock = async (request: PaymentRequest): Promise<PaymentResult> => {
  // Simulate payment delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  const txId = `MOCK-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log('\n======================');
  console.log('MOCK PAYMENT PROCESSED');
  console.log('Amount:', request.amount, request.currency);
  console.log('Phone:', request.phoneNumber);
  console.log('Plan:', request.plan);
  console.log('Transaction ID:', txId);
  console.log('======================\n');

  return {
    success: true,
    status: 'success',
    transactionId: txId,
    message: `Paiement de ${request.amount} ${request.currency} réussi (mode test)`,
    provider: 'mock',
  };
};

// ==========================================
// MTN Mobile Money (Production)
// ==========================================

const processPaymentMTN = async (request: PaymentRequest): Promise<PaymentResult> => {
  /**
   * TODO: Implémenter avec MTN MoMo API
   * 
   * Flow:
   * 1. POST /api/payments/mtn/initiate
   *    Body: { amount, currency, phoneNumber, externalId }
   * 2. MTN envoie un USSD prompt au client
   * 3. Client confirme avec son PIN
   * 4. Callback webhook → /api/payments/mtn/callback
   * 5. Frontend poll /api/payments/status/{txId}
   * 
   * Backend config requise :
   *   MTN_MOMO_API_KEY=xxx
   *   MTN_MOMO_USER_ID=xxx
   *   MTN_MOMO_SUBSCRIPTION_KEY=xxx
   *   MTN_MOMO_ENVIRONMENT=sandbox|production
   *   MTN_MOMO_CALLBACK_URL=https://your-domain/api/payments/mtn/callback
   */

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://low-data-shop.preview.emergentagent.com';

  try {
    const response = await fetch(`${backendUrl}/api/payments/mtn/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        phoneNumber: request.phoneNumber,
        plan: request.plan,
        description: request.description || `Abonnement TekaTeka ${request.plan}`,
      }),
    });

    const data = await response.json();

    if (response.ok && data.transactionId) {
      return {
        success: true,
        status: 'pending',
        transactionId: data.transactionId,
        message: 'Confirmez le paiement sur votre téléphone MTN',
        provider: 'mtn',
      };
    }

    return {
      success: false,
      status: 'failed',
      message: data.message || 'Échec du paiement MTN',
      provider: 'mtn',
    };
  } catch (error) {
    console.error('MTN MoMo error:', error);
    return { success: false, status: 'failed', message: 'Erreur réseau MTN', provider: 'mtn' };
  }
};

// ==========================================
// Orange Money (Production)
// ==========================================

const processPaymentOrange = async (request: PaymentRequest): Promise<PaymentResult> => {
  /**
   * TODO: Implémenter avec Orange Money API
   * 
   * Backend config requise :
   *   ORANGE_MONEY_CLIENT_ID=xxx
   *   ORANGE_MONEY_CLIENT_SECRET=xxx
   *   ORANGE_MONEY_MERCHANT_KEY=xxx
   *   ORANGE_MONEY_ENVIRONMENT=sandbox|production
   */

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://low-data-shop.preview.emergentagent.com';

  try {
    const response = await fetch(`${backendUrl}/api/payments/orange/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        phoneNumber: request.phoneNumber,
        plan: request.plan,
      }),
    });

    const data = await response.json();

    if (response.ok && data.transactionId) {
      return {
        success: true,
        status: 'pending',
        transactionId: data.transactionId,
        message: 'Confirmez le paiement sur votre téléphone Orange',
        provider: 'orange',
      };
    }

    return { success: false, status: 'failed', message: data.message || 'Échec Orange Money', provider: 'orange' };
  } catch (error) {
    console.error('Orange Money error:', error);
    return { success: false, status: 'failed', message: 'Erreur réseau Orange', provider: 'orange' };
  }
};

// ==========================================
// M-Pesa (Production)
// ==========================================

const processPaymentMPesa = async (request: PaymentRequest): Promise<PaymentResult> => {
  /**
   * TODO: Implémenter avec M-Pesa API (Daraja / Vodacom)
   * 
   * Backend config requise :
   *   MPESA_CONSUMER_KEY=xxx
   *   MPESA_CONSUMER_SECRET=xxx
   *   MPESA_SHORTCODE=xxx
   *   MPESA_PASSKEY=xxx
   *   MPESA_ENVIRONMENT=sandbox|production
   *   MPESA_CALLBACK_URL=https://your-domain/api/payments/mpesa/callback
   */

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://low-data-shop.preview.emergentagent.com';

  try {
    const response = await fetch(`${backendUrl}/api/payments/mpesa/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency,
        phoneNumber: request.phoneNumber,
        plan: request.plan,
      }),
    });

    const data = await response.json();

    if (response.ok && data.transactionId) {
      return {
        success: true,
        status: 'pending',
        transactionId: data.transactionId,
        message: 'Confirmez le paiement M-Pesa sur votre téléphone',
        provider: 'mpesa',
      };
    }

    return { success: false, status: 'failed', message: data.message || 'Échec M-Pesa', provider: 'mpesa' };
  } catch (error) {
    console.error('M-Pesa error:', error);
    return { success: false, status: 'failed', message: 'Erreur réseau M-Pesa', provider: 'mpesa' };
  }
};
