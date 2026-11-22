import React, { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Text } from './AppText';

export const PAGE_SIZE = 20;

/** Show lists 20 items at a time: light on memory for 2 GB phones. */
export function usePaged<T>(items: T[], resetKey?: unknown) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [resetKey]);
  return {
    visible: items.slice(0, limit),
    hasMore: items.length > limit,
    remaining: Math.max(0, items.length - limit),
    showMore: () => setLimit((l) => l + PAGE_SIZE),
  };
}

/** Same for day groups: shows groups until PAGE_SIZE items are visible. */
export function usePagedGroups<G extends { sales: any[] }>(groups: G[]) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const visible: G[] = [];
  let count = 0;
  for (const g of groups) {
    if (count >= limit) break;
    const take = g.sales.slice(0, limit - count);
    visible.push({ ...g, sales: take });
    count += take.length;
  }
  const total = groups.reduce((s, g) => s + g.sales.length, 0);
  return {
    visible,
    hasMore: total > limit,
    remaining: Math.max(0, total - limit),
    showMore: () => setLimit((l) => l + PAGE_SIZE),
  };
}

export function ShowMore({ remaining, onPress, testID }: { remaining: number; onPress: () => void; testID?: string }) {
  if (remaining <= 0) return null;
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} testID={testID || 'show-more'} activeOpacity={0.7}>
      <Ionicons name="chevron-down" size={18} color="#2563eb" />
      <Text style={styles.text}>{`Afficher plus (${remaining} restants)`}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  text: { color: '#2563eb', fontWeight: '700', fontSize: 14 },
});
