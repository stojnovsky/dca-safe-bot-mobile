import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import type { CryptoPosition } from '@/lib/types';

export const COIN_SIZE = 72;

interface Variant {
  face:       string; // main coin colour
  rim:        string; // outer ring / border
  shine:      string; // top-left highlight
  text:       string; // primary text inside
  asset:      string; // asset glyph tint
  pnlPositive:string;
  pnlNegative:string;
}

const GOLD_PROFIT: Variant = {
  face:        '#fbbf24',
  rim:         '#78350f',
  shine:       '#fef3c7',
  text:        '#422006',
  asset:       '#78350f',
  pnlPositive: '#14532d',
  pnlNegative: '#7f1d1d',
};

const GOLD_LOSS: Variant = {
  face:        '#a16207',
  rim:         '#451a03',
  shine:       '#ca8a04',
  text:        '#1c0a01',
  asset:       '#451a03',
  pnlPositive: '#14532d',
  pnlNegative: '#7f1d1d',
};

const LIVE_PROFIT: Variant = {
  face:        '#bbf7d0',
  rim:         '#166534',
  shine:       '#dcfce7',
  text:        '#064e3b',
  asset:       '#14532d',
  pnlPositive: '#14532d',
  pnlNegative: '#7f1d1d',
};

const LIVE_LOSS: Variant = {
  face:        '#fecaca',
  rim:         '#991b1b',
  shine:       '#fee2e2',
  text:        '#7f1d1d',
  asset:       '#7f1d1d',
  pnlPositive: '#14532d',
  pnlNegative: '#7f1d1d',
};

function pickVariant(p: CryptoPosition): Variant {
  const isOpen = p.status === 'OPEN';
  const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
  if (isOpen) return pnl >= 0 ? LIVE_PROFIT : LIVE_LOSS;
  return pnl >= 0 ? GOLD_PROFIT : GOLD_LOSS;
}

function formatValue(v: number): string {
  if (v < 10)    return v.toFixed(2);
  if (v < 100)   return v.toFixed(1);
  if (v < 1000)  return v.toFixed(0);
  if (v < 10_000) return (v / 1000).toFixed(1) + 'k';
  return Math.round(v / 1000) + 'k';
}

function formatPnl(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  const abs  = Math.abs(pct);
  if (abs < 10)   return sign + pct.toFixed(1) + '%';
  if (abs < 100)  return sign + Math.round(pct) + '%';
  return sign + Math.round(pct) + '%';
}

interface Props {
  position: CryptoPosition;
  onPress?: (p: CryptoPosition) => void;
  style?:   ViewStyle;
}

/**
 * Game-y "Daily Coin" representation of a CryptoPosition. The face value
 * displayed in the center is the position's **current dollar value** —
 * `finalValue` for OPEN positions or `usdcReceived` for CLOSED ones.
 */
export default function DailyCoin({ position, onPress, style }: Props) {
  const v       = pickVariant(position);
  const isOpen  = position.status === 'OPEN';
  const value   = isOpen ? (position.finalValue   ?? position.assetAmount * (position.buyPrice ?? 0))
                         : (position.usdcReceived ?? 0);
  const pnlPct  = isOpen ? (position.unrealizedPnlPct ?? 0) : (position.profitPct ?? 0);
  const pnlPos  = pnlPct >= 0;
  const glyph   = position.asset === 'ETH' ? 'Ξ' : '₿';

  return (
    <TouchableOpacity
      onPress={() => onPress?.(position)}
      activeOpacity={0.7}
      style={[styles.wrap, style]}
    >
      <View style={[styles.coin, { backgroundColor: v.face, borderColor: v.rim }]}>
        {/* Top-left specular highlight gives a metallic 3D feel without SVG */}
        <View style={[styles.shineTop, { backgroundColor: v.shine }]} />
        <View style={[styles.shineSide, { backgroundColor: v.shine }]} />
        {/* Embossed inner ring */}
        <View style={[styles.innerRing, { borderColor: v.rim }]} />

        <Text style={[styles.asset, { color: v.asset }]}>{glyph}</Text>
        <Text style={[styles.value, { color: v.text  }]}>${formatValue(value)}</Text>
        <Text style={[styles.pnl,   { color: pnlPos ? v.pnlPositive : v.pnlNegative }]}>
          {formatPnl(pnlPct)}
        </Text>

        {/* Open-status indicator (small pulsing-style dot in the corner) */}
        {isOpen && <View style={[styles.openDot, { backgroundColor: pnlPos ? '#16a34a' : '#dc2626' }]} />}
      </View>

      <Text style={styles.date}>{position.buyDate.slice(5)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width:      COIN_SIZE + 8,
  },
  coin: {
    width:           COIN_SIZE,
    height:          COIN_SIZE,
    borderRadius:    COIN_SIZE / 2,
    borderWidth:     2,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
    position:        'relative',
  },
  innerRing: {
    position:     'absolute',
    top:           4,
    left:          4,
    right:         4,
    bottom:        4,
    borderRadius: (COIN_SIZE - 8) / 2,
    borderWidth:   1,
    opacity:       0.35,
  },
  shineTop: {
    position:     'absolute',
    top:          5,
    left:         10,
    width:        22,
    height:       8,
    borderRadius: 6,
    opacity:      0.55,
    transform:    [{ rotate: '-20deg' }],
  },
  shineSide: {
    position:     'absolute',
    top:          12,
    left:         8,
    width:        4,
    height:       14,
    borderRadius: 2,
    opacity:      0.4,
  },
  asset:  { fontSize: 11, fontWeight: '800', marginTop: -2, marginBottom: -2, letterSpacing: 0.2 },
  value:  { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.3 },
  pnl:    { fontSize:  9, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 1 },
  date:   { fontSize: 10, color: '#6b7280', marginTop: 4, fontVariant: ['tabular-nums'] },
  openDot: {
    position:     'absolute',
    top:           6,
    right:         8,
    width:         6,
    height:        6,
    borderRadius:  3,
  },
});
