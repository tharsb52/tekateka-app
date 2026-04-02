import { Product, Sale, Expense } from '../types';

export const generateSampleProducts = (userId: string): Product[] => {
  const now = new Date().toISOString();
  return [
    {
      id: 'prod-1',
      name: 'Coca Cola 50cl',
      price: 500,
      stock: 48,
      category: 'drinks',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-2',
      name: 'Pain (Baguette)',
      price: 300,
      stock: 25,
      category: 'food',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-3',
      name: 'Savon Lux',
      price: 800,
      stock: 15,
      category: 'cosmetics',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-4',
      name: 'Riz 1kg',
      price: 1500,
      stock: 30,
      category: 'food',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-5',
      name: 'Primus Bière',
      price: 1200,
      stock: 60,
      category: 'drinks',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-6',
      name: 'Chemise Homme',
      price: 5000,
      stock: 8,
      category: 'clothes',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-7',
      name: 'Huile de cuisine 1L',
      price: 2500,
      stock: 12,
      category: 'food',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-8',
      name: 'Fanta Orange',
      price: 500,
      stock: 4,
      category: 'drinks',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-9',
      name: 'Pagne Wax',
      price: 8000,
      stock: 6,
      category: 'clothes',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
    {
      id: 'prod-10',
      name: 'Lait Nido',
      price: 3500,
      stock: 20,
      category: 'food',
      userId,
      createdAt: now,
      updatedAt: now,
      synced: false,
    },
  ];
};

export const generateSampleSales = (userId: string): Sale[] => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  return [
    // Today's sales
    {
      id: 'sale-1',
      productId: 'prod-1',
      productName: 'Coca Cola 50cl',
      quantity: 5,
      price: 500,
      totalAmount: 2500,
      paymentMethod: 'cash' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      synced: false,
    },
    {
      id: 'sale-2',
      productId: 'prod-2',
      productName: 'Pain (Baguette)',
      quantity: 10,
      price: 300,
      totalAmount: 3000,
      paymentMethod: 'mobileMoney' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      synced: false,
    },
    {
      id: 'sale-3',
      productId: 'prod-5',
      productName: 'Primus Bière',
      quantity: 12,
      price: 1200,
      totalAmount: 14400,
      paymentMethod: 'cash' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      synced: false,
    },
    // Yesterday's sales
    {
      id: 'sale-4',
      productId: 'prod-4',
      productName: 'Riz 1kg',
      quantity: 8,
      price: 1500,
      totalAmount: 12000,
      paymentMethod: 'mobileMoney' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - oneDay - 6 * 60 * 60 * 1000).toISOString(),
      synced: false,
    },
    {
      id: 'sale-5',
      productId: 'prod-3',
      productName: 'Savon Lux',
      quantity: 6,
      price: 800,
      totalAmount: 4800,
      paymentMethod: 'cash' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - oneDay - 8 * 60 * 60 * 1000).toISOString(),
      synced: false,
    },
    {
      id: 'sale-6',
      productId: 'prod-1',
      productName: 'Coca Cola 50cl',
      quantity: 8,
      price: 500,
      totalAmount: 4000,
      paymentMethod: 'cash' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - oneDay - 10 * 60 * 60 * 1000).toISOString(),
      synced: false,
    },
    // Two days ago
    {
      id: 'sale-7',
      productId: 'prod-6',
      productName: 'Chemise Homme',
      quantity: 2,
      price: 5000,
      totalAmount: 10000,
      paymentMethod: 'mobileMoney' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 2 * oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'sale-8',
      productId: 'prod-7',
      productName: 'Huile de cuisine 1L',
      quantity: 4,
      price: 2500,
      totalAmount: 10000,
      paymentMethod: 'cash' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 2 * oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'sale-9',
      productId: 'prod-10',
      productName: 'Lait Nido',
      quantity: 3,
      price: 3500,
      totalAmount: 10500,
      paymentMethod: 'cash' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 3 * oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'sale-10',
      productId: 'prod-5',
      productName: 'Primus Bière',
      quantity: 6,
      price: 1200,
      totalAmount: 7200,
      paymentMethod: 'mobileMoney' as const,
      currency: 'CFA',
      userId,
      createdAt: new Date(now - 3 * oneDay).toISOString(),
      synced: false,
    },
  ];
};

export const generateSampleExpenses = (userId: string): Expense[] => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  return [
    {
      id: 'expense-1',
      category: 'inventory',
      amount: 25000,
      currency: 'CFA',
      notes: 'Achat de marchandises au marché',
      userId,
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      synced: false,
    },
    {
      id: 'expense-2',
      category: 'transport',
      amount: 3000,
      currency: 'CFA',
      notes: 'Transport des marchandises',
      userId,
      createdAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      synced: false,
    },
    {
      id: 'expense-3',
      category: 'rent',
      amount: 15000,
      currency: 'CFA',
      notes: 'Loyer du mois',
      userId,
      createdAt: new Date(now - oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'expense-4',
      category: 'electricity',
      amount: 8000,
      currency: 'CFA',
      notes: 'Facture électricité',
      userId,
      createdAt: new Date(now - oneDay - 5 * 60 * 60 * 1000).toISOString(),
      synced: false,
    },
    {
      id: 'expense-5',
      category: 'mobileMoneyFees',
      amount: 1500,
      currency: 'CFA',
      notes: 'Frais Mobile Money',
      userId,
      createdAt: new Date(now - 2 * oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'expense-6',
      category: 'water',
      amount: 2500,
      currency: 'CFA',
      notes: 'Eau du mois',
      userId,
      createdAt: new Date(now - 3 * oneDay).toISOString(),
      synced: false,
    },
  ];
};

export const initializeSampleData = async (userId: string) => {
  const { saveProducts, saveSales, saveExpenses } = await import('./storage');
  
  const products = generateSampleProducts(userId);
  const sales = generateSampleSales(userId);
  const expenses = generateSampleExpenses(userId);
  
  await saveProducts(products);
  await saveSales(sales);
  await saveExpenses(expenses);
  
  return { products, sales, expenses };
};
