import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Alert, Switch, Dimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { runSimulation } from '@/lib/dca-engine';
import { getPricesForRange, seedAllPrices, getPriceCoverage } from '@/lib/price-store';
import { useConfig } from '@/lib/config-store';
import { HISTORY_START } from '@/lib/constants';
import { localCalendarDate } from '@/lib/calendar-day';
import type { SimulationResult, BacktestConfig, CryptoPosition } from '@/lib/types';
import PortfolioChart, { type ChartPoint } from '@/components/PortfolioChart';
import StatCard from '@/components/StatCard';
import HeroCard from '@/components/HeroCard';
import CoinVault from '@/components/CoinVault';
import PositionFilterChips from '@/components/PositionFilterChips';
import { matchesPositionViewFilter, type PositionsViewFilter } from '@/lib/position-filters';
import { colors, fonts, radii, switchColors } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';

const PERIODS = [
  { label: '90d',  days: 90   },
  { label: '180d', days: 180  },
  { label: '1Y',   days: 365  },
  { label: '2Y',   days: 730  },
  { label: '3Y',   days: 1095 },
  { label: '4Y',   days: 1460 },
  { label: '5Y',   days: 1825 }
];

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function parsePos(v: string, fallback: number): number {
  const n = parseFloat(v);
  return !isNaN(n) && n > 0 ? n : fallback;
}

/** Allow 0 to skip stop-loss / reopen for one asset, or 0% take-profit threshold. */
function parseNonNeg(v: string, fallback: number): number {
  const n = parseFloat(v);
  return !isNaN(n) && n >= 0 ? n : fallback;
}

export default function SimulationScreen() {
  const [ethStr, setEthStr]       = useState('5');
  const [btcStr, setBtcStr]       = useState('5');
  const [profitEthStr, setProfitEthStr] = useState('5');
  const [profitBtcStr, setProfitBtcStr] = useState('5');
  const [slEn, setSlEn]           = useState(false);
  const [slEthStr, setSlEthStr]   = useState('10');
  const [slBtcStr, setSlBtcStr]   = useState('10');
  const [reopenEn, setReopenEn]   = useState(false);
  const [reopenEthStr, setReopenEthStr] = useState('5');
  const [reopenBtcStr, setReopenBtcStr] = useState('5');
  const [period, setPeriod]   = useState(365);
  const prefs = useConfig();
  const gamify = prefs?.gamifyPositions !== false;
  const [result, setResult]   = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [coverage, setCoverage] = useState<{ from: string | null; count: number } | null>(null);

  const backtest = useMemo((): BacktestConfig => ({
    dailyAmountEth:       parsePos(ethStr, 5),
    dailyAmountBtc:       parsePos(btcStr, 5),
    profitThresholdEth:   parseNonNeg(profitEthStr, 5),
    profitThresholdBtc:   parseNonNeg(profitBtcStr, 5),
    stopLossEnabled:      slEn,
    stopLossPctEth:       parseNonNeg(slEthStr, 10),
    stopLossPctBtc:       parseNonNeg(slBtcStr, 10),
    reopenEnabled:        reopenEn,
    reopenDownPctEth:     parseNonNeg(reopenEthStr, 5),
    reopenDownPctBtc:     parseNonNeg(reopenBtcStr, 5),
  }), [ethStr, btcStr, profitEthStr, profitBtcStr, slEn, slEthStr, slBtcStr, reopenEn, reopenEthStr, reopenBtcStr]);

  const backtestRef = useRef(backtest);
  backtestRef.current = backtest;

  const loadCoverage = useCallback(async () => {
    try {
      const cov = await getPriceCoverage();
      setCoverage({ from: cov.ethereum.from, count: cov.ethereum.count });
    } catch { /* ignore */ }
  }, []);

  const runSim = useCallback(async (days: number, cfg: BacktestConfig) => {
    setLoading(true);
    try {
      const today    = localCalendarDate();
      const fromDay  = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const fromDate = fromDay < HISTORY_START ? HISTORY_START : fromDay;

      const [eth, btc] = await Promise.all([
        getPricesForRange('ethereum', fromDate, today),
        getPricesForRange('bitcoin',  fromDate, today),
      ]);

      if (eth.length === 0) {
        Alert.alert('No price data', 'Tap "Sync History" to download historical prices.');
        return;
      }

      setResult(runSimulation(eth, btc, cfg, fromDate));
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadCoverage();
    runSim(period, backtestRef.current);
  }, [period, loadCoverage, runSim]));

  const syncHistory = async () => {
    setSeeding(true);
    try {
      const counts = await seedAllPrices(HISTORY_START);
      await loadCoverage();
      Alert.alert('Done', `Synced ${counts.ethereum} ETH + ${counts.bitcoin} BTC price records.`);
      runSim(period, backtest);
    } catch (e) {
      Alert.alert('Sync failed', String(e));
    } finally {
      setSeeding(false);
    }
  };

  const s = result?.summary;
  const pPos = (s?.pnlUsd ?? 0) >= 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Backtester" />

      <View style={styles.periodRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {PERIODS.map(({ label, days }) => (
            <TouchableOpacity
              key={days}
              style={[styles.periodBtn, period === days && styles.periodBtnActive]}
              onPress={() => { setPeriod(days); runSim(days, backtest); }}
            >
              <Text style={[styles.periodLabel, period === days && styles.periodLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {s && (
        <HeroCard
          label="Simulated P&L"
          value={`${pPos ? '+' : '−'}$${fmt(Math.abs(Math.trunc(s.pnlUsd)), 0)}`}
          badge={{
            text: `${pPos ? '+' : ''}${fmt(s.pnlPercent)}% · ${s.totalDays} days`,
            positive: pPos,
          }}
          subline={`$${fmt(s.totalInvested, 0)} invested · $${fmt(s.finalTotalValue, 0)} final`}
          innerWidth={Dimensions.get('window').width - 36}
        />
      )}

      {result && result.days.length > 0 && (
        <View style={styles.chartWrapper}>
          <PortfolioChart
            data={result.days.map<ChartPoint>((d) => ({
              date:           d.date,
              invested:       d.totalInvested,
              portfolioValue: d.totalValue,
              pnlPercent:     d.pnlPercent,
            }))}
            height={220}
          />
        </View>
      )}

      {/* Summary cards */}
      {s && (
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <StatCard label="Total Invested"  value={`$${fmt(s.totalInvested, 0)}`}  sub={`${s.totalDays} days`} />
              <View style={styles.gridGap} />
              <StatCard label="Final Value"     value={`$${fmt(s.finalTotalValue, 0)}`} sub={`Crypto + USDC`} />
            </View>
            <View style={styles.gridRow}>
              <StatCard
                label="Realized"
                value={`$${fmt(s.totalRealizedProfitUsd, 0)}`}
                sub={`${s.closedPositions} sells`}
                positive={s.totalRealizedProfitUsd >= 0}
              />
              <View style={styles.gridGap} />
              <StatCard label="Avg sell" value={`+${fmt(s.avgProfitPctPerSell)}%`} sub={`${s.openPositions} open`} />
            </View>
          </View>
      )}

      {result && result.cryptoPositions.length > 0 && (
        gamify
          ? <CoinVault positions={result.cryptoPositions} />
          : <PositionsTable positions={result.cryptoPositions} openCount={s?.openPositions ?? 0} closedCount={s?.closedPositions ?? 0} />
      )}

      {/* Config inputs */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Strategy</Text>
        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ETH buy/day</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={ethStr}
                onChangeText={setEthStr}
              />
              <Text style={styles.unit}>USDC</Text>
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BTC buy/day</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={btcStr}
                onChangeText={setBtcStr}
              />
              <Text style={styles.unit}>USDC</Text>
            </View>
          </View>
        </View>

        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Sell ETH at +%</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={profitEthStr}
                onChangeText={setProfitEthStr}
              />
              <Text style={styles.unit}>%</Text>
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Sell BTC at +%</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={profitBtcStr}
                onChangeText={setProfitBtcStr}
              />
              <Text style={styles.unit}>%</Text>
            </View>
          </View>
        </View>

        <View style={styles.slRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.slLabel}>Stop-loss</Text>
            <Text style={styles.slSub}>
              When on, sell if down the ETH/BTC % from buy (after take-profit). Set 0 on one side to skip that asset.
            </Text>
          </View>
          <Switch
            value={slEn}
            onValueChange={setSlEn}
            thumbColor={switchColors.thumbColor}
            trackColor={switchColors.trackColor}
          />
        </View>
        {slEn ? (
          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ETH max drawdown</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={slEthStr}
                  onChangeText={setSlEthStr}
                />
                <Text style={styles.unit}>%</Text>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BTC max drawdown</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={slBtcStr}
                  onChangeText={setSlBtcStr}
                />
                <Text style={styles.unit}>%</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.slRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.slLabel}>Reopen on dip</Text>
            <Text style={styles.slSub}>
              When on, a closed leg can reopen if spot falls the ETH/BTC % below its last exit (uses exit USDC).
            </Text>
          </View>
          <Switch
            value={reopenEn}
            onValueChange={setReopenEn}
            thumbColor={switchColors.thumbColor}
            trackColor={switchColors.trackColor}
          />
        </View>
        {reopenEn ? (
          <View style={[styles.row, { marginTop: 10 }]}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ETH dip from exit</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={reopenEthStr}
                  onChangeText={setReopenEthStr}
                />
                <Text style={styles.unit}>%</Text>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>BTC dip from exit</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={reopenBtcStr}
                  onChangeText={setReopenBtcStr}
                />
                <Text style={styles.unit}>%</Text>
              </View>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.btn}
          onPress={() => runSim(period, backtest)}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Running…' : 'Run Simulation'}</Text>
        </TouchableOpacity>
      </View>

      {/* Price sync */}
      {/* <View style={styles.syncRow}>
        <Text style={styles.coverageText}>
          {coverage?.from
            ? `Prices: ${coverage.from} · ${coverage.count} days`
            : 'No price history cached'}
        </Text>
        <TouchableOpacity
          style={[styles.syncBtn, (!coverage?.from || coverage.from > '2022-01-05') && styles.syncBtnWarn]}
          onPress={syncHistory}
          disabled={seeding}
        >
          {seeding
            ? <ActivityIndicator color={colors.primaryOn} size="small" />
            : <Text style={styles.syncBtnText}>
                {coverage?.from && coverage.from <= '2022-01-05' ? 'Sync Prices' : 'Sync Jan 2022'}
              </Text>
          }
        </TouchableOpacity>
      </View> */}

      {loading && !result && (
        <ActivityIndicator color={colors.primary} style={styles.spinner} />
      )}
    </ScrollView>
  );
}

// ── Plain table view of positions, used when gamification is OFF ─────────────

function PositionsTable({
  positions, openCount, closedCount,
}: {
  positions:   CryptoPosition[];
  openCount:   number;
  closedCount: number;
}) {
  const [filter, setFilter] = React.useState<PositionsViewFilter>('all');
  const sorted = React.useMemo(
    () => [...positions].sort((a, b) => b.buyDate.localeCompare(a.buyDate)),
    [positions],
  );
  const filtered = React.useMemo(
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
  return (
    <View style={styles.tableCard}>
      <View style={styles.tableHead}>
        <Text style={styles.sectionLabel}>
          Positions ({filtered.length}
          {filter !== 'all' && positions.length !== filtered.length ? ` / ${positions.length}` : ''})
        </Text>
        <Text style={styles.tableSub}>{openCount} open · {closedCount} closed</Text>
      </View>
      <PositionFilterChips value={filter} onChange={setFilter} />
      {filtered.length === 0 ? (
        <Text style={styles.tableEmpty}>No positions match this filter.</Text>
      ) : (
        filtered.map((p) => {
        const isOpen   = p.status === 'OPEN';
        const currVal  = isOpen ? (p.finalValue ?? 0) : (p.usdcReceived ?? 0);
        const pnlPct   = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
        const refPrice = isOpen ? (p.finalPrice ?? p.buyPrice) : (p.sellPrice ?? p.buyPrice);
        const pnlPos   = pnlPct >= 0;
        return (
          <View key={p.id} style={styles.tableRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tableAsset}>
                <Text style={p.asset === 'ETH' ? styles.eth : styles.btc}>{p.asset}</Text>
                {'  '}<Text style={styles.tableDate}>{p.buyDate}</Text>
                {p.sellDate && <Text style={styles.tableDate}>{' → '}{p.sellDate}</Text>}
              </Text>
              <Text style={styles.tableMeta}>
                ${fmt(p.usdcInvested)} → ${fmt(currVal)} · {isOpen ? 'now' : 'sell'} ${fmt(refPrice, 0)} (buy ${fmt(p.buyPrice, 0)})
                {!isOpen && p.closeReason === 'stop_loss' ? ' · stop-loss' : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.tablePnl, { color: pnlPos ? colors.success : colors.danger }]}>
                {pnlPos ? '+' : ''}{fmt(pnlPct)}%
              </Text>
              <View style={[styles.tableBadge, isOpen && styles.tableBadgeOpen]}>
                <Text style={styles.tableBadgeTxt}>{p.status}</Text>
              </View>
            </View>
          </View>
        );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: colors.bg },
  content:     { paddingHorizontal: 18, paddingBottom: 128, paddingTop: 4 },
  card:        { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  sectionLabel:{ fontSize: 15, color: colors.text, fontWeight: '700', letterSpacing: -0.2, marginBottom: 12, fontFamily: fonts.sansBold },
  row:         { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  inputGroup:  { flex: 1, minWidth: 90 },
  inputLabel:  { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input:       { backgroundColor: colors.inputBg, color: colors.text, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontVariant: ['tabular-nums'], width: 70, borderWidth: 1, borderColor: colors.border },
  unit:        { color: colors.textSecondary, fontSize: 12 },
  btn:         { marginTop: 14, backgroundColor: colors.primary, borderRadius: radii.button, paddingVertical: 14, alignItems: 'center' },
  btnText:     { color: colors.primaryOn, fontWeight: '600', fontSize: 14 },
  periodRow:   { flexDirection: 'row', marginBottom: 16 },
  periodBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  periodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  periodLabelActive: { color: colors.primaryOn, fontWeight: '700' },
  syncRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  coverageText:{ fontSize: 11, color: colors.textMuted, flex: 1 },
  syncBtn:     { backgroundColor: colors.surfaceElevated, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, minWidth: 100, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  syncBtnWarn: { backgroundColor: colors.warningBg, borderColor: colors.warning },
  syncBtnText: { color: colors.text, fontSize: 12, fontWeight: '500' },
  grid:        { gap: 8, marginBottom: 16 },
  gridRow:     { flexDirection: 'row' },
  gridGap:     { width: 8 },
  chartWrapper:{ marginBottom: 16 },
  spinner:     { marginTop: 40 },

  tableCard:   { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  tableHead:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  tableEmpty:  { color: colors.textSecondary, fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  tableSub:    { fontSize: 11, color: colors.textSecondary },
  tableRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  tableAsset:  { fontSize: 13, fontWeight: '600', color: colors.text },
  tableDate:   { fontSize: 11, color: colors.textSecondary, fontWeight: '400' },
  tableMeta:   { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  tablePnl:    { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tableBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, marginTop: 4 },
  tableBadgeOpen: { backgroundColor: colors.statusOpenBg },
  tableBadgeTxt: { fontSize: 9, color: colors.textSecondary, textTransform: 'uppercase' },
  slRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  slLabel:       { fontSize: 13, fontWeight: '600', color: colors.text },
  slSub:         { fontSize: 10, color: colors.textSecondary, marginTop: 4, lineHeight: 14 },
  slPctRow:      { marginTop: 10 },
  eth:         { color: colors.eth },
  btc:         { color: colors.btc },
});
