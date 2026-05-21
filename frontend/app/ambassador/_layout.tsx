import React, { useEffect } from 'react';
import { BackHandler, Alert, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Layout dedicated to the /ambassador/* section.
 *
 * Responsibility: trap the Android hardware back button so the ambassador
 * stays inside their dedicated workspace. Before this layout existed, the
 * back button bubbled up to the global expo-router stack and dumped the
 * user back into the main shopkeeper app — confusing UX for someone who
 * never intended to be there.
 *
 * Rules (per product spec):
 *   * On the ambassador *home* (dashboard) -> back asks them to confirm
 *     logout instead of leaving the section.
 *   * On any sub-screen (buy-codes / activate / scan / codes/[plan] / etc.)
 *     -> back navigates to /ambassador/dashboard (NOT outside the section).
 *   * Outside the section -> default behavior, untouched.
 */
export default function AmbassadorLayout() {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handler = () => {
      // segments looks like ['ambassador'] on /ambassador, ['ambassador','dashboard'] on /ambassador/dashboard, etc.
      const segs = segments as readonly string[];
      const inAmbassador = segs[0] === 'ambassador';
      if (!inAmbassador) return false; // not our concern, let RN handle it.

      const screen = segs[1];
      // On the ambassador home (dashboard or login page), intercept and offer logout.
      if (!screen || screen === 'dashboard' || screen === 'index') {
        Alert.alert(
          'Quitter l\'espace Ambassadeur ?',
          'Voulez-vous vous déconnecter et revenir à l\'application principale ?',
          [
            { text: 'Rester ici', style: 'cancel' },
            {
              text: 'Se déconnecter',
              style: 'destructive',
              onPress: async () => {
                try {
                  await AsyncStorage.multiRemove(['ambassador_token', 'ambassador_data']);
                } catch { /* ignore */ }
                router.replace('/');
              },
            },
          ]
        );
        return true; // consume the back press
      }

      // Sub-screens: redirect to dashboard instead of popping out of the section.
      router.replace('/ambassador/dashboard');
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [router, segments]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Prevent gesture-based swipe to dismiss back to the main app on iOS too.
        gestureEnabled: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
