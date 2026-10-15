import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, fonts, type } from '@/lib/theme';

interface Props {
  title: string;
  brand?: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: ViewStyle;
  /** Home tabs that lead with a balance: brand mark and action only. */
  compact?: boolean;
}

/** Tab header: lime brand mark + large page title */
export default function ScreenHeader({ title, brand = 'MeditFin', subtitle, right, style, compact }: Props) {
  if (compact) {
    return (
      <View style={[styles.bar, style]}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={type.brandLabel}>{brand}</Text>
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.textCol}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={type.brandLabel}>{brand}</Text>
        </View>
        <Text style={type.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 4,
    marginBottom: 12,
    minHeight: 36,
  },
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 2,
    marginBottom: 8,
    marginTop: 6,
  },
  textCol: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  right: { marginLeft: 8, marginTop: 10 },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    fontFamily: fonts.mono,
  },
});
