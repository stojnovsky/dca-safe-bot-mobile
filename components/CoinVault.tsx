import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DailyCoin from './DailyCoin';
import type { CryptoPosition } from '@/lib/types';

// ── Coin Vault ───────────────────────────────────────────────────────────────
// Gamified positions panel. Each position is a "Daily Coin" sized like a
// game token, coloured by status (gold = closed in profit, bronze = closed
// in loss, live emerald/red = open). Tap a coin for its full breakdown.

type CoinFilter = 'all' | 'open' | 'closed' | 'profit' | 'loss';

const FILTERS: { key: CoinFilter; label: string }[] = [
  { key: 'all',    label: 'All'    },
  { key: 'open',   label: 'Open'   },
  { key: 'closed', label: 'Closed' },
  { key: 'profit', label: 'Profit' },
  { key: 'loss',   label: 'Loss'   },
];

const INITIAL_VISIBLE = 80;
const PAGE_SIZE       = 80;

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  positions: CryptoPosition[];
}

export default function CoinVault({ positions }: Props) {
  const [filter,  setFilter]  = useState<CoinFilter>('all');
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const sorted = useMemo(
    () => [...positions].sort((a, b) => b.buyDate.localeCompare(a.buyDate)),
    [positions],
  );

  const counts = useMemo(() => {
    let open = 0, closed = 0;
    for (const p of positions) (p.status === 'OPEN' ? open++ : closed++);
    return { open, closed };
  }, [positions]);

  const filtered = useMemo(() => {
    return sorted.filter((p) => {
      const isOpen = p.status === 'OPEN';
      const pnl    = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
      switch (filter) {
        case 'open':   return isOpen;
        case 'closed': return !isOpen;
        case 'profit': return pnl >= 0;
        case 'loss':   return pnl <  0;
        default:       return true;
      }
    });
  }, [sorted, filter]);

  useEffect(() => { setVisible(INITIAL_VISIBLE); }, [filter]);

  const slice   = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  const showDetails = useCallback((p: CryptoPosition) => {
    const isOpen   = p.status === 'OPEN';
    const value    = isOpen ? (p.finalValue ?? 0) : (p.usdcReceived ?? 0);
    const pnlPct   = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
    const pnlUsd   = isOpen ? (p.unrealizedPnlUsd ?? 0) : (p.profitUsd ?? 0);
    const refPrice = isOpen ? (p.finalPrice ?? p.buyPrice) : (p.sellPrice ?? p.buyPrice);
    const lines = [
      `${p.asset}  ·  ${p.status}`,
      `Bought ${p.buyDate} @ $${fmt(p.buyPrice, 0)}`,
      isOpen
        ? `Now    @ $${fmt(refPrice, 0)}`
        : `Sold   ${p.sellDate ?? '—'} @ $${fmt(refPrice, 0)}`,
      ``,
      `Invested: $${fmt(p.usdcInvested)}`,
      `Value:    $${fmt(value)}`,
      `P&L:      ${pnlPct >= 0 ? '+' : ''}$${fmt(pnlUsd)} (${pnlPct >= 0 ? '+' : ''}${fmt(pnlPct)}%)`,
    ];
    Alert.alert('Daily Coin', lines.join('\n'));
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.vaultHead}>
        <Text style={styles.sectionLabel}>Daily Coins ({positions.length})</Text>
        <Text style={styles.vaultSub}>
          {counts.open} open · {counts.closed} closed
        </Text>
      </View>

      <View style={styles.legendRow}>
        <Legend swatch="#fbbf24" border="#78350f" label="Gold · win" />
        <Legend swatch="#a16207" border="#451a03" label="Bronze · loss" />
        <Legend swatch="#bbf7d0" border="#166534" label="Live · earning" />
        <Legend swatch="#fecaca" border="#991b1b" label="Live · down" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
          >
            <Text style={[styles.filterTxt, filter === f.key && styles.filterTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <Text style={styles.vaultEmpty}>No coins match this filter.</Text>
      ) : (
        <View style={styles.coinGrid}>
          {slice.map((p) => (
            <DailyCoin key={p.id} position={p} onPress={showDetails} />
          ))}
        </View>
      )}

      {hasMore && (
        <TouchableOpacity
          style={styles.loadMoreBtn}
          onPress={() => setVisible((v) => v + PAGE_SIZE)}
        >
          <Text style={styles.loadMoreTxt}>
            Load {Math.min(PAGE_SIZE, filtered.length - visible)} more  ·  {filtered.length - visible} remaining
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Legend({ swatch, border, label }: { swatch: string; border: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch, borderColor: border }]} />
      <Text style={styles.legendTxt}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card:         { backgroundColor: '#111827', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1f2937', marginBottom: 12 },
  sectionLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8 },

  vaultHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  vaultSub:    { fontSize: 11, color: '#6b7280' },
  vaultEmpty:  { color: '#4b5563', fontSize: 12, textAlign: 'center', paddingVertical: 20 },

  legendRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch:{ width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  legendTxt:   { color: '#9ca3af', fontSize: 10, fontWeight: '500' },

  filterRow:        { flexGrow: 0, marginBottom: 12 },
  filterBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#1f2937', marginRight: 6 },
  filterBtnActive:  { backgroundColor: '#2563eb' },
  filterTxt:        { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
  filterTxtActive:  { color: '#fff' },

  coinGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },

  loadMoreBtn: { marginTop: 14, paddingVertical: 10, backgroundColor: '#1f2937', borderRadius: 8, alignItems: 'center' },
  loadMoreTxt: { color: '#93c5fd', fontSize: 12, fontWeight: '600' },
});
