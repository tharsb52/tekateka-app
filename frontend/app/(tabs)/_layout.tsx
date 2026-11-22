import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import Ionicons from "@react-native-vector-icons/ionicons";
import { View, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tr, useLocale } from '../../utils/translate';
import i18n from '../../utils/i18n';

const BG = '#fef3e7';

export default function TabLayout() {
  const { user, loading, hasPin, pinVerified } = useAuth();
  useLocale(); // re-render tab labels when the language changes
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

  // Pas d'accès (abonnement expiré > 48h ou essai terminé) : les onglets
  // restent consultables en lecture seule, les écritures sont bloquées
  // (bandeau rouge dans AppHeader + refus serveur 402).

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
          fontSize: 10,
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
          title: tr('Stock'),
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
          title: tr('Plus'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden but reachable: expo-router 58 redirects away from href:null (hidden) tabs */}
      <Tabs.Screen name="purchases" options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
  );
}
