import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../components/LoginScreen';

export default function Index() {
  const { user, loading, hasAccess } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (hasAccess()) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/subscription');
      }
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

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
