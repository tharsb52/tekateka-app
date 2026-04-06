import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../components/LoginScreen';
import PinScreen from '../components/PinScreen';

export default function Index() {
  const { user, loading, hasAccess, hasPin, pinVerified, setPinVerified, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      // If user has no PIN or PIN is already verified, proceed to app
      if (!hasPin || pinVerified) {
        if (hasAccess()) {
          router.replace('/(tabs)/dashboard');
        } else {
          router.replace('/subscription');
        }
      }
      // Otherwise stay here and show PinScreen
    }
  }, [user, loading, pinVerified, hasPin]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Not logged in → show login
  if (!user) {
    return <LoginScreen />;
  }

  // User logged in but has PIN that needs verification
  if (hasPin && !pinVerified) {
    return (
      <PinScreen
        userId={user.id}
        mode="verify"
        onSuccess={() => setPinVerified(true)}
        onLogout={logout}
      />
    );
  }

  // Transitioning...
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fef3e7',
  },
});
