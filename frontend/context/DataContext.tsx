import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { Product, Sale, Expense, Debt, Purchase } from '../types';
import { useAuth } from './AuthContext';
import { sendInstantNotification } from '../services/notificationService';
import { productsAPI, salesAPI, expensesAPI, debtsAPI, purchasesAPI, changesAPI } from '../services/apiService';
import {
  Collection, OutboxItem, isOfflineError, newClientId,
  loadCache, saveCache, loadSignatures, saveSignatures, loadOutbox, saveOutbox,
} from '../services/offlineSync';

const SYNC_INTERVAL_MS = 60000;
const FETCHERS: Record<Collection, () => Promise<any>> = {
  products: () => productsAPI.getAll(),
  sales: () => salesAPI.getAll(),
  expenses: () => expensesAPI.getAll(),
  debts: () => debtsAPI.getAll(),
  purchases: () => purchasesAPI.getAll(),
};

// Map backend sale to frontend Sale type
function mapBackendSale(s: any): Sale {
  return {
    id: s.id || '',
    productId: s.productId || '',
    productName: s.productName || '',
    quantity: s.quantity || 1,
    price: s.price || (s.total && s.quantity ? s.total / s.quantity : 0),
    totalAmount: s.totalAmount || s.total || 0,
    paymentMethod: s.paymentMethod || 'cash',
    currency: s.currency || 'USD',
    userId: s.userId || '',
    createdAt: s.createdAt || s.date || new Date().toISOString(),
  };
}

// Map backend product to frontend Product type
function mapBackendProduct(p: any): Product {
  return {
    id: p.id || '',
    sku: p.sku || undefined,
    name: p.name || '',
    purchasePrice: p.purchasePrice ?? 0,
    salePrice: p.salePrice ?? p.price ?? 0,
    promotionPrice: p.promotionPrice,
    stock: p.stock ?? 0,
    category: p.category || 'food',
    unit: p.unit || undefined,
    lowStockThreshold: typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 5,
    // Preserve the native currency the product was created in. Critical for
    // multi-currency conversion on the Sell screen — without it we'd assume
    // the product is already in the user's current currency, which breaks
    // parity when the user switches currencies in "Plus".
    currency: p.currency || 'USD',
    outOfStock: typeof p.outOfStock === 'boolean' ? p.outOfStock : (p.stock ?? 0) <= 0,
    lowStock: typeof p.lowStock === 'boolean'
      ? p.lowStock
      : ((p.stock ?? 0) > 0 && (p.stock ?? 0) <= (typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : 5)),
    userId: p.userId || '',
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
  };
}

interface DataContextType {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  debts: Debt[];
  purchases: Purchase[];
  loading: boolean;
  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<{ duplicate: boolean; samePrice?: boolean; existing?: Product }>;
  updateProduct: (id: string, u: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  restockProduct: (id: string, payload: { quantityAdded: number; newPurchasePrice?: number; currency?: string; note?: string }) => Promise<void>;
  addSale: (s: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updateSale: (id: string, u: Partial<Sale>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updateExpense: (id: string, u: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addDebt: (d: Omit<Debt, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updateDebt: (id: string, u: Partial<Debt>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  addPurchase: (p: Omit<Purchase, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updatePurchase: (id: string, u: Partial<Purchase>) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  markDebtAsPaidWithRevenue: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  /** Sales/purchases recorded offline, waiting to be sent */
  pendingCount: number;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingCount, setPendingCount] = useState(0);
  const uidRef = useRef<string | null>(null);
  const syncingRef = useRef(false);

  const SETTERS: Record<Collection, (rows: any[]) => void> = {
    products: (r) => setProducts(r.map(mapBackendProduct)),
    sales: (r) => setSales(r.map(mapBackendSale)),
    expenses: (r) => setExpenses(r),
    debts: (r) => setDebts(r),
    purchases: (r) => setPurchases(r),
  };

  // Local (not yet sent) items shown on top of server data
  const localItems = (outbox: OutboxItem[], kind: 'sale' | 'purchase') =>
    outbox
      .filter((o) => o.kind === kind)
      .map((o) => ({ ...o.payload, id: `local-${o.clientId}`, createdAt: o.createdAt, pending: true }));

  const applyRows = async (uid: string, name: Collection, rows: any[]) => {
    const outbox = await loadOutbox(uid);
    const extra = name === 'sales' ? localItems(outbox, 'sale') : name === 'purchases' ? localItems(outbox, 'purchase') : [];
    SETTERS[name]([...(rows || []), ...extra]);
  };

  /** Send what was recorded offline. Returns true if something was sent. */
  const flushOutbox = async (uid: string): Promise<boolean> => {
    let outbox = await loadOutbox(uid);
    if (!outbox.length) return false;
    let sent = false;
    for (const item of [...outbox]) {
      try {
        const body = { ...item.payload, clientId: item.clientId, offlineCreatedAt: item.createdAt };
        if (item.kind === 'sale') await salesAPI.add(body);
        else await purchasesAPI.add(body);
        sent = true;
      } catch (e) {
        if (isOfflineError(e)) break;
        // Refused by the server (e.g. subscription expired → read-only):
        // drop it so it doesn't retry forever.
        console.warn('[offline] dropping rejected item', item.clientId, e);
      }
      outbox = outbox.filter((o) => o.clientId !== item.clientId);
      await saveOutbox(uid, outbox);
    }
    setPendingCount(outbox.length);
    return sent;
  };

  /** Download only the collections that changed on the server. */
  const syncChanges = async (uid: string, force = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const sentSomething = await flushOutbox(uid);
      const remote = await changesAPI.get();
      const local = await loadSignatures(uid);
      const changed = (Object.keys(FETCHERS) as Collection[]).filter(
        (n) => force || remote[n] !== local[n] || (sentSomething && ['products', 'sales', 'purchases'].includes(n)),
      );
      await Promise.all(changed.map(async (n) => {
        const rows = (await FETCHERS[n]()) || [];
        if (uidRef.current !== uid) return;
        await saveCache(uid, n, rows);
        await applyRows(uid, n, rows);
        local[n] = remote[n];
      }));
      await saveSignatures(uid, local);
    } catch (e) {
      if (!isOfflineError(e)) console.warn('sync error', e);
    } finally {
      syncingRef.current = false;
    }
  };

  // Startup: show the phone's cached data at once, then sync in background
  useEffect(() => {
    const uid = user?.id || null;
    uidRef.current = uid;
    if (!uid) {
      setProducts([]);
      setSales([]);
      setExpenses([]);
      setDebts([]);
      setPurchases([]);
      setPendingCount(0);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      let hadCache = false;
      for (const n of Object.keys(FETCHERS) as Collection[]) {
        const cached = await loadCache(uid, n);
        if (cached) {
          hadCache = true;
          await applyRows(uid, n, cached);
        }
      }
      setPendingCount((await loadOutbox(uid)).length);
      if (hadCache) setLoading(false);
      await syncChanges(uid, !hadCache);
      setLoading(false);
    })();
  }, [user?.id]);

  // Light polling (a few bytes) + sync when the app comes back to front
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') syncChanges(uid);
    }, SYNC_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') syncChanges(uid);
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [user?.id]);

  // Retry sending offline items more often while some are waiting
  useEffect(() => {
    if (!user || pendingCount === 0) return;
    const uid = user.id;
    const t = setInterval(() => syncChanges(uid), 20000);
    return () => clearInterval(t);
  }, [user?.id, pendingCount]);

  const loadData = async (_silent: boolean = false) => {
    if (user) await syncChanges(user.id, true);
  };

  /** Save a sale/purchase on the phone when there is no network. */
  const queueOffline = async (kind: 'sale' | 'purchase', payload: any) => {
    if (!user) return;
    const item: OutboxItem = { kind, clientId: newClientId(), createdAt: new Date().toISOString(), payload };
    const outbox = [...(await loadOutbox(user.id)), item];
    await saveOutbox(user.id, outbox);
    setPendingCount(outbox.length);
    return { ...payload, id: `local-${item.clientId}`, createdAt: item.createdAt, pending: true };
  };

  // PRODUCTS
  const addProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!user) return { duplicate: false } as { duplicate: false };
    try {
      const result = await productsAPI.add({
        name: data.name,
        purchasePrice: data.purchasePrice,
        salePrice: data.salePrice,
        promotionPrice: data.promotionPrice,
        stock: data.stock,
        category: data.category,
        unit: (data as any).unit,
        customUnit: (data as any).customUnit,
        lowStockThreshold: (data as any).lowStockThreshold,
        // Persist the currency the user entered the prices in. The backend
        // falls back to the user's profile currency if missing, so older app
        // versions still work.
        currency: (data as any).currency || user.currency,
      });
      // Backend signals duplicate detection via { duplicate: true, existing, samePrice }
      // — we surface that to the caller without inserting into local state.
      if (result?.duplicate) {
        return {
          duplicate: true,
          samePrice: !!result.samePrice,
          existing: mapBackendProduct(result.existing),
        };
      }
      setProducts(prev => [...prev, mapBackendProduct(result)]);
      return { duplicate: false };
    } catch (error) {
      console.error('Add product error:', error);
      throw error;
    }
  };

  const updateProduct = async (id: string, u: Partial<Product>) => {
    try {
      const result = await productsAPI.update(id, u);
      setProducts(prev => prev.map(p => p.id === id ? mapBackendProduct(result) : p));
    } catch (error) {
      console.error('Update product error:', error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await productsAPI.delete(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Delete product error:', error);
      throw error;
    }
  };

  const restockProduct = async (
    id: string,
    payload: { quantityAdded: number; newPurchasePrice?: number; currency?: string; note?: string },
  ) => {
    try {
      const result = await productsAPI.restock(id, payload);
      // Backend returns the freshly updated product with recomputed stock
      // alert flags — splice it into the local list so dashboards/stats update
      // instantly without waiting for the next 30s polling cycle.
      setProducts(prev => prev.map(p => p.id === id ? mapBackendProduct(result) : p));
    } catch (error) {
      console.error('Restock product error:', error);
      throw error;
    }
  };

  // SALES
  const addSale = async (data: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const salePayload = {
        productId: data.productId,
        productName: data.productName,
        quantity: data.quantity,
        total: data.totalAmount || (data.price || 0) * (data.quantity || 1),
        paymentMethod: data.paymentMethod,
        currency: data.currency,
      };
      let result: any;
      try {
        result = await salesAPI.add({ ...salePayload, clientId: newClientId() });
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        // No network: keep the sale on the phone, send it later
        const local = await queueOffline('sale', salePayload);
        setSales(prev => [...prev, mapBackendSale(local)]);
        setProducts(prev => prev.map(p => p.id === data.productId ? { ...p, stock: p.stock - (data.quantity || 1) } : p));
        return;
      }
      setSales(prev => [...prev, mapBackendSale(result)]);

      // Stock alert from backend
      if (result.stockAlert && result.productNameAlert) {
        sendInstantNotification(
          'Stock epuise !',
          `Le produit "${result.productNameAlert}" est en rupture de stock. Pensez a le reapprovisionner.`,
          { type: 'stock_alert', productId: data.productId, productName: result.productNameAlert }
        ).catch(() => {});
      }

      // Update the stock locally instead of re-downloading every product
      setProducts(prev => prev.map(p => {
        if (p.id !== data.productId) return p;
        const stock = p.stock - (data.quantity || 1);
        return { ...p, stock, outOfStock: stock <= 0, lowStock: stock > 0 && stock <= p.lowStockThreshold };
      }));
    } catch (error) {
      console.error('Add sale error:', error);
      throw error;
    }
  };

  const updateSale = async (id: string, u: Partial<Sale>) => {
    if (id.startsWith('local-')) throw new Error("Cette vente n'est pas encore envoyée : modifiable dès le retour du réseau.");
    try {
      const result = await salesAPI.update(id, u);
      setSales(prev => prev.map(s => s.id === id ? mapBackendSale(result) : s));
    } catch (error) {
      console.error('Update sale error:', error);
      throw error;
    }
  };

  const deleteSale = async (id: string) => {
    if (id.startsWith('local-') && user) {
      // Not sent yet: just remove it from the offline outbox
      const outbox = (await loadOutbox(user.id)).filter((o) => `local-${o.clientId}` !== id);
      await saveOutbox(user.id, outbox);
      setPendingCount(outbox.length);
      const pendingSale = sales.find(x => x.id === id);
      if (pendingSale) {
        setProducts(prev => prev.map(p => p.id === pendingSale.productId ? { ...p, stock: p.stock + (pendingSale.quantity || 1) } : p));
      }
      setSales(prev => prev.filter((x: any) => x.id !== id));
      return;
    }
    try {
      await salesAPI.delete(id);
      setSales(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Delete sale error:', error);
      throw error;
    }
  };

  // EXPENSES
  const addExpense = async (data: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const result = await expensesAPI.add({
        category: data.category,
        customCategory: data.customCategory,
        amount: data.amount,
        currency: data.currency,
        notes: data.notes,
        productId: data.productId,
      });
      setExpenses(prev => [...prev, result]);
    } catch (error) {
      console.error('Add expense error:', error);
      throw error;
    }
  };

  const updateExpense = async (id: string, u: Partial<Expense>) => {
    try {
      const result = await expensesAPI.update(id, u);
      setExpenses(prev => prev.map(e => e.id === id ? result : e));
    } catch (error) {
      console.error('Update expense error:', error);
      throw error;
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await expensesAPI.delete(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('Delete expense error:', error);
      throw error;
    }
  };

  // DEBTS
  const addDebt = async (data: Omit<Debt, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const result = await debtsAPI.add({
        debtorName: data.debtorName,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        dueDate: data.dueDate,
        isPaid: data.isPaid,
      });
      setDebts(prev => [...prev, result]);
    } catch (error) {
      console.error('Add debt error:', error);
      throw error;
    }
  };

  const updateDebt = async (id: string, u: Partial<Debt>) => {
    try {
      const result = await debtsAPI.update(id, u);
      setDebts(prev => prev.map(d => d.id === id ? result : d));
    } catch (error) {
      console.error('Update debt error:', error);
      throw error;
    }
  };

  const deleteDebt = async (id: string) => {
    try {
      await debtsAPI.delete(id);
      setDebts(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      console.error('Delete debt error:', error);
      throw error;
    }
  };

  const markDebtAsPaidWithRevenue = async (debtId: string) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt || !user) return;
    const paidAt = new Date().toISOString();

    try {
      // Update debt as paid
      await debtsAPI.update(debtId, { isPaid: true, paidDate: paidAt });
      setDebts(prev => prev.map(d => d.id === debtId ? { ...d, isPaid: true, paidAt } : d));

      // Create a revenue sale
      const salePayload = {
        productId: 'debt-payment',
        productName: `Dette payee - ${debt.debtorName}`,
        quantity: 1,
        total: debt.amount,
        paymentMethod: 'cash',
        currency: debt.currency || user.currency || 'USD',
      };
      const newSale = await salesAPI.add(salePayload);
      setSales(prev => [...prev, mapBackendSale(newSale)]);
    } catch (error) {
      console.error('Mark debt as paid error:', error);
      throw error;
    }
  };

  // PURCHASES
  const addPurchase = async (data: Omit<Purchase, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const payload = {
        productName: data.productName,
        supplier: data.supplier,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalCost: data.totalCost,
        currency: data.currency,
        notes: data.notes,
      };
      let result: any;
      try {
        result = await purchasesAPI.add({ ...payload, clientId: newClientId() });
      } catch (e) {
        if (!isOfflineError(e)) throw e;
        result = await queueOffline('purchase', payload);
      }
      setPurchases(prev => [...prev, result]);
    } catch (error) {
      console.error('Add purchase error:', error);
      throw error;
    }
  };

  const updatePurchase = async (id: string, u: Partial<Purchase>) => {
    if (id.startsWith('local-')) throw new Error("Cet achat n'est pas encore envoyé : modifiable dès le retour du réseau.");
    try {
      const result = await purchasesAPI.update(id, u);
      setPurchases(prev => prev.map(p => p.id === id ? result : p));
    } catch (error) {
      console.error('Update purchase error:', error);
      throw error;
    }
  };

  const deletePurchase = async (id: string) => {
    if (id.startsWith('local-') && user) {
      // Not sent yet: just remove it from the offline outbox
      const outbox = (await loadOutbox(user.id)).filter((o) => `local-${o.clientId}` !== id);
      await saveOutbox(user.id, outbox);
      setPendingCount(outbox.length);
      setPurchases(prev => prev.filter((x: any) => x.id !== id));
      return;
    }
    try {
      await purchasesAPI.delete(id);
      setPurchases(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Delete purchase error:', error);
      throw error;
    }
  };

  const refreshData = async () => {
    await loadData();
  };

  return (
    <DataContext.Provider value={{
      products, sales, expenses, debts, purchases, loading,
      addProduct, updateProduct, deleteProduct, restockProduct,
      addSale, updateSale, deleteSale,
      addExpense, updateExpense, deleteExpense,
      addDebt, updateDebt, deleteDebt,
      addPurchase, updatePurchase, deletePurchase,
      markDebtAsPaidWithRevenue, refreshData, pendingCount,
    }}>
      {children}
    </DataContext.Provider>
  );
};
