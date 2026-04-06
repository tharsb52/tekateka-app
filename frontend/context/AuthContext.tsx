import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { getUser, saveUser, clearUser } from '../utils/storage';
import { changeLocale } from '../utils/i18n';
import { SubscriptionPlan } from '../types/subscription';
import { scheduleExpiryReminders, cancelAllReminders } from '../services/notificationService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  pinVerified: boolean;
  hasPin: boolean;
  login: (phoneNumber: string, otp: string) => Promise<void>;
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
      const savedUser = await getUser();
      if (savedUser) {
        setUser(savedUser);
        await changeLocale(savedUser.language);
        // Check if this user has a PIN configured
        const savedPin = await AsyncStorage.getItem(`@tekateka:${savedUser.id}:pin`);
        setHasPin(!!savedPin);
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

  const login = async (phoneNumber: string, otp: string) => {
    console.log(`Mock OTP Verification: ${phoneNumber} - ${otp}`);
    
    if (otp.length !== 4) {
      throw new Error('Invalid OTP');
    }

    // Check if this user already has a saved profile
    const { getUser: getStoredUser, saveUser: saveStoredUser } = await import('../utils/storage');
    
    // Temporarily set active user to check for existing profile
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('@tekateka:active_user', phoneNumber);
    
    const existingUser = await getStoredUser();
    
    if (existingUser && existingUser.id === phoneNumber) {
      // Existing user - restore their profile
      console.log('Existing user found, restoring profile');
      setUser(existingUser);
      if (existingUser.language) await changeLocale(existingUser.language);
    } else {
      // New user - create fresh profile with EMPTY data
      const newUser: User = {
        id: phoneNumber,
        phoneNumber,
        createdAt: new Date().toISOString(),
        trialStartDate: new Date().toISOString(),
        isSubscribed: false,
        currency: 'USD',
        language: 'fr',
      };

      await saveStoredUser(newUser);
      console.log('New user created with empty data');
      
      // Schedule trial expiry reminders
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);
      scheduleExpiryReminders(trialEnd.toISOString(), true).catch(() => {});
      
      setUser(newUser);
    }
  };

  const logout = async () => {
    await cancelAllReminders();
    await clearUser();
    setUser(null);
    setPinVerified(false);
    setHasPin(false);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = { ...user, ...updates };
    await saveUser(updatedUser);
    setUser(updatedUser);
    
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
    
    // If subscribed, show subscription days
    if (user.isSubscribed && user.subscriptionEndDate) {
      return getSubscriptionDaysRemaining();
    }
    
    // Otherwise show trial days
    const trialStart = new Date(user.trialStartDate);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
    
    return Math.max(0, 7 - daysPassed);
  };

  // Subscription logic
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

  // Subscribe to a plan
  const subscribe = async (plan: SubscriptionPlan) => {
    if (!user) return;

    const now = new Date();
    const endDate = new Date();
    
    switch (plan) {
      case 'monthly':
        endDate.setMonth(now.getMonth() + 1);
        break;
      case 'quarterly':
        endDate.setMonth(now.getMonth() + 3);
        break;
      case 'yearly':
        endDate.setFullYear(now.getFullYear() + 1);
        break;
    }

    await updateUser({
      isSubscribed: true,
      subscriptionPlan: plan,
      subscriptionStartDate: now.toISOString(),
      subscriptionEndDate: endDate.toISOString(),
    });

    // Schedule subscription expiry reminders
    scheduleExpiryReminders(endDate.toISOString(), false).catch(() => {});
  };

  // Check if user needs to subscribe (trial expired + no active subscription)
  const needsSubscription = (): boolean => {
    if (!user) return false;
    if (isSubscriptionActive()) return false;
    return isTrialExpired();
  };

  // Show expiry reminder: 14 days before subscription ends
  const showExpiryReminder = (): boolean => {
    if (!user || !user.isSubscribed || !user.subscriptionEndDate) return false;
    
    const daysRemaining = getSubscriptionDaysRemaining();
    return daysRemaining > 0 && daysRemaining <= 14;
  };

  // Has access: trial active OR subscription active
  const hasAccess = (): boolean => {
    if (!user) return false;
    if (isSubscriptionActive()) return true;
    return !isTrialExpired(); // Trial still valid
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        pinVerified,
        hasPin,
        login,
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
