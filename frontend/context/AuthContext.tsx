import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { getUser, saveUser, clearUser } from '../utils/storage';
import { changeLocale } from '../utils/i18n';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phoneNumber: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  isTrialExpired: () => boolean;
  getDaysRemaining: () => number;
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

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const savedUser = await getUser();
      if (savedUser) {
        setUser(savedUser);
        await changeLocale(savedUser.language);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (phoneNumber: string, otp: string) => {
    // Mock OTP verification - in production, verify with backend
    console.log(`Mock OTP Verification: ${phoneNumber} - ${otp}`);
    
    // For MVP, accept any 4-digit OTP
    if (otp.length !== 4) {
      throw new Error('Invalid OTP');
    }

    // Create or load user
    const newUser: User = {
      id: phoneNumber,
      phoneNumber,
      createdAt: new Date().toISOString(),
      trialStartDate: new Date().toISOString(),
      isSubscribed: false,
      currency: 'USD', // Dollar Américain par défaut
      language: 'fr',
    };

    await saveUser(newUser);
    
    // Initialize sample data for new users
    const { initializeSampleData } = await import('../utils/sampleData');
    await initializeSampleData(phoneNumber);
    console.log('✅ Sample data initialized for demo');
    
    setUser(newUser);
  };

  const logout = async () => {
    await clearUser();
    setUser(null);
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

  const isTrialExpired = (): boolean => {
    if (!user || user.isSubscribed) return false;
    
    const trialStart = new Date(user.trialStartDate);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
    
    return daysPassed > 7;
  };

  const getDaysRemaining = (): number => {
    if (!user || user.isSubscribed) return 0;
    
    const trialStart = new Date(user.trialStartDate);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
    
    return Math.max(0, 7 - daysPassed);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        updateUser,
        isTrialExpired,
        getDaysRemaining,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
