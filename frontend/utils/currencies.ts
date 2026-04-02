export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'CFA', symbol: 'FCFA', name: 'CFA Franc' },
  { code: 'CDF', symbol: 'FC', name: 'Congolese Franc' },
];

export const getCurrencySymbol = (code: string): string => {
  const currency = CURRENCIES.find(c => c.code === code);
  return currency ? currency.symbol : code;
};

export const formatCurrency = (amount: number, currencyCode: string): string => {
  const symbol = getCurrencySymbol(currencyCode);
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  
  if (currencyCode === 'USD') {
    return `${symbol}${formatted}`;
  }
  return `${formatted} ${symbol}`;
};
