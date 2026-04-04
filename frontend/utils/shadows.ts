import { Platform } from 'react-native';

/**
 * Cross-platform shadow styles
 * Uses boxShadow on web (no deprecation warning)
 * Uses shadow* props on native (iOS/Android)
 */
export const cardShadow = Platform.select({
  web: {
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.05)',
  },
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
}) as any;

export const cardShadowMedium = Platform.select({
  web: {
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
  },
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
}) as any;
