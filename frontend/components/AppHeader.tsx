import React from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { Text } from './AppText';
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { getCountryFromPhone } from '../utils/countryFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_BG = '#1a2744';

// Flag image URL from CDN (works on all platforms, no emoji rendering issues)
const getFlagUrl = (countryCode: string) =>
  `https://flagcdn.com/w80/${countryCode.toLowerCase()}.png`;

interface AppHeaderProps {
  showSubscription?: boolean;
}

export default function AppHeader({ showSubscription = false }: AppHeaderProps) {
  const { user, getGraceHoursRemaining, isReadOnly } = useAuth();
  const expiredLabel = user?.isSubscribed ? 'Abonnement expiré' : 'Essai terminé';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const country = getCountryFromPhone(user?.phoneNumber || '');
  const graceHours = getGraceHoursRemaining();
  const readOnly = isReadOnly();
  const lockMessage = readOnly
    ? `${expiredLabel} — consultation seulement`
    : graceHours > 0
      ? `Abonnement expiré — accès bloqué dans ${graceHours} h`
      : '';

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 8 }]}>
        <View style={styles.logoRow}>
          <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
          <Text style={styles.appName}>TekaTeka</Text>
          {country.code !== 'XX' && (
            <Image source={{ uri: getFlagUrl(country.code) }} style={styles.flagImage} />
          )}
        </View>
        {/* Badge "Pro / Essai / Expiré" supprimé du header : la
            SubscriptionStatusCard juste en-dessous affiche déjà toutes
            ces infos (plan + jours restants + date d'expiration).
            Évite le doublon visuel demandé par l'utilisateur. */}
      </View>
      {lockMessage !== '' && (
        <TouchableOpacity
          testID="subscription-lock-banner"
          style={styles.lockBanner}
          onPress={() => router.push('/subscription')}
          activeOpacity={0.85}
        >
          <Ionicons name={readOnly ? 'lock-closed' : 'alarm'} size={18} color="#fff" />
          <Text style={styles.lockBannerText}>{lockMessage}</Text>
          <Text style={styles.lockBannerCta}>{readOnly ? 'Activer' : 'Renouveler'}</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
  },
  lockBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  lockBannerCta: {
    color: '#dc2626',
    backgroundColor: '#fff',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImage: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  flagImage: {
    width: 28,
    height: 20,
    borderRadius: 3,
    marginLeft: 6,
    resizeMode: 'cover',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  trialBadge: { backgroundColor: 'rgba(59,130,246,0.2)', borderColor: 'rgba(147,197,253,0.5)' },
  trialText: { color: '#93c5fd' },
  activeBadge: { backgroundColor: 'rgba(16,185,129,0.2)', borderColor: 'rgba(110,231,183,0.5)' },
  activeText: { color: '#6ee7b7' },
  warningBadge: { backgroundColor: 'rgba(245,158,11,0.2)', borderColor: 'rgba(252,211,77,0.5)' },
  warningText: { color: '#fcd34d' },
  expiredBadge: { backgroundColor: 'rgba(220,38,38,0.2)', borderColor: 'rgba(252,165,165,0.5)' },
  expiredText: { color: '#fca5a5' },
});
