import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import type { CryptoPosition } from '@/lib/types';
import { coinColors, colors, fonts } from '@/lib/theme';

export const COIN_SIZE = 72;

interface Variant {
  face: string;
  rim: string;
  shine: string;
  text: string;
  asset: string;
  pnlPositive: string;
  pnlNegative: string;
}

const GOLD_PROFIT: Variant = {
  face: coinColors.gold.face,
  rim: coinColors.gold.rim,
  shine: '#fef3c7',
  text: coinColors.gold.text,
  asset: coinColors.gold.rim,
  pnlPositive: coinColors.liveUp.text,
  pnlNegative: coinColors.liveDown.text,
};

const GOLD_LOSS: Variant = {
  face: coinColors.bronze.face,
  rim: coinColors.bronze.rim,
  shine: '#f0c878',
  text: coinColors.bronze.text,
  asset: coinColors.bronze.rim,
  pnlPositive: coinColors.liveUp.text,
  pnlNegative: coinColors.liveDown.text,
};

const LIVE_PROFIT: Variant = {
  face: coinColors.liveUp.face,
  rim: coinColors.liveUp.rim,
  shine: '#dcfce7',
  text: coinColors.liveUp.text,
  asset: coinColors.liveUp.text,
  pnlPositive: coinColors.liveUp.text,
  pnlNegative: coinColors.liveDown.text,
};

const LIVE_LOSS: Variant = {
  face: coinColors.liveDown.face,
  rim: coinColors.liveDown.rim,
  shine: '#fee2e2',
  text: coinColors.liveDown.text,
  asset: coinColors.liveDown.text,
  pnlPositive: coinColors.liveUp.text,
  pnlNegative: coinColors.liveDown.text,
};

function pickVariant(p: CryptoPosition): Variant {
  const isOpen = p.status === 'OPEN';
  const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
  if (isOpen) return pnl >= 0 ? LIVE_PROFIT : LIVE_LOSS;
  return pnl >= 0 ? GOLD_PROFIT : GOLD_LOSS;
}

interface Props {
  position: CryptoPosition;
  onPress?: (p: CryptoPosition) => void;
  slotWidth?: number;
  style?: ViewStyle;
}

export default function DailyCoin({ position: p, onPress, slotWidth, style }: Props) {
  const v      = pickVariant(p);
  const isOpen = p.status === 'OPEN';
  const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
  const pnlPos = pnl >= 0;
  const size   = COIN_SIZE;

  const body = (
    <View style={[styles.slot, slotWidth != null && { width: slotWidth }, style]}>
      <View style={[styles.coin, { width: size, height: size, backgroundColor: v.face, borderColor: v.rim }]}>
        <View style={[styles.shine, { backgroundColor: v.shine }]} />
        <Text style={[styles.asset, { color: v.asset }]}>{p.asset === 'ETH' ? 'Ξ' : '₿'}</Text>
        <Text style={[styles.pnl, { color: pnlPos ? v.pnlPositive : v.pnlNegative }]}>
          {pnlPos ? '+' : ''}{pnl.toFixed(1)}%
        </Text>
        {isOpen && (
          <View style={[styles.openDot, { backgroundColor: pnlPos ? colors.success : colors.danger }]} />
        )}
      </View>
      <Text style={styles.date}>{p.buyDate}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={() => onPress(p)}>
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', marginBottom: 4 },
  coin: {
    borderRadius: 999,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.45,
  },
  asset: { fontSize: 22, fontWeight: '700', fontFamily: fonts.sansBold },
  pnl:   { fontSize: 11, fontWeight: '700', marginTop: 2, fontFamily: fonts.monoMedium },
  openDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.bg,
  },
  date: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    fontFamily: fonts.mono,
    fontVariant: ['tabular-nums'],
  },
});
