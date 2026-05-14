import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';
import { Sale } from '../types';
import { formatCurrency } from './currencies';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function exportSalesToPDF(sales: Sale[], currency: string, userName: string): Promise<void> {
  const sortedSales = [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalRevenue = sortedSales.reduce((s, sale) => s + sale.totalAmount, 0);

  // Group by day
  const dayMap = new Map<string, Sale[]>();
  sortedSales.forEach(sale => {
    const key = format(new Date(sale.createdAt), 'yyyy-MM-dd');
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(sale);
  });

  let tableRows = '';
  dayMap.forEach((daySales, dateKey) => {
    const dayTotal = daySales.reduce((s, sale) => s + sale.totalAmount, 0);
    const dayLabel = format(new Date(dateKey), 'EEEE dd MMMM yyyy', { locale: fr });
    tableRows += `<tr style="background:#eff6ff"><td colspan="7" style="padding:10px;font-weight:bold;color:#2563eb">${dayLabel} — Total: ${formatCurrency(dayTotal, currency)}</td></tr>`;
    daySales.forEach(sale => {
      const dateStr = format(new Date(sale.createdAt), 'dd/MM/yyyy');
      const time = format(new Date(sale.createdAt), 'HH:mm');
      tableRows += `<tr>
        <td style="padding:6px 10px">${dateStr}</td>
        <td style="padding:6px 10px">${time}</td>
        <td style="padding:6px 10px">${sale.productName}</td>
        <td style="padding:6px 10px;text-align:center">${sale.quantity}</td>
        <td style="padding:6px 10px;text-align:right">${formatCurrency(sale.price, currency)}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:600">${formatCurrency(sale.totalAmount, currency)}</td>
        <td style="padding:6px 10px;text-align:center">${sale.paymentMethod || 'cash'}</td>
      </tr>`;
    });
  });

  const html = `
    <html><head><style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #2563eb; font-size: 24px; }
      h2 { color: #475569; font-size: 14px; margin-top: -10px; }
      .summary { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 15px; margin: 15px 0; }
      .summary h3 { color: #166534; margin: 0; font-size: 20px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { background: #1e293b; color: white; padding: 10px; text-align: left; font-size: 12px; }
      tr:nth-child(even) { background: #f8fafc; }
      td { border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      .footer { margin-top: 20px; text-align: center; color: #94a3b8; font-size: 11px; }
    </style></head><body>
      <h1>TekaTeka — Rapport de Ventes</h1>
      <h2>${userName} • Genere le ${format(new Date(), 'dd/MM/yyyy HH:mm')}</h2>
      <div class="summary">
        <h3>Chiffre d'affaires total: ${formatCurrency(totalRevenue, currency)}</h3>
        <p>${sortedSales.length} ventes • ${dayMap.size} jours</p>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Heure</th><th>Produit</th><th>Qte</th><th>Prix unit.</th><th>Total</th><th>Paiement</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">Rapport genere par TekaTeka — tekateka.app</div>
    </body></html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (Platform.OS === 'web') {
      // On web, trigger download
      const link = document.createElement('a');
      link.href = uri;
      link.download = `TekaTeka_Ventes_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      link.click();
    } else if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exporter les ventes' });
    }
    Alert.alert('Succes', 'Rapport PDF genere !');
  } catch (error) {
    console.error('PDF export error:', error);
    Alert.alert('Erreur', 'Echec de la generation du PDF');
  }
}

export async function exportSalesToExcel(sales: Sale[], currency: string, userName: string): Promise<void> {
  try {
    const sortedSales = [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const totalRevenue = sortedSales.reduce((s, sale) => s + sale.totalAmount, 0);
    const totalQuantity = sortedSales.reduce((s, sale) => s + sale.quantity, 0);

    // CSV with BOM (UTF-8) — Excel reads accents correctly
    const BOM = '\uFEFF';
    const escape = (v: any) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines: string[] = [];
    lines.push(`TekaTeka - Rapport de Ventes`);
    lines.push(`Utilisateur:,${escape(userName)}`);
    lines.push(`Genere le:,${format(new Date(), 'dd/MM/yyyy HH:mm')}`);
    lines.push(`Total ventes:,${sortedSales.length}`);
    lines.push(`Quantite totale:,${totalQuantity}`);
    lines.push(`Chiffre d'affaires:,${formatCurrency(totalRevenue, currency)}`);
    lines.push('');
    lines.push(['Date', 'Heure', 'Produit', 'Quantite', 'Prix unitaire', 'Total', 'Paiement', 'Client'].join(','));
    sortedSales.forEach(sale => {
      const date = new Date(sale.createdAt);
      lines.push([
        escape(format(date, 'dd/MM/yyyy')),
        escape(format(date, 'HH:mm')),
        escape(sale.productName),
        sale.quantity,
        sale.price,
        sale.totalAmount,
        escape(sale.paymentMethod || 'cash'),
        escape((sale as any).customerName || ''),
      ].join(','));
    });

    const csv = BOM + lines.join('\n');
    const filename = `TekaTeka_Ventes_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;

    if (Platform.OS === 'web') {
      // Web: trigger browser download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      Alert.alert('Succes', `Fichier ${filename} telecharge !`);
      return;
    }

    // Mobile: write file and share
    const FileSystem = require('expo-file-system');
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType?.UTF8 || 'utf8' });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exporter les ventes (Excel/CSV)',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      Alert.alert('Fichier prepare', `Sauvegarde a: ${fileUri}`);
    }
  } catch (error: any) {
    console.error('Excel export error:', error);
    Alert.alert('Erreur', error?.message || 'Echec de la generation du fichier Excel');
  }
}
