import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '../../utils/i18n';

const BG = '#fef3e7';

export default function TabLayout() {
  const { user, loading, hasAccess, hasPin, pinVerified } = useAuth();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Si pas connecté, retour à l'accueil
  if (!user) {
    return <Redirect href="/" />;
  }

  // Si PIN non vérifié, retour à index pour montrer PinScreen
  if (hasPin && !pinVerified) {
    return <Redirect href="/" />;
  }

  // Si pas d'accès (essai expiré + pas d'abonnement), forcer vers abonnement
  if (!hasAccess()) {
    return <Redirect href="/subscription" />;
  }

  // Bottom safe area for tab bar (respects phone's navigation bar)
  // Extra generous padding to ensure visibility above phone footer
  const bottomPadding = Math.max(insets.bottom, 16) + 8;

  const TAB_BAR_BG = '#1a2744'; // Dark navy matching header

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#60a5fa',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopWidth: 0,
          height: 62 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
        headerShown: false,
        sceneStyle: { backgroundColor: BG },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: i18n.t('dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: i18n.t('sell'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: i18n.t('products'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: i18n.t('expenses'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="debts"
        options={{
          title: i18n.t('debts'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Plus',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="purchases" options={{ href: null }} />
    </Tabs>
  );
}
