import { I18n } from 'i18n-js';
import { translations } from '../i18n/translations';
import AsyncStorage from '@react-native-async-storage/async-storage';

const i18n = new I18n(translations);
i18n.defaultLocale = 'fr';
i18n.locale = 'fr';
i18n.enableFallback = true;

export const loadLocale = async () => {
  try {
    const savedLocale = await AsyncStorage.getItem('locale');
    if (savedLocale) {
      i18n.locale = savedLocale;
    }
  } catch (error) {
    console.error('Error loading locale:', error);
  }
};

export const changeLocale = async (locale: string) => {
  try {
    i18n.locale = locale;
    await AsyncStorage.setItem('locale', locale);
  } catch (error) {
    console.error('Error saving locale:', error);
  }
};

export default i18n;
