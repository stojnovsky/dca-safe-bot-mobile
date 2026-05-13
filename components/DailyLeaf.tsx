import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import type { CryptoPosition } from '@/lib/types';
import LeafSvg from '@/assets/leaf.svg';

/** Width matches Daily Coin grid column; height preserves Inkscape aspect ratio (208.57 × 220). */
export const LEAF_WIDTH  = 76;
export const LEAF_HEIGHT = Math.round((LEAF_WIDTH * 220) / 208.57);

interface Variant {
  text:        string;
  asset:       string;
  pnlPositive: string;
  pnlNegative: string;
  /** Optional wash over the artwork (healthy vs wilting vs rotten). */
  tint?:       string;
  tintOpacity?: number;
}

const HEALTHY: Variant = {
  text:        '#052e16',
  asset:       '#14532d',
  pnlPositive: '#052e16',
  pnlNegative: '#7f1d1d',
  tint:        'rgba(22, 163, 74, 0.35)',
  tintOpacity: 1,
};

const LIVE_HEALTHY: Variant = {
  text:        '#052e16',
  asset:       '#14532d',
  pnlPositive: '#052e16',
  pnlNegative: '#7f1d1d',
  tint:        'rgba(190, 242, 100, 0.45)',
  tintOpacity: 1,
};

const WILTING: Variant = {
  text:        '#422006',
  asset:       '#854d0e',
  pnlPositive: '#052e16',
  pnlNegative: '#7f1d1d',
  tint:        'rgba(250, 204, 21, 0.5)',
  tintOpacity: 1,
};

const ROTTEN: Variant = {
  text:        '#fde68a',
  asset:       '#fef3c7',
  pnlPositive: '#bbf7d0',
  pnlNegative: '#fecaca',
  tint:        'rgba(69, 26, 3, 0.65)',
  tintOpacity: 1,
};

function pickVariant(p: CryptoPosition): Variant {
  const isOpen = p.status === 'OPEN';
  const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
  if (isOpen) return pnl >= 0 ? LIVE_HEALTHY : WILTING;
  if (p.closeReason === 'stop_loss') return ROTTEN;
  return pnl >= 0 ? HEALTHY : ROTTEN;
}

function formatValue(v: number): string {
  if (v < 10)     return v.toFixed(2);
  if (v < 100)    return v.toFixed(1);
  if (v < 1000)   return v.toFixed(0);
  if (v < 10_000) return (v / 1000).toFixed(1) + 'k';
  return Math.round(v / 1000) + 'k';
}

function formatPnl(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  const abs  = Math.abs(pct);
  if (abs < 10)  return sign + pct.toFixed(1) + '%';
  return sign + Math.round(pct) + '%';
}

interface Props {
  position: CryptoPosition;
  onPress?: (p: CryptoPosition) => void;
  style?:   ViewStyle;
}

/**
 * Renders `assets/leaf.svg` with a gamification tint (green / lime / yellow / brown)
 * driven by position status and P&L. Dollar value stays centered on the leaf art.
 */
export default function DailyLeaf({ position, onPress, style }: Props) {
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
      <View style={[styles.leafContainer, { width: LEAF_WIDTH, height: LEAF_HEIGHT }]}>
        <LeafSvg width={LEAF_WIDTH} height={LEAF_HEIGHT} />

        {v.tint != null && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: v.tint, opacity: v.tintOpacity ?? 1 },
            ]}
          />
        )}

        <View style={styles.content} pointerEvents="none">
          <Text style={[styles.asset, { color: v.asset }]}>{glyph}</Text>
          <Text style={[styles.value, { color: v.text }]}>${formatValue(value)}</Text>
          <Text style={[styles.pnl, { color: pnlPos ? v.pnlPositive : v.pnlNegative }]}>
            {formatPnl(pnlPct)}
          </Text>
        </View>

        {isOpen && (
          <View
            pointerEvents="none"
            style={[styles.openDot, { backgroundColor: pnlPos ? '#16a34a' : '#dc2626' }]}
          />
        )}
      </View>

      <Text style={styles.date}>{position.buyDate.slice(5)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width:      LEAF_WIDTH + 6,
  },
  leafContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    paddingBottom:  8,
  },
  asset: { fontSize: 10, fontWeight: '800', opacity: 0.92, marginBottom: -1 },
  value: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
  pnl: {
    fontSize:  9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
  date: { fontSize: 10, color: '#6b7280', marginTop: 4, fontVariant: ['tabular-nums'] },
  openDot: {
    position:    'absolute',
    top:         6,
    right:       10,
    width:       6,
    height:      6,
    borderRadius: 3,
  },
});
