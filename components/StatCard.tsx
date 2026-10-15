import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '@/lib/theme';

interface Props {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}

export default function StatCard({ label, value, sub, positive }: Props) {
  const valueColor =
    positive === undefined ? colors.text : positive ? colors.success : colors.danger;
  const subColor =
    positive === undefined ? colors.textMuted : positive ? colors.success : colors.danger;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={[styles.sub, { color: subColor }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
    paddingHorizontal: 16,
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.5,
    fontFamily: fonts.sans,
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    letterSpacing: -0.3,
    fontWeight: '700',
    fontFamily: fonts.monoMedium,
    fontVariant: ['tabular-nums'],
  },
  sub: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.sans,
    fontWeight: '500',
  },
});
