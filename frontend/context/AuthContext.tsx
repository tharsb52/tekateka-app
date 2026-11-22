import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { changeLocale } from '../utils/i18n';
import { scheduleExpiryReminders, cancelAllReminders } from '../services/notificationService';
import { authAPI, getToken, clearToken, setReadOnlyMode } from '../services/apiService';
import { isOfflineError } from '../services/offlineSync';

/** User id ("sub") inside the JWT, to check the offline profile matches. */
function tokenUserId(token: string): string | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))).sub || null;
  } catch {
    return null;
  }
}

// Map backend user response to frontend User type.
// Access rules mirror backend/subscription_guard.py.
export const GRACE_PERIOD_HOURS = 48;
const TRIAL_DAYS = 7;

function mapBackendUser(data: any): User {
  const sub = data.subscription || {};
  const createdAt = data.createdAt || new Date().toISOString();
  const expiry = sub.expiresAt || sub.expiryDate || undefined;
  const trialEnd =
    sub.trialEndsAt ||
    (sub.status === 'trial' ? expiry : undefined) ||
    new Date(new Date(createdAt).getTime() + TRIAL_DAYS * 86400000).toISOString();
  return {
    id: data.id || '',
    phoneNumber: (data.phoneNumber || '').replace(/^\+/, ''),
    email: data.email || undefined,
    username: data.username || undefined,
    hasPassword: data.hasPassword || false,
    profilePhoto: data.profilePhoto || undefined,
    createdAt,
    trialStartDate: createdAt,
    trialEndDate: trialEnd,
    isSubscribed: sub.status === 'active' && !!sub.plan && sub.plan !== 'trial',
    subscriptionPlan: sub.plan || undefined,
    subscriptionStartDate: sub.startedAt || sub.startDate || undefined,
    subscriptionEndDate: expiry,
    currency: data.currency || 'USD',
    language: data.language || 'fr',
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  pinVerified: boolean;
  hasPin: boolean;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  setupCredentials: (email?: string, username?: string, password?: string) => Promise<void>;
  // === NEW June 2026 — Email + PIN auth ===
  signupWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  loginWithPin: (identifier: string, pin: string) => Promise<void>;
  setupServerPin: (pin: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<any>;
  updateProfilePhoto: (photoBase64: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  setPinVerified: (v: boolean) => void;
  checkHasPin: () => Promise<boolean>;
  removePin: () => Promise<void>;
  isTrialExpired: () => boolean;
  getDaysRemaining: () => number;
  isSubscriptionActive: () => boolean;
  getSubscriptionDaysRemaining: () => number;
  needsSubscription: () => boolean;
  showExpiryReminder: () => boolean;
  hasAccess: () => boolean;
  getGraceHoursRemaining: () => number;
  isReadOnly: () => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [hasPin, setHasPin] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  // Re-check PIN existence whenever user changes
  useEffect(() => {
    if (user) {
      checkHasPin();
    } else {
      setHasPin(false);
      setPinVerified(false);
    }
  }, [user?.id]);

  // Profile kept on the phone so the app opens even without network
  useEffect(() => {
    if (user) AsyncStorage.setItem('@tekateka:offlineUser', JSON.stringify(user)).catch(() => {});
  }, [user]);

  const loadUser = async () => {
    try {
      const token = await getToken();
      if (token) {
        // Silently refresh the JWT so the user effectively stays signed
        // in forever as long as they open the app once a year — this
        // is what lets us avoid burning Firebase SMS quota on every
        // app launch. If the token is too old, refreshToken throws and
        // we fall back to the login screen.
        try {
          const result = await authAPI.refreshToken();
          if (result?.user) {
            const mappedUser = mapBackendUser(result.user);
            setUser(mappedUser);
            await changeLocale(mappedUser.language);
            const savedPin = await AsyncStorage.getItem(`@tekateka:${mappedUser.id}:pin`);
            setHasPin(!!savedPin);
          }
        } catch (error: any) {
          if (isOfflineError(error)) {
            // No network: restore the last known profile, keep the token
            const raw = await AsyncStorage.getItem('@tekateka:offlineUser');
            const saved: User | null = raw ? JSON.parse(raw) : null;
            if (saved && tokenUserId(token) === saved.id) {
              const mappedUser = saved;
              setUser(mappedUser);
              await changeLocale(mappedUser.language);
              const savedPin = await AsyncStorage.getItem(`@tekateka:${mappedUser.id}:pin`);
              setHasPin(!!savedPin);
            }
          } else {
            console.log('Token expired or invalid, clearing');
            await clearToken();
          }
        }
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkHasPin = async (): Promise<boolean> => {
    if (!user) return false;
    const savedPin = await AsyncStorage.getItem(`@tekateka:${user.id}:pin`);
    const result = !!savedPin;
    setHasPin(result);
    return result;
  };

  const removePin = async () => {
    if (!user) return;
    await AsyncStorage.removeItem(`@tekateka:${user.id}:pin`);
    setHasPin(false);
    setPinVerified(true);
  };


  // Remember the last account on this device so the login screen can offer
  // "PIN only" next time.
  const rememberAccount = async (u: User) => {
    try {
      if (u.email) await AsyncStorage.setItem('@tekateka:lastEmail', u.email);
      await AsyncStorage.setItem('@tekateka:lastUserId', u.id);
      await AsyncStorage.setItem('@tekateka:lastUserName', u.name || '');
    } catch {}
  };

  // Login via email/username + password (for colleague)
  const loginWithCredentials = async (identifier: string, password: string) => {
    try {
      const result = await authAPI.credentialLogin(identifier, password);
      if (result.user) {
        const mappedUser = mapBackendUser(result.user);
        setUser(mappedUser);
        await changeLocale(mappedUser.language);
        await rememberAccount(mappedUser);
      }
    } catch (error: any) {
      console.error('Credential login error:', error);
      throw new Error(error.message || 'Identifiants incorrects');
    }
  };

  // Setup email/username + password for colleague access
  const setupCredentials = async (email?: string, username?: string, password?: string) => {
    try {
      const result = await authAPI.setupCredentials(email, username, password);
      if (result.user) {
        const mappedUser = mapBackendUser(result.user);
        setUser(mappedUser);
      }
    } catch (error: any) {
      console.error('Setup credentials error:', error);
      throw new Error(error.message || 'Erreur de configuration');
    }
  };

  // === NEW June 2026 — Email + PIN authentication helpers ===
  // These wrap the new authAPI endpoints AND update the AuthContext state so
  // the rest of the app reacts to the new user immediately.

  const signupWithEmail = async (email: string, password: string, name?: string) => {
    try {
      const result = await authAPI.emailSignup(email, password, name);
      if (result.user) {
        const mapped = mapBackendUser(result.user);
        setUser(mapped);
        await changeLocale(mapped.language);
        await rememberAccount(mapped);
      }
    } catch (e: any) {
      console.error('Email signup error:', e);
      throw new Error(e.message || "Échec de l'inscription");
    }
  };

  const loginWithPin = async (identifier: string, pin: string) => {
    try {
      const result = await authAPI.loginPin(identifier, pin);
      if (result.user) {
        const mapped = mapBackendUser(result.user);
        // PIN already proven on the server → keep the local lock in sync
        // and skip the extra PIN screen.
        await AsyncStorage.setItem(`@tekateka:${mapped.id}:pin`, pin);
        setHasPin(true);
        setPinVerified(true);
        setUser(mapped);
        await changeLocale(mapped.language);
        await rememberAccount(mapped);
      }
    } catch (e: any) {
      console.error('PIN login error:', e);
      throw new Error(e.message || 'Identifiant ou PIN incorrect');
    }
  };

  const setupServerPin = async (pin: string) => {
    try {
      const result = await authAPI.setupPin(pin);
      if (result.user) {
        const mapped = mapBackendUser(result.user);
        setUser(mapped);
      }
      setHasPin(true);
      setPinVerified(true);
    } catch (e: any) {
      console.error('Setup PIN error:', e);
      throw new Error(e.message || 'Erreur lors de la création du PIN');
    }
  };

  const forgotPassword = async (email: string) => {
    return authAPI.forgotPassword(email);
  };

  const resetPassword = async (email: string, code: string, newPassword: string) => {
    return authAPI.resetPassword(email, code, newPassword);
  };

  // Update profile photo
  const updateProfilePhoto = async (photoBase64: string) => {
    try {
      const result = await authAPI.updateProfilePhoto(photoBase64);
      if (result.user) {
        const mappedUser = mapBackendUser(result.user);
        setUser(mappedUser);
      }
    } catch (error: any) {
      console.error('Update profile photo error:', error);
      throw new Error(error.message || 'Erreur lors du téléversement');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('@tekateka:offlineUser').catch(() => {});
    await cancelAllReminders();
    await authAPI.logout();
    setUser(null);
    setPinVerified(false);
    setHasPin(false);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    
    // Map frontend fields to backend-accepted fields
    const backendUpdates: Record<string, any> = {};
    if (updates.currency) backendUpdates.currency = updates.currency;
    if (updates.language) backendUpdates.language = updates.language;
    if (updates.email) backendUpdates.email = updates.email;
    if (updates.username) backendUpdates.username = updates.username;
    
    try {
      if (Object.keys(backendUpdates).length > 0) {
        const result = await authAPI.updateProfile(backendUpdates);
        if (result.user) {
          const mappedUser = mapBackendUser(result.user);
          setUser(mappedUser);
        }
      }
    } catch (error) {
      console.error('Update user error:', error);
      // Still update locally as fallback for non-critical fields
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
    }
    
    if (updates.language) {
      await changeLocale(updates.language);
    }
  };

  // Trial: 7 days free (no grace period)
  const isTrialExpired = (): boolean => {
    if (!user) return false;
    if (user.isSubscribed) return false;
    return new Date() >= new Date(user.trialEndDate);
  };

  const getDaysRemaining = (): number => {
    if (!user) return 0;
    
    if (user.isSubscribed && user.subscriptionEndDate) {
      return getSubscriptionDaysRemaining();
    }
    
    const diff = new Date(user.trialEndDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const isSubscriptionActive = (): boolean => {
    if (!user) return false;
    if (!user.isSubscribed) return false;
    if (!user.subscriptionEndDate) return false;
    
    const endDate = new Date(user.subscriptionEndDate);
    const now = new Date();
    return now < endDate;
  };

  const getSubscriptionDaysRemaining = (): number => {
    if (!user || !user.subscriptionEndDate) return 0;
    
    const endDate = new Date(user.subscriptionEndDate);
    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const needsSubscription = (): boolean => {
    if (!user) return false;
    if (isSubscriptionActive()) return false;
    return isTrialExpired();
  };

  const showExpiryReminder = (): boolean => {
    if (!user || !user.isSubscribed || !user.subscriptionEndDate) return false;
    const daysRemaining = getSubscriptionDaysRemaining();
    return daysRemaining > 0 && daysRemaining <= 14;
  };

  // Paid plan expired less than 48h ago → hours left before read-only mode
  const getGraceHoursRemaining = (): number => {
    if (!user || !user.isSubscribed || !user.subscriptionEndDate) return 0;
    const end = new Date(user.subscriptionEndDate).getTime();
    const now = Date.now();
    if (now < end) return 0;
    const left = end + GRACE_PERIOD_HOURS * 3600000 - now;
    return left > 0 ? Math.ceil(left / 3600000) : 0;
  };

  const hasAccess = (): boolean => {
    if (!user) return false;
    if (isSubscriptionActive()) return true;
    if (getGraceHoursRemaining() > 0) return true;
    if (user.isSubscribed) return false;
    return !isTrialExpired();
  };

  // Logged in but no access → can only consult data
  const isReadOnly = (): boolean => !!user && !hasAccess();

  useEffect(() => {
    setReadOnlyMode(isReadOnly());
  }, [user]);

  /**
   * Pull the latest user document from the backend and update the local
   * AuthContext state. Used after any action that changes subscription
   * status (activation code, Stripe checkout, ambassador stacking…) so the
   * UI reflects the new expiry date IMMEDIATELY without requiring an app
   * restart. Safe to call from anywhere — silently fails if offline.
   */
  const refreshUser = async (): Promise<void> => {
    try {
      const data = await authAPI.getProfile();
      if (data?.user) {
        const mappedUser = mapBackendUser(data.user);
        setUser(mappedUser);
        if (mappedUser.isSubscribed && mappedUser.subscriptionEndDate) {
          scheduleExpiryReminders(mappedUser.subscriptionEndDate, false).catch(() => {});
        }
      } else if (data?.id) {
        // Some endpoints return the user directly (no wrapper).
        const mappedUser = mapBackendUser(data);
        setUser(mappedUser);
      }
    } catch (e) {
      console.warn('refreshUser failed (non-blocking):', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pinVerified,
        hasPin,
        loginWithCredentials,
        setupCredentials,
        signupWithEmail,
        loginWithPin,
        setupServerPin,
        forgotPassword,
        resetPassword,
        updateProfilePhoto,
        logout,
        updateUser,
        setPinVerified,
        checkHasPin,
        removePin,
        isTrialExpired,
        getDaysRemaining,
        isSubscriptionActive,
        getSubscriptionDaysRemaining,
        needsSubscription,
        showExpiryReminder,
        hasAccess,
        getGraceHoursRemaining,
        isReadOnly,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
