import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { getCountryFromPhone } from '../utils/countryFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_BG = '#1a2744';

interface AppHeaderProps {
  showSubscription?: boolean;
}

export default function AppHeader({ showSubscription = false }: AppHeaderProps) {
  const { user, isSubscriptionActive, getSubscriptionDaysRemaining, getDaysRemaining, showExpiryReminder } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const country = getCountryFromPhone(user?.phoneNumber || '');
  const isSubActive = isSubscriptionActive();
  const subDaysLeft = getSubscriptionDaysRemaining();
  const daysRemaining = getDaysRemaining();
  const expiryReminder = showExpiryReminder();

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 8 }]}>
        <View style={styles.logoRow}>
          <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
          <Text style={styles.appName}>TekaTeka</Text>
          <Text style={styles.flagEmoji}>{country.flag}</Text>
        </View>
        {showSubscription && (
          <TouchableOpacity
            style={[
              styles.badge,
              isSubActive
                ? (expiryReminder ? styles.warningBadge : styles.activeBadge)
                : (daysRemaining > 0 ? styles.trialBadge : styles.expiredBadge),
            ]}
            onPress={() => router.push('/subscription')}
          >
            <Ionicons
              name={
                isSubActive
                  ? (expiryReminder ? 'warning' : 'shield-checkmark')
                  : (daysRemaining > 0 ? 'time' : 'alert-circle')
              }
              size={14}
              color={
                isSubActive
                  ? (expiryReminder ? '#fcd34d' : '#6ee7b7')
                  : (daysRemaining > 0 ? '#93c5fd' : '#fca5a5')
              }
            />
            <Text style={[
              styles.badgeText,
              isSubActive
                ? (expiryReminder ? styles.warningText : styles.activeText)
                : (daysRemaining > 0 ? styles.trialText : styles.expiredText),
            ]}>
              {isSubActive
                ? (expiryReminder ? `${subDaysLeft}j` : 'Pro')
                : (daysRemaining > 0 ? `${daysRemaining}j essai` : 'Expiré')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
  flagEmoji: {
    fontSize: 20,
    marginLeft: 4,
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
