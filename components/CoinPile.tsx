import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CryptoPosition } from '@/lib/types';

/** Disc colours aligned with `DailyCoin` win/loss + open/closed semantics. */
function discPalette(p: CryptoPosition): { face: string; rim: string } {
  const isOpen = p.status === 'OPEN';
  const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
  if (isOpen) {
    return pnl >= 0
      ? { face: '#bbf7d0', rim: '#166534' }
      : { face: '#fecaca', rim: '#991b1b' };
  }
  if (p.closeReason === 'stop_loss' || pnl < 0) {
    return { face: '#a16207', rim: '#451a03' };
  }
  return { face: '#fbbf24', rim: '#78350f' };
}

export interface CoinPileProps {
  positions: CryptoPosition[];
  /** Column inner width; drives disc diameter. */
  width: number;
  /** Max overlapping discs drawn from the **newest** positions. */
  maxDiscs?: number;
}

/**
 * Vertical **pile** of coins (overlapping discs, newest on top) used as the
 * main visual for vault columns.
 */
export default function CoinPile({ positions, width, maxDiscs = 10 }: CoinPileProps) {
  const total = positions.length;

  const { discD, step, layers, sample, pileH } = useMemo(() => {
    const w      = Math.max(56, width);
    const discD  = Math.floor(Math.min(86, Math.max(58, w - 8)));
    const step   = Math.round(discD * 0.22);
    const layers = Math.min(maxDiscs, Math.max(1, total));
    const sample = positions.slice(0, layers);
    const pileH  = discD + (layers - 1) * step;
    return { discD, step, layers, sample, pileH };
  }, [positions, width, maxDiscs, total]);

  const more = total - sample.length;

  if (total === 0) {
    return (
      <View style={[styles.emptyWrap, { width }]}>
        <Text style={styles.emptyTxt}>No coins</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width, height: pileH + 8 }]}>
      <View style={[styles.pileArea, { width, height: pileH }]}>
        {/* i=0 newest: top of stack; higher zIndex draws on top */}
        {sample.map((p, i) => {
          const { face, rim } = discPalette(p);
          const top = i * step;
          return (
            <View
              key={p.id}
              pointerEvents="none"
              style={[
                styles.disc,
                {
                  width: discD,
                  height: discD,
                  borderRadius: discD / 2,
                  top,
                  marginLeft: -discD / 2,
                  left: '50%',
                  backgroundColor: face,
                  borderColor: rim,
                  zIndex: i + 1,
                },
              ]}
            >
              <View style={[styles.discRim, { borderColor: rim, borderRadius: discD / 2 }]} />
            </View>
          );
        })}
      </View>

      {more > 0 ? (
        <View style={[styles.moreBadge, { zIndex: sample.length + 9 }]}>
          <Text style={styles.moreTxt}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    paddingBottom: 4,
  },
  pileArea: {
    position: 'relative',
    alignSelf: 'center',
  },
  disc: {
    position: 'absolute',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  discRim: {
    ...StyleSheet.absoluteFillObject,
    margin: 5,
    borderWidth: 1,
    opacity: 0.35,
  },
  moreBadge: {
    position: 'absolute',
    right: 4,
    top: 2,
    minWidth: 28,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  moreTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
    textAlign: 'center',
  },
  emptyWrap: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  emptyTxt: { fontSize: 12, color: '#64748b', fontWeight: '600' },
});
