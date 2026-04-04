import { Debt } from '../types';

export const generateSampleDebts = (userId: string): Debt[] => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  return [
    {
      id: 'debt-1',
      debtorName: 'Jean Mukendi',
      amount: 50,
      currency: 'USD',
      description: 'Vente à crédit - 2 sacs de riz',
      dueDate: new Date(now + 7 * oneDay).toISOString(),
      isPaid: false,
      userId,
      createdAt: new Date(now - 3 * oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'debt-2',
      debtorName: 'Marie Kabongo',
      amount: 25,
      currency: 'USD',
      description: 'Achat de vêtements',
      dueDate: new Date(now + 3 * oneDay).toISOString(),
      isPaid: false,
      userId,
      createdAt: new Date(now - 5 * oneDay).toISOString(),
      synced: false,
    },
    {
      id: 'debt-3',
      debtorName: 'Papa Nsimba',
      amount: 15,
      currency: 'USD',
      description: 'Boissons pour événement',
      isPaid: true,
      userId,
      createdAt: new Date(now - 10 * oneDay).toISOString(),
      paidAt: new Date(now - 2 * oneDay).toISOString(),
      synced: false,
    },
  ];
};
