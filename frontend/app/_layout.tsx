import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';
import { loadLocale } from '../utils/i18n';
import { ActivityIndicator, View } from 'react-native';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from '../components/ErrorBoundary';

export default function RootLayout() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Load fonts with error handling to prevent timeout crash
        await Font.loadAsync({
          ...Ionicons.font,
        });
      } catch (e) {
        console.warn('Font loading failed, continuing with system fonts:', e);
      }
      await loadLocale();
      setLoading(false);
    };
    init();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fef3e7' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ErrorBoundary fallbackLabel="Une erreur s'est produite. Touchez Réessayer pour continuer.">
      <SafeAreaProvider>
        <AuthProvider>
          <DataProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="subscription" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </DataProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
