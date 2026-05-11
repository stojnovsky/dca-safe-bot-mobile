import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { runSimulation } from '@/lib/dca-engine';
import { getPricesForRange, seedAllPrices, getPriceCoverage } from '@/lib/price-store';
import { HISTORY_START } from '@/lib/constants';
import type { SimulationResult, BacktestConfig } from '@/lib/types';
import PortfolioChart, { type ChartPoint } from '@/components/PortfolioChart';
import StatCard from '@/components/StatCard';

const PERIODS = [
  { label: '90d',  days: 90   },
  { label: '180d', days: 180  },
  { label: '1Y',   days: 365  },
  { label: '2Y',   days: 730  },
  { label: '3Y',   days: 1095 },
  { label: 'All',  days: 2000 },
];

function fmt(n: number, d = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function SimulationScreen() {
  const [config, setConfig]   = useState<BacktestConfig>({ dailyAmountEth: 5, dailyAmountBtc: 5, profitThreshold: 5 });
  const [period, setPeriod]   = useState(365);
  const [result, setResult]   = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [coverage, setCoverage] = useState<{ from: string | null; count: number } | null>(null);

  const loadCoverage = useCallback(async () => {
    try {
      const cov = await getPriceCoverage();
      setCoverage({ from: cov.ethereum.from, count: cov.ethereum.count });
    } catch { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => {
    loadCoverage();
    runSim(period, config);
  }, [])); // eslint-disable-line

  const runSim = useCallback(async (days: number, cfg: BacktestConfig) => {
    setLoading(true);
    try {
      const today    = new Date().toISOString().slice(0, 10);
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

  const syncHistory = async () => {
    setSeeding(true);
    try {
      const counts = await seedAllPrices(HISTORY_START);
      await loadCoverage();
      Alert.alert('Done', `Synced ${counts.ethereum} ETH + ${counts.bitcoin} BTC price records.`);
      runSim(period, config);
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
      <Text style={styles.title}>DCA Simulation</Text>

      {/* Config inputs */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Strategy Parameters</Text>
        <View style={styles.row}>
          {[
            { key: 'dailyAmountEth',  label: 'ETH buy/day',  unit: 'USDC' },
            { key: 'dailyAmountBtc',  label: 'BTC buy/day',  unit: 'USDC' },
            { key: 'profitThreshold', label: 'Sell at',       unit: '%' },
          ].map(({ key, label, unit }) => (
            <View key={key} style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{label}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(config[key as keyof BacktestConfig])}
                  onChangeText={(v) => {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n > 0) setConfig((c) => ({ ...c, [key]: n }));
                  }}
                />
                <Text style={styles.unit}>{unit}</Text>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => runSim(period, config)}
          disabled={loading}
        >
          <Text style={styles.btnText}>{loading ? 'Running…' : 'Run Simulation'}</Text>
        </TouchableOpacity>
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {PERIODS.map(({ label, days }) => (
            <TouchableOpacity
              key={days}
              style={[styles.periodBtn, period === days && styles.periodBtnActive]}
              onPress={() => { setPeriod(days); runSim(days, config); }}
            >
              <Text style={[styles.periodLabel, period === days && styles.periodLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.syncBtnText}>
                {coverage?.from && coverage.from <= '2022-01-05' ? 'Sync Prices' : 'Sync Jan 2022'}
              </Text>
          }
        </TouchableOpacity>
      </View> */}

      {/* Summary cards */}
      {s && (
        <>
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <StatCard label="Total Invested"  value={`$${fmt(s.totalInvested, 0)}`}  sub={`${s.totalDays} days`} />
              <View style={styles.gridGap} />
              <StatCard label="Final Value"     value={`$${fmt(s.finalTotalValue, 0)}`} sub={`Crypto + USDC`} />
            </View>
            <View style={styles.gridRow}>
              <StatCard
                label="P&L"
                value={`${pPos ? '+' : ''}$${fmt(s.pnlUsd, 0)}`}
                sub={`${pPos ? '+' : ''}${fmt(s.pnlPercent)}%`}
                positive={pPos}
              />
              <View style={styles.gridGap} />
              <StatCard
                label="Realized Profit"
                value={`$${fmt(s.totalRealizedProfitUsd, 0)}`}
                sub={`${s.closedPositions} sells`}
                positive={s.totalRealizedProfitUsd >= 0}
              />
            </View>
            <View style={styles.gridRow}>
              <StatCard label="ETH held" value={`${fmt(s.finalEthAmount, 4)}`} sub={`$${fmt(s.finalCryptoValue * (s.finalEthAmount / (s.finalEthAmount + s.finalBtcAmount * 1) || 1), 0)}`} />
              <View style={styles.gridGap} />
              <StatCard label="Avg sell %" value={`+${fmt(s.avgProfitPctPerSell)}%`} sub={`${s.openPositions} open`} />
            </View>
          </View>

          {result && result.days.length > 0 && (
            <View style={styles.chartWrapper}>
              <PortfolioChart
                data={result.days.map<ChartPoint>((d) => ({
                  date:           d.date,
                  invested:       d.totalInvested,
                  portfolioValue: d.totalValue,
                  pnlPercent:     d.pnlPercent,
                }))}
                height={260}
              />
            </View>
          )}

          {result && result.cryptoPositions.length > 0 && (
            <View style={styles.card}>
              <View style={styles.posHeader}>
                <Text style={styles.sectionLabel}>Positions ({result.cryptoPositions.length})</Text>
                <Text style={styles.posSubLabel}>
                  {s?.openPositions ?? 0} open · {s?.closedPositions ?? 0} closed
                </Text>
              </View>
              {[...result.cryptoPositions]
                .sort((a, b) => b.buyDate.localeCompare(a.buyDate))
                .map((p) => {
                  const isOpen  = p.status === 'OPEN';
                  const currVal = isOpen ? (p.finalValue ?? 0) : (p.usdcReceived ?? 0);
                  const pnlPct  = isOpen ? (p.unrealizedPnlPct ?? 0) : (p.profitPct ?? 0);
                  const pnlPos  = pnlPct >= 0;
                  const refPrice = isOpen ? (p.finalPrice ?? p.buyPrice) : (p.sellPrice ?? p.buyPrice);
                  return (
                    <View key={p.id} style={styles.posRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.posAsset}>
                          <Text style={p.asset === 'ETH' ? styles.eth : styles.btc}>{p.asset}</Text>
                          {'  '}<Text style={styles.posDate}>{p.buyDate}</Text>
                          {p.sellDate && <Text style={styles.posDate}>{' → '}{p.sellDate}</Text>}
                        </Text>
                        <Text style={styles.posMeta}>
                          ${fmt(p.usdcInvested)} → ${fmt(currVal)} · {isOpen ? 'now' : 'sell'} ${fmt(refPrice, 0)} (buy ${fmt(p.buyPrice, 0)})
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.posPnl, { color: pnlPos ? '#34d399' : '#f87171' }]}>
                          {pnlPos ? '+' : ''}{fmt(pnlPct)}%
                        </Text>
                        <View style={[styles.statusBadge, isOpen && styles.statusOpen]}>
                          <Text style={styles.statusTxt}>{p.status}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </View>
          )}
        </>
      )}

      {loading && !result && (
        <ActivityIndicator color="#3b82f6" style={styles.spinner} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#030712' },
  content:     { padding: 16, paddingBottom: 40 },
  title:       { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 16, marginTop: 8 },
  card:        { backgroundColor: '#111827', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1f2937' },
  sectionLabel:{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  row:         { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  inputGroup:  { flex: 1, minWidth: 90 },
  inputLabel:  { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input:       { backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, fontVariant: ['tabular-nums'], width: 70 },
  unit:        { color: '#6b7280', fontSize: 12 },
  btn:         { marginTop: 14, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnText:     { color: '#fff', fontWeight: '600', fontSize: 14 },
  periodRow:   { flexDirection: 'row', marginBottom: 12 },
  periodBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1f2937', marginRight: 6 },
  periodBtnActive: { backgroundColor: '#2563eb' },
  periodLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
  periodLabelActive: { color: '#fff' },
  syncRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  coverageText:{ fontSize: 11, color: '#4b5563', flex: 1 },
  syncBtn:     { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  syncBtnWarn: { backgroundColor: '#92400e' },
  syncBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  grid:        { gap: 8, marginBottom: 16 },
  gridRow:     { flexDirection: 'row' },
  gridGap:     { width: 8 },
  chartWrapper:{ marginBottom: 16 },
  spinner:     { marginTop: 40 },
  posHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  posSubLabel: { fontSize: 11, color: '#6b7280' },
  posRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1f2937' },
  posAsset:    { fontSize: 13, fontWeight: '600', color: '#fff' },
  posDate:     { fontSize: 11, color: '#6b7280', fontWeight: '400' },
  posMeta:     { fontSize: 11, color: '#6b7280', marginTop: 2 },
  posPnl:      { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  eth:         { color: '#60a5fa' },
  btc:         { color: '#fb923c' },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#1f2937', marginTop: 4 },
  statusOpen:  { backgroundColor: '#1e3a8a' },
  statusTxt:   { fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' },
});
