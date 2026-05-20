/**
 * Stripe Checkout helper for TekaTeka mobile.
 *
 * Flow:
 *   1. Caller asks backend for a Checkout session URL.
 *   2. We open the URL in an in-app browser (expo-web-browser).
 *   3. When the user dismisses the browser (paid OR cancelled), we poll
 *      the backend for the session status until it's no longer "pending".
 *   4. We return the final outcome so the caller can refresh the UI.
 *
 * No native Stripe SDK is loaded -> APK stays small, EAS build stays stable.
 */
import * as WebBrowser from 'expo-web-browser';
import { paymentsAPI } from './apiService';

export type CheckoutOutcome = {
  status: 'completed' | 'pending' | 'cancelled' | 'error';
  type?: 'subscription' | 'ambassador_codes';
  amount?: number;
  currency?: string;
  error?: string;
};

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_TRIES = 12; // 12 * 2s = 24s after the user returns

async function pollSession(
  sessionId: string,
  asAmbassador = false,
): Promise<CheckoutOutcome> {
  const fetcher = asAmbassador
    ? paymentsAPI.stripeSessionStatusAsAmbassador
    : paymentsAPI.stripeSessionStatus;
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    try {
      const res = await fetcher(sessionId);
      if (res?.status && res.status !== 'pending') {
        return {
          status: res.status,
          type: res.type,
          amount: res.amount,
          currency: res.currency,
        };
      }
    } catch (_e) {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: 'pending' };
}

/**
 * Open Stripe Checkout in the in-app browser and resolve when the user
 * is done. Falls back to "cancelled" if the user dismisses the sheet.
 */
export async function openStripeCheckout(
  url: string,
  sessionId: string,
  asAmbassador = false,
): Promise<CheckoutOutcome> {
  try {
    const result = await WebBrowser.openBrowserAsync(url, {
      // iOS: ephemeral session avoids cookie clutter; on Android this is a no-op
      dismissButtonStyle: 'close',
      showTitle: true,
      enableBarCollapsing: false,
    });

    // result.type can be: "cancel" (user closed) or "dismiss" (after redirect)
    // Either way, payment status is authoritative on backend -> we poll.
    const outcome = await pollSession(sessionId, asAmbassador);
    if (outcome.status === 'pending') {
      // Couldn't confirm in time -> treat as cancelled from UX point of view.
      // The webhook will still complete it asynchronously; next data sync will pick it up.
      return { ...outcome, status: result.type === 'cancel' ? 'cancelled' : 'pending' };
    }
    return outcome;
  } catch (e: any) {
    return { status: 'error', error: e?.message || String(e) };
  }
}

export async function buySubscription(
  plan: 'monthly' | 'quarterly' | 'yearly'
): Promise<CheckoutOutcome> {
  try {
    const session = await paymentsAPI.stripeSubscriptionCheckout(plan);
    if (!session?.url || !session?.sessionId) {
      return { status: 'error', error: 'Session Stripe invalide' };
    }
    return await openStripeCheckout(session.url, session.sessionId);
  } catch (e: any) {
    return { status: 'error', error: e?.message || 'Erreur de paiement' };
  }
}

/**
 * Purchase activation codes WHEN the buyer is authenticated as an ambassador
 * (i.e. coming from the /ambassador/* flow). The Bearer token used is the
 * ambassador JWT, NOT the regular-user JWT. Codes will be created in the
 * `activation_codes` collection and become visible in the ambassador
 * dashboard immediately after Stripe confirms the payment.
 */
export async function buyAmbassadorCodes(
  plan: 'monthly' | 'quarterly' | 'yearly',
  quantity: number
): Promise<CheckoutOutcome> {
  try {
    const session = await paymentsAPI.stripeAmbassadorCheckoutAsAmbassador(plan, quantity);
    if (!session?.url || !session?.sessionId) {
      return { status: 'error', error: 'Session Stripe invalide' };
    }
    return await openStripeCheckout(session.url, session.sessionId, /* asAmbassador */ true);
  } catch (e: any) {
    return { status: 'error', error: e?.message || 'Erreur de paiement' };
  }
}
