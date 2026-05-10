import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy-load expo-notifications and gracefully handle missing native module
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  console.warn('[notificationService] expo-notifications not available', e);
}

const NOTIFICATION_KEY = '@tekateka:notifications_scheduled';
const LAST_ALERT_KEY = '@tekateka:last_expiry_alert';

// Configure notification behavior (safely)
try {
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (e) {
  console.warn('[notificationService] setNotificationHandler failed', e);
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!Notifications) return false;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (e) {
    console.warn('[notificationService] permissions failed', e);
    return false;
  }
}

export async function scheduleExpiryReminders(expiryDate: string, isTrialMode: boolean): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    // Cancel all previous scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();

    const expiry = new Date(expiryDate);
    const now = new Date();

    const typeLabel = isTrialMode ? "Essai gratuit" : "Abonnement";

    const reminders = [
      { daysBefore: 7, title: `${typeLabel} - 7 jours restants`, body: `Votre ${typeLabel.toLowerCase()} TekaTeka expire dans 7 jours. Pensez a renouveler !` },
      { daysBefore: 3, title: `${typeLabel} - 3 jours restants`, body: `Plus que 3 jours ! Renouvelez votre ${typeLabel.toLowerCase()} pour continuer a gerer votre business.` },
      { daysBefore: 1, title: `${typeLabel} expire demain !`, body: `Attention ! Votre ${typeLabel.toLowerCase()} TekaTeka expire demain. Renouvelez maintenant.` },
      { daysBefore: 0, title: `${typeLabel} expire aujourd'hui !`, body: `Votre ${typeLabel.toLowerCase()} TekaTeka expire aujourd'hui. Renouvelez pour ne pas perdre l'acces.` },
    ];

    const scheduledIds: string[] = [];

    for (const reminder of reminders) {
      const triggerDate = new Date(expiry);
      triggerDate.setDate(triggerDate.getDate() - reminder.daysBefore);
      triggerDate.setHours(9, 0, 0, 0);

      if (triggerDate.getTime() > now.getTime()) {
        try {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: reminder.title,
              body: reminder.body,
              sound: true,
              data: { type: 'expiry_reminder', daysBefore: reminder.daysBefore },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes?.DATE || 'date',
              date: triggerDate,
            },
          });
          scheduledIds.push(id);
        } catch (e) {
          console.log('Failed to schedule notification:', e);
        }
      }
    }

    await AsyncStorage.setItem(NOTIFICATION_KEY, JSON.stringify(scheduledIds));
  } catch (e) {
    console.warn('[notificationService] scheduleExpiryReminders failed', e);
  }
}

export async function cancelAllReminders(): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(NOTIFICATION_KEY);
  } catch (e) {
    console.log('Failed to cancel notifications:', e);
  }
}

// Check if we should show in-app alert (once per day)
export async function shouldShowInAppAlert(): Promise<boolean> {
  try {
    const lastAlert = await AsyncStorage.getItem(LAST_ALERT_KEY);
    if (!lastAlert) return true;

    const lastDate = new Date(lastAlert);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);

    return hoursDiff >= 24; // Show once per day
  } catch {
    return true;
  }
}

export async function markAlertShown(): Promise<void> {
  await AsyncStorage.setItem(LAST_ALERT_KEY, new Date().toISOString());
}

// Send an immediate local notification (for stock alerts, etc.)
export async function sendInstantNotification(title: string, body: string, data?: Record<string, any>): Promise<void> {
  if (Platform.OS === 'web' || !Notifications) {
    console.log(`[NOTIFICATION] ${title}: ${body}`);
    return;
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: data || {},
      },
      trigger: null, // null = immediate
    });
  } catch (e) {
    console.log('Failed to send instant notification:', e);
  }
}

// Get urgency level based on days remaining
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
