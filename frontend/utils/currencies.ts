export const CURRENCIES = [
  { code: 'CDF', symbol: 'FC', name: 'Franc Congolais (RDC)' },
  { code: 'USD', symbol: '$', name: 'Dollar Américain' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CFA', symbol: 'FCFA', name: 'Franc CFA' },
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
  } else if (currencyCode === 'EUR') {
    return `${formatted} ${symbol}`;
  }
  return `${formatted} ${symbol}`;
};
