import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import CoinPile from './CoinPile';
import DailyCoin from './DailyCoin';
import PositionFilterChips from './PositionFilterChips';
import type { CryptoPosition, PositionLifecycleEvent } from '@/lib/types';
import { matchesPositionViewFilter, type PositionsViewFilter } from '@/lib/position-filters';
import {
  flattenMonthPositions,
  flattenYearPositions,
  groupPositionsByYMW,
  monthLabelFromKey,
  vaultCoinSlotWidth,
} from '@/lib/coin-vault-grouping';

const ROW_GAP = 6;

// ── Coin Vault ───────────────────────────────────────────────────────────────
// Gamified positions: **horizontal columns** with drill-down — **years → months
// → weeks** (Mon–Sun). Each column is a **pile**; tapping a **week** pile/header
// opens a **week-only** coin grid (no pile mixed with singles).

type Drill =
  | { level: 'years' }
  | { level: 'months'; year: number }
  | { level: 'weeks'; year: number; monthKey: string }
  | { level: 'weekCoins'; year: number; monthKey: string; weekKey: string };

/** Max height of the week-only coin list (final step). */
const WEEK_COINS_SCROLL_MAX_H = 480;

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  positions: CryptoPosition[];
  /** When set, tapping an **open** coin shows a "Close now" action (on-chain sell at spot). */
  onRequestCloseOpen?: (p: CryptoPosition) => void;
}

function fmtLifecycle(ev: PositionLifecycleEvent): string {
  const px = `$${fmt(ev.price, 0)}`;
  if (ev.action === 'open') {
    return `${ev.date}  ·  Open @ ${px}  ·  $${fmt(ev.usdcInvested ?? 0)} in  ·  ${fmt(ev.assetAmount ?? 0, 6)} units`;
  }
  if (ev.action === 'reopen') {
    return `${ev.date}  ·  Reopen @ ${px}  ·  $${fmt(ev.usdcInvested ?? 0)} in  ·  ${fmt(ev.assetAmount ?? 0, 6)} units`;
  }
  if (ev.action === 'close_take_profit') {
    const pp = ev.profitPct ?? 0;
    return `${ev.date}  ·  Close (take-profit) @ ${px}  ·  ${pp >= 0 ? '+' : ''}${fmt(pp)}%  ·  $${fmt(ev.usdcReceived ?? 0)} out`;
  }
  const pp = ev.profitPct ?? 0;
  return `${ev.date}  ·  Close (stop-loss) @ ${px}  ·  ${fmt(pp)}%  ·  $${fmt(ev.usdcReceived ?? 0)} out`;
}

export default function CoinVault({ positions, onRequestCloseOpen }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [filter, setFilter] = useState<PositionsViewFilter>('all');
  const [drill, setDrill]   = useState<Drill>({ level: 'years' });
  const [innerW, setInnerW] = useState(0);

  const sorted = useMemo(
    () => [...positions].sort((a, b) => b.buyDate.localeCompare(a.buyDate)),
    [positions],
  );

  const counts = useMemo(() => {
    let open = 0, closed = 0;
    for (const p of positions) (p.status === 'OPEN' ? open++ : closed++);
    return { open, closed };
  }, [positions]);

  const filtered = useMemo(
    () =>
      sorted.filter((p) =>
        matchesPositionViewFilter(
          {
            status: p.status,
            profitPct: p.profitPct,
            unrealizedPnlPct: p.unrealizedPnlPct,
            closeReason: p.closeReason,
            lifecycle: p.lifecycle,
          },
          filter,
        ),
      ),
    [sorted, filter],
  );

  const grouped = useMemo(() => groupPositionsByYMW(filtered), [filtered]);

  useEffect(() => {
    setDrill({ level: 'years' });
  }, [filter]);

  useEffect(() => {
    if (drill.level === 'months') {
      if (!grouped.some((y) => y.year === drill.year)) setDrill({ level: 'years' });
    } else if (drill.level === 'weeks') {
      const y = grouped.find((g) => g.year === drill.year);
      if (!y?.months.some((m) => m.monthKey === drill.monthKey)) setDrill({ level: 'years' });
    } else if (drill.level === 'weekCoins') {
      const y = grouped.find((g) => g.year === drill.year);
      const m = y?.months.find((mo) => mo.monthKey === drill.monthKey);
      const w = m?.weeks.find((wk) => wk.weekKey === drill.weekKey);
      if (!w) setDrill({ level: 'years' });
    }
  }, [grouped, drill]);

  const usableWidth = innerW > 0 ? innerW : Math.max(220, windowWidth - 60);
  const columnWidth = Math.round(
    Math.min(200, Math.max(156, usableWidth * 0.38)),
  );
  const weekCoinsSlot = useMemo(
    () => vaultCoinSlotWidth(usableWidth),
    [usableWidth],
  );

  const goBack = useCallback(() => {
    setDrill((d) => {
      if (d.level === 'weekCoins') return { level: 'weeks', year: d.year, monthKey: d.monthKey };
      if (d.level === 'weeks') return { level: 'months', year: d.year };
      if (d.level === 'months') return { level: 'years' };
      return d;
    });
  }, []);

  const showDetails = useCallback((p: CryptoPosition) => {
    const isOpen   = p.status === 'OPEN';
    const value    = isOpen ? (p.finalValue ?? 0) : (p.usdcReceived ?? 0);
    const pnlPct   = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
    const pnlUsd   = isOpen ? (p.unrealizedPnlUsd ?? 0) : (p.profitUsd ?? 0);
    const refPrice = isOpen ? (p.finalPrice ?? p.buyPrice) : (p.sellPrice ?? p.buyPrice);
    const lines = [
      `${p.asset}  ·  ${p.status}`,
      ...(!isOpen && p.closeReason === 'stop_loss' ? ['Exit: stop-loss'] : []),
      ...(!isOpen && p.closeReason === 'take_profit' ? ['Exit: take-profit'] : []),
      `Bought ${p.buyDate} @ $${fmt(p.buyPrice, 0)}`,
      isOpen
        ? `Now    @ $${fmt(refPrice, 0)}`
        : `Sold   ${p.sellDate ?? '—'} @ $${fmt(refPrice, 0)}`,
      ``,
      `Invested: $${fmt(p.usdcInvested)}`,
      `Value:    $${fmt(value)}`,
      `P&L:      ${pnlPct >= 0 ? '+' : ''}$${fmt(pnlUsd)} (${pnlPct >= 0 ? '+' : ''}${fmt(pnlPct)}%)`,
    ];
    const lifeLines =
      p.lifecycle && p.lifecycle.length > 0
        ? ['', '— Activity (opens / closes / reopens) —', ...p.lifecycle.map(fmtLifecycle)]
        : [];
    const body = [...lines, ...lifeLines].join('\n');

    if (isOpen && onRequestCloseOpen) {
      Alert.alert('Daily Coin', body, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close now', style: 'destructive', onPress: () => onRequestCloseOpen(p) },
      ]);
    } else {
      Alert.alert('Daily Coin', body);
    }
  }, [onRequestCloseOpen]);

  const drillHint =
    drill.level === 'years'
      ? 'Swipe years · tap header or pile to open months'
      : drill.level === 'months'
        ? 'Swipe months · tap header or pile to open weeks'
        : drill.level === 'weeks'
          ? "Swipe weeks · tap header or pile to open that week's coins"
          : 'Tap a coin for details';

  const yearGroup =
    drill.level === 'months' || drill.level === 'weeks' || drill.level === 'weekCoins'
      ? grouped.find((g) => g.year === drill.year)
      : undefined;
  const monthGroup =
    (drill.level === 'weeks' || drill.level === 'weekCoins') && yearGroup
      ? yearGroup.months.find((m) => m.monthKey === drill.monthKey)
      : undefined;
  const selectedWeek =
    drill.level === 'weekCoins' && monthGroup
      ? monthGroup.weeks.find((w) => w.weekKey === drill.weekKey)
      : undefined;

  return (
    <View style={styles.card}>
      <View style={styles.vaultHead}>
        <Text style={styles.sectionLabel}>Daily Coins ({positions.length})</Text>
        <Text style={styles.vaultSub}>
          {counts.open} open · {counts.closed} closed
          {onRequestCloseOpen ? ' · live: tap → Close now' : ''}
        </Text>
      </View>

      <View style={styles.legendRow}>
        <Legend swatch="#fbbf24" border="#78350f" label="Gold · win" />
        <Legend swatch="#a16207" border="#451a03" label="Bronze · loss / stop-loss" />
        <Legend swatch="#bbf7d0" border="#166534" label="Live · earning" />
        <Legend swatch="#fecaca" border="#991b1b" label="Live · down" />
      </View>

      <PositionFilterChips value={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <Text style={styles.vaultEmpty}>No coins match this filter.</Text>
      ) : (
        <View
          style={styles.measureBox}
          onLayout={(e) => setInnerW(e.nativeEvent.layout.width)}
        >
          {drill.level !== 'years' && (
            <View style={styles.drillBar}>
              <TouchableOpacity onPress={goBack} style={styles.drillBack} hitSlop={8}>
                <Text style={styles.drillBackTxt}>
                  ‹{' '}
                  {drill.level === 'weekCoins'
                    ? 'Weeks'
                    : drill.level === 'weeks'
                      ? 'Months'
                      : 'Years'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.drillCrumb} numberOfLines={1}>
                {drill.level === 'months'
                  ? String(drill.year)
                  : drill.level === 'weekCoins' && selectedWeek
                    ? `${drill.year} · ${monthLabelFromKey(drill.monthKey)} · ${selectedWeek.weekLabel}`
                    : `${drill.year} · ${monthLabelFromKey(drill.monthKey)}`}
              </Text>
            </View>
          )}

          {drill.level === 'weekCoins' && selectedWeek ? (
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={{ maxHeight: WEEK_COINS_SCROLL_MAX_H }}
              contentContainerStyle={styles.weekCoinsScroll}
            >
              <Text style={styles.weekCoinsHead}>{selectedWeek.weekLabel}</Text>
              <Text style={styles.weekCoinsSub}>
                {monthLabelFromKey(drill.monthKey)} · {selectedWeek.items.length} coin
                {selectedWeek.items.length === 1 ? '' : 's'}
              </Text>
              <View style={[styles.coinRow, { width: usableWidth, gap: ROW_GAP }]}>
                {selectedWeek.items.map((p) => (
                  <DailyCoin
                    key={p.id}
                    position={p}
                    onPress={showDetails}
                    slotWidth={weekCoinsSlot}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.columnsRow}
            >
              {drill.level === 'years' &&
                grouped.map((y) => (
                  <CoinColumn
                    key={y.year}
                    title={String(y.year)}
                    subtitle={`${flattenYearPositions(y).length} buys`}
                    columnWidth={columnWidth}
                    positions={flattenYearPositions(y)}
                    onHeaderPress={() => setDrill({ level: 'months', year: y.year })}
                    expandLabel="Open months ▸"
                    pileMaxDiscs={12}
                  />
                ))}

              {drill.level === 'months' &&
                yearGroup?.months.map((m) => (
                  <CoinColumn
                    key={m.monthKey}
                    title={m.monthLabel}
                    subtitle={`${flattenMonthPositions(m).length} buys`}
                    columnWidth={columnWidth}
                    positions={flattenMonthPositions(m)}
                    onHeaderPress={() =>
                      setDrill({ level: 'weeks', year: drill.year, monthKey: m.monthKey })
                    }
                    expandLabel="Open weeks ▸"
                    pileMaxDiscs={12}
                  />
                ))}

              {drill.level === 'weeks' &&
                monthGroup?.weeks.map((w) => (
                  <CoinColumn
                    key={w.weekKey}
                    title={w.weekLabel}
                    subtitle="Week"
                    columnWidth={columnWidth}
                    positions={w.items}
                    onHeaderPress={() =>
                      setDrill({
                        level:     'weekCoins',
                        year:      drill.year,
                        monthKey:  drill.monthKey,
                        weekKey:   w.weekKey,
                      })
                    }
                    expandLabel="View coins ▸"
                    pileMaxDiscs={8}
                  />
                ))}
            </ScrollView>
          )}

          <Text style={styles.hintTxt}>{drillHint}</Text>
        </View>
      )}
    </View>
  );
}

function CoinColumn({
  title,
  subtitle,
  columnWidth,
  positions,
  onHeaderPress,
  expandLabel,
  pileMaxDiscs = 10,
}: {
  title: string;
  subtitle?: string;
  columnWidth: number;
  positions: CryptoPosition[];
  onHeaderPress?: () => void;
  expandLabel?: string;
  pileMaxDiscs?: number;
}) {
  const pad   = 8;
  const inner = Math.max(48, columnWidth - pad * 2);

  return (
    <View style={[styles.columnShell, { width: columnWidth }]}>
      <TouchableOpacity
        activeOpacity={onHeaderPress ? 0.65 : 1}
        onPress={onHeaderPress}
        disabled={!onHeaderPress}
        style={[styles.columnHead, !!onHeaderPress && styles.columnHeadTappable]}
      >
        <Text style={styles.columnTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.columnSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {onHeaderPress && expandLabel ? (
          <Text style={styles.columnTap}>{expandLabel}</Text>
        ) : null}
      </TouchableOpacity>

      <View style={[styles.columnBody, { paddingHorizontal: pad, paddingTop: 10, paddingBottom: 8 }]}>
        {onHeaderPress ? (
          <TouchableOpacity activeOpacity={0.75} onPress={onHeaderPress}>
            <CoinPile positions={positions} width={inner} maxDiscs={pileMaxDiscs} />
          </TouchableOpacity>
        ) : (
          <CoinPile positions={positions} width={inner} maxDiscs={pileMaxDiscs} />
        )}
      </View>

      <Text style={styles.columnFooter}>
        {positions.length} coin{positions.length === 1 ? '' : 's'}
      </Text>
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

  measureBox:  { alignSelf: 'stretch', width: '100%' },

  drillBar:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  drillBack:   { paddingVertical: 4, paddingHorizontal: 2 },
  drillBackTxt:{ fontSize: 14, fontWeight: '700', color: '#93c5fd' },
  drillCrumb:  { flex: 1, fontSize: 13, fontWeight: '700', color: '#d1d5db' },

  columnsRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 4, gap: 0 },

  columnShell: {
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  columnHead: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  columnHeadTappable: { backgroundColor: '#1e3a5f' },
  columnTitle: { fontSize: 15, fontWeight: '800', color: '#f1f5f9' },
  columnSub:   { fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: '600' },
  columnTap:   { fontSize: 11, fontWeight: '700', color: '#38bdf8', marginTop: 6 },
  columnBody:  { alignItems: 'center' },

  columnFooter: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },

  coinRow:     { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start' },

  weekCoinsScroll: { paddingBottom: 12 },
  weekCoinsHead:   { fontSize: 17, fontWeight: '800', color: '#f1f5f9', marginBottom: 4 },
  weekCoinsSub:    { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 12 },

  hintTxt:     { fontSize: 10, color: '#64748b', marginTop: 8, textAlign: 'center', fontWeight: '500' },

  legendRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch:{ width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  legendTxt:   { color: '#9ca3af', fontSize: 10, fontWeight: '500' },

});
