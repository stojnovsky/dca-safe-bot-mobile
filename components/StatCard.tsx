import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

interface Props {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}

export default function StatCard({ label, value, sub, positive }: Props) {
  const valueColor =
    positive === undefined ? colors.text : positive ? colors.success : colors.danger;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
