export type SubscriptionPlan = 'monthly' | 'quarterly' | 'yearly';

export interface SubscriptionPricing {
  monthly: { USD: number; EUR: number; CDF: number; CFA: number };
  quarterly: { USD: number; EUR: number; CDF: number; CFA: number };
  yearly: { USD: number; EUR: number; CDF: number; CFA: number };
}

export const SUBSCRIPTION_PRICES: SubscriptionPricing = {
  monthly: { USD: 8, EUR: 8, CDF: 20000, CFA: 4800 },
  quarterly: { USD: 20, EUR: 20, CDF: 50000, CFA: 12000 },
  yearly: { USD: 78, EUR: 78, CDF: 195000, CFA: 46800 },
};

export interface Subscription {
  plan: SubscriptionPlan;
  startDate: string;
  endDate: string;
  isActive: boolean;
  currency: string;
  amount: number;
  reminderSent: boolean;
}
