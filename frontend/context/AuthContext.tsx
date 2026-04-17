import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { changeLocale } from '../utils/i18n';
import { SubscriptionPlan } from '../types/subscription';
import { scheduleExpiryReminders, cancelAllReminders } from '../services/notificationService';
import { authAPI, getToken, clearToken } from '../services/apiService';

// Map backend user response to frontend User type
function mapBackendUser(data: any): User {
  const sub = data.subscription || {};
  return {
    id: data.id || '',
    phoneNumber: (data.phoneNumber || '').replace(/^\+/, ''),
    email: data.email || undefined,
    username: data.username || undefined,
    hasPassword: data.hasPassword || false,
    profilePhoto: data.profilePhoto || undefined,
    createdAt: data.createdAt || new Date().toISOString(),
    trialStartDate: data.createdAt || new Date().toISOString(),
    isSubscribed: sub.status === 'active' || (!!sub.plan && sub.plan !== null),
    subscriptionPlan: sub.plan || undefined,
    subscriptionStartDate: sub.startedAt || undefined,
    subscriptionEndDate: sub.expiresAt || undefined,
    currency: data.currency || 'USD',
    language: data.language || 'fr',
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  pinVerified: boolean;
  hasPin: boolean;
  login: (phoneNumber: string, otp: string) => Promise<void>;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  setupCredentials: (email?: string, username?: string, password?: string) => Promise<void>;
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
  subscribe: (plan: SubscriptionPlan) => Promise<void>;
  needsSubscription: () => boolean;
  showExpiryReminder: () => boolean;
  hasAccess: () => boolean;
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

  const loadUser = async () => {
    try {
      const token = await getToken();
      if (token) {
        // We have a saved token, try to fetch profile from backend
        try {
          const result = await authAPI.getProfile();
          if (result.user) {
            const mappedUser = mapBackendUser(result.user);
            setUser(mappedUser);
            await changeLocale(mappedUser.language);
            // Check PIN
            const savedPin = await AsyncStorage.getItem(`@tekateka:${mappedUser.id}:pin`);
            setHasPin(!!savedPin);
          }
        } catch (error) {
          console.log('Token expired or invalid, clearing');
          await clearToken();
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

  // Login via phone (called after OTP verification)
  const login = async (phoneNumber: string, _otp: string) => {
    try {
      // Call backend to create/login user in MongoDB and get JWT
      const result = await authAPI.phoneLogin(phoneNumber);
      if (result.user) {
        const mappedUser = mapBackendUser(result.user);
        setUser(mappedUser);
        await changeLocale(mappedUser.language);
        
        // Schedule trial expiry reminders for new users
        if (!mappedUser.isSubscribed) {
          const trialEnd = new Date(mappedUser.createdAt);
          trialEnd.setDate(trialEnd.getDate() + 7);
          scheduleExpiryReminders(trialEnd.toISOString(), true).catch(() => {});
        }
      }
    } catch (error: any) {
      console.error('Phone login error:', error);
      throw new Error(error.message || 'Erreur de connexion');
    }
  };

  // Login via email/username + password (for colleague)
  const loginWithCredentials = async (identifier: string, password: string) => {
    try {
      const result = await authAPI.credentialLogin(identifier, password);
      if (result.user) {
        const mappedUser = mapBackendUser(result.user);
        setUser(mappedUser);
        await changeLocale(mappedUser.language);
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

  // Trial: 7 days free
  const isTrialExpired = (): boolean => {
    if (!user) return false;
    if (user.isSubscribed) return false;
    
    const trialStart = new Date(user.trialStartDate);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysPassed > 7;
  };

  const getDaysRemaining = (): number => {
    if (!user) return 0;
    
    if (user.isSubscribed && user.subscriptionEndDate) {
      return getSubscriptionDaysRemaining();
    }
    
    const trialStart = new Date(user.trialStartDate);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
    
    return Math.max(0, 7 - daysPassed);
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

  const subscribe = async (plan: SubscriptionPlan) => {
    if (!user) return;

    try {
      const result = await authAPI.subscribe(plan);
      if (result.user) {
        const mappedUser = mapBackendUser(result.user);
        setUser(mappedUser);
        
        if (mappedUser.subscriptionEndDate) {
          scheduleExpiryReminders(mappedUser.subscriptionEndDate, false).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Subscribe error:', error);
      // Fallback: compute locally
      const now = new Date();
      const endDate = new Date();
      switch (plan) {
        case 'monthly': endDate.setMonth(now.getMonth() + 1); break;
        case 'quarterly': endDate.setMonth(now.getMonth() + 3); break;
        case 'yearly': endDate.setFullYear(now.getFullYear() + 1); break;
      }
      const updatedUser = {
        ...user,
        isSubscribed: true,
        subscriptionPlan: plan,
        subscriptionStartDate: now.toISOString(),
        subscriptionEndDate: endDate.toISOString(),
      };
      setUser(updatedUser);
      scheduleExpiryReminders(endDate.toISOString(), false).catch(() => {});
    }
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

  const hasAccess = (): boolean => {
    if (!user) return false;
    if (isSubscriptionActive()) return true;
    return !isTrialExpired();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pinVerified,
        hasPin,
        login,
        loginWithCredentials,
        setupCredentials,
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
        subscribe,
        needsSubscription,
        showExpiryReminder,
        hasAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
