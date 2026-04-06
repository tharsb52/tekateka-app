export const CURRENCIES = [
  { code: 'CDF', symbol: 'FC', name: 'Franc Congolais (RDC)' },
  { code: 'USD', symbol: '$', name: 'Dollar Américain' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CFA', symbol: 'FCFA', name: 'Franc CFA' },
  { code: 'KES', symbol: 'KSh', name: 'Shilling Kenyan' },
  { code: 'RWF', symbol: 'FRw', name: 'Franc Rwandais' },
  { code: 'BIF', symbol: 'FBu', name: 'Franc Burundais' },
  { code: 'NGN', symbol: '₦', name: 'Naira Nigérian' },
];

export const getCurrencySymbol = (code: string): string => {
  const currency = CURRENCIES.find(c => c.code === code);
  return currency ? currency.symbol : code;
};

// Approximate exchange rates to USD (for dashboard conversion)
const RATES_TO_USD: Record<string, number> = {
  'USD': 1,
  'CDF': 0.00036,    // 1 CDF ≈ 0.00036 USD
  'EUR': 1.08,       // 1 EUR ≈ 1.08 USD
  'CFA': 0.0016,     // 1 XAF/XOF ≈ 0.0016 USD
  'KES': 0.0065,     // 1 KES ≈ 0.0065 USD
  'RWF': 0.00073,    // 1 RWF ≈ 0.00073 USD
  'BIF': 0.00035,    // 1 BIF ≈ 0.00035 USD
  'NGN': 0.00063,    // 1 NGN ≈ 0.00063 USD
};

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = RATES_TO_USD[fromCurrency] || 1;
  const toRate = RATES_TO_USD[toCurrency] || 1;
  
  // Convert: from → USD → to
  const usdAmount = amount * fromRate;
  return usdAmount / toRate;
}

export const formatCurrency = (amount: number, currencyCode: string): string => {
  const symbol = getCurrencySymbol(currencyCode);
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  if (currencyCode === 'USD') {
    return `${symbol}${formatted}`;
  } else if (currencyCode === 'EUR') {
    return `${formatted} ${symbol}`;
  }
  return `${formatted} ${symbol}`;
};
