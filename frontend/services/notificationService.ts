/**
 * Notification Service - STUB VERSION (no native notifications)
 *
 * Native notifications (expo-notifications) have been DISABLED in this build
 * because they require google-services.json on Android and were causing
 * native crashes during OTP login and at app startup.
 *
 * All functions are SAFE NO-OPs that never call any native method.
 * The app uses in-app banners/alerts for trial expiry warnings instead.
 *
 * To re-enable native notifications later:
 *  1. Add google-services.json to /app/frontend/
 *  2. Add expo-notifications to app.json plugins
 *  3. Restore the original notificationService.ts from git history
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ALERT_KEY = '@tekateka:last_expiry_alert';

// ===== NO-OP FUNCTIONS (never call native modules) =====

export async function requestNotificationPermissions(): Promise<boolean> {
  return false;
}

export async function scheduleExpiryReminders(_expiryDate: string, _isTrialMode: boolean): Promise<void> {
  // No-op: native notifications disabled
  return;
}

export async function cancelAllReminders(): Promise<void> {
  // No-op: native notifications disabled
  return;
}

export async function sendInstantNotification(title: string, body: string, _data?: Record<string, any>): Promise<void> {
  // No-op on device — just log for debugging
  try {
    console.log(`[NOTIFICATION-STUB] ${title}: ${body}`);
  } catch {}
}

// ===== IN-APP ALERT HELPERS (pure JS, no native dependency) =====

export async function shouldShowInAppAlert(): Promise<boolean> {
  try {
    const lastAlert = await AsyncStorage.getItem(LAST_ALERT_KEY);
    if (!lastAlert) return true;
    const lastDate = new Date(lastAlert);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
    return hoursDiff >= 24;
  } catch {
    return true;
  }
}

export async function markAlertShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ALERT_KEY, new Date().toISOString());
  } catch {}
}

// ===== URGENCY UTILITIES (pure functions) =====

export function getUrgencyLevel(daysRemaining: number): 'critical' | 'warning' | 'info' | 'none' {
  if (daysRemaining <= 1) return 'critical';
  if (daysRemaining <= 3) return 'warning';
  if (daysRemaining <= 7) return 'info';
  return 'none';
}

export function getUrgencyColor(level: 'critical' | 'warning' | 'info' | 'none'): { bg: string; text: string; border: string; icon: string } {
  switch (level) {
    case 'critical':
      return { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5', icon: '#dc2626' };
    case 'warning':
      return { bg: '#fffbeb', text: '#92400e', border: '#fcd34d', icon: '#f59e0b' };
    case 'info':
      return { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd', icon: '#3b82f6' };
    default:
      return { bg: 'transparent', text: '#64748b', border: 'transparent', icon: '#64748b' };
  }
}
