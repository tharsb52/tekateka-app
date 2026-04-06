// Map phone country code to flag emoji and country name
const COUNTRY_MAP: Record<string, { flag: string; name: string; code: string }> = {
  '243': { flag: '\u{1F1E8}\u{1F1E9}', name: 'RD Congo', code: 'CD' },
  '242': { flag: '\u{1F1E8}\u{1F1EC}', name: 'Congo', code: 'CG' },
  '237': { flag: '\u{1F1E8}\u{1F1F2}', name: 'Cameroun', code: 'CM' },
  '225': { flag: '\u{1F1E8}\u{1F1EE}', name: "Côte d'Ivoire", code: 'CI' },
  '221': { flag: '\u{1F1F8}\u{1F1F3}', name: 'Sénégal', code: 'SN' },
  '254': { flag: '\u{1F1F0}\u{1F1EA}', name: 'Kenya', code: 'KE' },
  '255': { flag: '\u{1F1F9}\u{1F1FF}', name: 'Tanzanie', code: 'TZ' },
  '256': { flag: '\u{1F1FA}\u{1F1EC}', name: 'Ouganda', code: 'UG' },
  '250': { flag: '\u{1F1F7}\u{1F1FC}', name: 'Rwanda', code: 'RW' },
  '257': { flag: '\u{1F1E7}\u{1F1EE}', name: 'Burundi', code: 'BI' },
  '234': { flag: '\u{1F1F3}\u{1F1EC}', name: 'Nigéria', code: 'NG' },
  '233': { flag: '\u{1F1EC}\u{1F1ED}', name: 'Ghana', code: 'GH' },
  '228': { flag: '\u{1F1F9}\u{1F1EC}', name: 'Togo', code: 'TG' },
  '229': { flag: '\u{1F1E7}\u{1F1EF}', name: 'Bénin', code: 'BJ' },
  '226': { flag: '\u{1F1E7}\u{1F1EB}', name: 'Burkina Faso', code: 'BF' },
  '223': { flag: '\u{1F1F2}\u{1F1F1}', name: 'Mali', code: 'ML' },
  '227': { flag: '\u{1F1F3}\u{1F1EA}', name: 'Niger', code: 'NE' },
  '235': { flag: '\u{1F1F9}\u{1F1E9}', name: 'Tchad', code: 'TD' },
  '236': { flag: '\u{1F1E8}\u{1F1EB}', name: 'Centrafrique', code: 'CF' },
  '241': { flag: '\u{1F1EC}\u{1F1E6}', name: 'Gabon', code: 'GA' },
  '240': { flag: '\u{1F1EC}\u{1F1F6}', name: 'Guinée Éq.', code: 'GQ' },
  '33': { flag: '\u{1F1EB}\u{1F1F7}', name: 'France', code: 'FR' },
  '32': { flag: '\u{1F1E7}\u{1F1EA}', name: 'Belgique', code: 'BE' },
  '1': { flag: '\u{1F1FA}\u{1F1F8}', name: 'USA', code: 'US' },
};

export function getCountryFromPhone(phoneNumber: string): { flag: string; name: string; code: string } {
  const cleaned = phoneNumber.replace(/[^0-9]/g, '');
  
  // Try 3-digit codes first (most African countries)
  const three = cleaned.substring(0, 3);
  if (COUNTRY_MAP[three]) return COUNTRY_MAP[three];
  
  // Try 2-digit codes
  const two = cleaned.substring(0, 2);
  if (COUNTRY_MAP[two]) return COUNTRY_MAP[two];
  
  // Try 1-digit code
  const one = cleaned.substring(0, 1);
  if (COUNTRY_MAP[one]) return COUNTRY_MAP[one];
  
  // Default - Africa globe
  return { flag: '\u{1F30D}', name: 'International', code: 'XX' };
}
