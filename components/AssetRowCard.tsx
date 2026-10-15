import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '@/lib/theme';

interface Props {
  asset: 'ETH' | 'BTC';
  holdings: number;
  avgPrice: number;
  valueUsd: number;
  pnlUsd: number;
  pnlPct: number;
  /** Share of total portfolio value in [0, 1]. Drives the progress bar. */
  share: number;
  /** Spot price, shown in the meta line. */
  spotPrice?: number;
  /** Drop the card chrome so the row can sit in a grouped list. */
  embedded?: boolean;
}

const META = {
  ETH: { glyph: 'Ξ', name: 'Ethereum',   bg: colors.ethBg, border: colors.ethBorder, fg: colors.eth, decimals: 4 },
  BTC: { glyph: '₿', name: 'Bitcoin',    bg: colors.btcBg, border: colors.btcBorder, fg: colors.btc, decimals: 6 },
};

function fmt(n: number, d: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function AssetRowCard({
  asset, holdings, avgPrice, valueUsd, pnlUsd, pnlPct, share, spotPrice, embedded,
}: Props) {
  const m = META[asset];
  const positive = pnlUsd >= 0;
  const clampedShare = Math.max(0, Math.min(1, share));

  return (
    <View style={[styles.card, embedded && styles.embedded]}>
      <View style={[styles.iconChip, { backgroundColor: m.bg, borderColor: m.border }]}>
        <Text style={[styles.iconTxt, { color: m.fg }]}>{m.glyph}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.name}>{m.name}</Text>
        <Text style={styles.meta}>
          {fmt(holdings, m.decimals)} {asset}
          {avgPrice > 0 ? ` · avg $${fmt(avgPrice, 0)}` : ''}
          {spotPrice && spotPrice > 0 ? ` · $${fmt(spotPrice, 0)}` : ''}
        </Text>
        <View style={styles.progressOuter}>
          <View
            style={[
              styles.progressInner,
              { width: `${clampedShare * 100}%`, backgroundColor: m.fg },
            ]}
          />
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.value}>${fmt(valueUsd, 2)}</Text>
        <Text style={[styles.pnl, positive ? styles.pnlPos : styles.pnlNeg]}>
          {positive ? '+' : ''}${fmt(Math.abs(pnlUsd), 2)} ({positive ? '+' : ''}{fmt(pnlPct, 1)}%)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 16,
  },
  embedded: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: { fontSize: 18, fontWeight: '700', fontFamily: fonts.sansBold },
  middle: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: fonts.sansSemi },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontFamily: fonts.sans },
  progressOuter: {
    height: 4,
    backgroundColor: colors.borderMuted,
    borderRadius: radii.pill,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressInner: {
    height: '100%',
    borderRadius: radii.pill,
  },
  right: { alignItems: 'flex-end' },
  value: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: fonts.monoMedium },
  pnl: { fontSize: 12, marginTop: 2, fontWeight: '500', fontFamily: fonts.sansSemi },
  pnlPos: { color: colors.success },
  pnlNeg: { color: colors.danger },
});
