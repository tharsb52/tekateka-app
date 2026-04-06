import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { getCountryFromPhone } from '../utils/countryFlags';
import { cardShadow } from '../utils/shadows';

const BG = '#fef3e7';

interface AppHeaderProps {
  title?: string;
  showSubscription?: boolean;
}

export default function AppHeader({ title, showSubscription = false }: AppHeaderProps) {
  const { user, isSubscriptionActive, getSubscriptionDaysRemaining, getDaysRemaining, showExpiryReminder } = useAuth();
  const router = useRouter();
  const country = getCountryFromPhone(user?.phoneNumber || '');
  const isSubActive = isSubscriptionActive();
  const subDaysLeft = getSubscriptionDaysRemaining();
  const daysRemaining = getDaysRemaining();
  const expiryReminder = showExpiryReminder();

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.logoRow}>
          <Image source={require('../assets/images/tk-logo-transparent.png')} style={styles.logoImage} />
          <Text style={styles.appName}>TekaTeka</Text>
          <Text style={styles.flagEmoji}>{country.flag}</Text>
        </View>
        {title ? (
          <Text style={styles.pageTitle}>{title}</Text>
        ) : null}
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
                ? (expiryReminder ? '#92400e' : '#065f46')
                : (daysRemaining > 0 ? '#1e40af' : '#dc2626')
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
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: BG,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ede0d4',
  },
  headerLeft: {
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoImage: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  appName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  flagEmoji: {
    fontSize: 18,
    marginLeft: 4,
  },
  pageTitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
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
  trialBadge: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  trialText: { color: '#1e40af' },
  activeBadge: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  activeText: { color: '#065f46' },
  warningBadge: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  warningText: { color: '#92400e' },
  expiredBadge: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  expiredText: { color: '#dc2626' },
});
