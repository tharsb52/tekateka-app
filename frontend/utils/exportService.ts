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
    const XLSX = await import('xlsx');
    
    const sortedSales = [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const data = sortedSales.map(sale => ({
      'Date': format(new Date(sale.createdAt), 'dd/MM/yyyy'),
      'Heure': format(new Date(sale.createdAt), 'HH:mm'),
      'Produit': sale.productName,
      'Quantite': sale.quantity,
      'Prix Unitaire': sale.price,
      'Total': sale.totalAmount,
      'Paiement': sale.paymentMethod,
      'Devise': sale.currency,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 25 },
      { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 8 },
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
    
    if (Platform.OS === 'web') {
      XLSX.writeFile(wb, `TekaTeka_Ventes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      Alert.alert('Succes', 'Fichier Excel telecharge !');
    } else {
      // On mobile, write to file and share
      const FileSystem = await import('expo-file-system');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = FileSystem.documentDirectory + `TekaTeka_Ventes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Exporter les ventes',
        });
      }
      Alert.alert('Succes', 'Fichier Excel genere !');
    }
  } catch (error) {
    console.error('Excel export error:', error);
    Alert.alert('Erreur', 'Echec de la generation Excel');
  }
}
