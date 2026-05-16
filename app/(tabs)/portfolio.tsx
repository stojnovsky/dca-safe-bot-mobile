import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert, Linking,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { formatUnits } from 'viem';
import { getConfig, getPrivateKey, useConfig } from '@/lib/config-store';
import { getPublicClient } from '@/lib/safe';
import { getAllPositions, getAllUsdcPositions } from '@/lib/position-store';
import { runDailyDca } from '@/lib/dca-runner';
import { logBotRun, logBotEvent } from '@/lib/log-store';
import { getPricesForRange } from '@/lib/price-store';
import { buildPositionTimeline } from '@/lib/timeline';
import { CONTRACTS, ERC20_ABI, PRICE_API_URL } from '@/lib/constants';
import type { BotConfig, CryptoPosition } from '@/lib/types';
import StatCard from '@/components/StatCard';
import PortfolioChart, { type ChartPoint } from '@/components/PortfolioChart';
import CoinVault from '@/components/CoinVault';
import CollapsibleDcaStrategyPanel from '@/components/CollapsibleDcaStrategyPanel';
import PositionFilterChips from '@/components/PositionFilterChips';
import {
  matchesPositionViewFilter,
  type PositionFilterFields,
  type PositionsViewFilter,
} from '@/lib/position-filters';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface LiveData {
  wethInSafe:   number;
  cbBtcInSafe:  number;
  usdcInSafe:   number;
  ethPrice:     number;
  btcPrice:     number;
}

async function readBalance(safeAddress: `0x${string}`, rpcUrl: string): Promise<LiveData> {
  const client = getPublicClient(rpcUrl);
  const [wethRaw, cbBtcRaw, usdcRaw, priceRes] = await Promise.all([
    client.readContract({ address: CONTRACTS.WETH,  abi: ERC20_ABI, functionName: 'balanceOf', args: [safeAddress] }),
    client.readContract({ address: CONTRACTS.cbBTC, abi: ERC20_ABI, functionName: 'balanceOf', args: [safeAddress] }),
    client.readContract({ address: CONTRACTS.USDC,  abi: ERC20_ABI, functionName: 'balanceOf', args: [safeAddress] }),
    fetch(PRICE_API_URL).then((r) => r.json()),
  ]);
  return {
    wethInSafe:  parseFloat(formatUnits(wethRaw as bigint,  18)),
    cbBtcInSafe: parseFloat(formatUnits(cbBtcRaw as bigint,  8)),
    usdcInSafe:  parseFloat(formatUnits(usdcRaw as bigint,   6)),
    ethPrice:    priceRes.ethereum.usd,
    btcPrice:    priceRes.bitcoin.usd,
  };
}

function portfolioRowFilterFields(
  p: Awaited<ReturnType<typeof getAllPositions>>[number],
  ethPrice: number,
  btcPrice: number,
): PositionFilterFields {
  const price = p.asset === 'ETH' ? ethPrice : btcPrice;
  const unrealizedPnlPct =
    p.status === 'OPEN' && price > 0 ? ((price - p.buyPrice) / p.buyPrice) * 100 : undefined;
  return {
    status: p.status,
    profitPct: p.profitPct,
    unrealizedPnlPct,
    closeReason: p.closeReason,
    lifecycle: p.lifecycle,
  };
}

/**
 * The Portfolio screen stores positions via `position-store.Position`, which is
 * structurally similar to (but distinct from) `CryptoPosition` from the
 * simulation engine. To feed `CoinVault` we need to project Position[] into
 * CryptoPosition[] and inject the live-price-derived fields the vault expects.
 */
function enrichForVault(
  p: Awaited<ReturnType<typeof getAllPositions>>[number],
  ethPrice: number,
  btcPrice: number,
): CryptoPosition {
  const isOpen = p.status === 'OPEN';
  const price  = p.asset === 'ETH' ? ethPrice : btcPrice;
  const finalValue       = isOpen ? p.assetAmount * price                          : undefined;
  const unrealizedPnlUsd = isOpen && finalValue !== undefined ? finalValue - p.usdcInvested : undefined;
  const unrealizedPnlPct = isOpen && price > 0 ? ((price - p.buyPrice) / p.buyPrice) * 100 : undefined;
  return {
    id:               p.id,
    asset:            p.asset,
    buyDate:          p.buyDate,
    buyPrice:         p.buyPrice,
    usdcInvested:     p.usdcInvested,
    assetAmount:      p.assetAmount,
    status:           p.status,
    sellDate:         p.sellDate,
    sellPrice:        p.sellPrice,
    usdcReceived:     p.usdcReceived,
    profitUsd:        p.profitUsd,
    profitPct:        p.profitPct,
    finalPrice:       isOpen ? price : undefined,
    finalValue,
    unrealizedPnlUsd,
    unrealizedPnlPct,
    closeReason:    p.closeReason,
    lifecycle:      p.lifecycle,
  };
}

export default function PortfolioScreen() {
  const prefs = useConfig();
  const gamify = prefs?.gamifyPositions !== false;
  const [live,       setLive]       = useState<LiveData | null>(null);
  const [positions,  setPositions]  = useState<Awaited<ReturnType<typeof getAllPositions>>>([]);
  const [config,     setConfig]     = useState<BotConfig | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [running,    setRunning]    = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [timeline,   setTimeline]   = useState<ChartPoint[]>([]);
  const [positionFilter, setPositionFilter] = useState<PositionsViewFilter>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, pos, uPos] = await Promise.all([
        getConfig(),
        getAllPositions(),
        getAllUsdcPositions(),
      ]);
      setConfig(cfg);
      setPositions(pos);

      let liveData: LiveData | null = null;
      if (cfg.safeAddress) {
        liveData = await readBalance(cfg.safeAddress as `0x${string}`, cfg.rpcUrl);
        setLive(liveData);
      }

      if (pos.length > 0) {
        const start = [...pos].sort((a, b) => a.buyDate.localeCompare(b.buyDate))[0].buyDate;
        const today = new Date().toISOString().slice(0, 10);
        const [eth, btc] = await Promise.all([
          getPricesForRange('ethereum', start, today),
          getPricesForRange('bitcoin',  start, today),
        ]);
        setTimeline(
          buildPositionTimeline(pos, eth, btc, {
            liveEthPrice: liveData?.ethPrice,
            liveBtcPrice: liveData?.btcPrice,
          }),
        );
      } else {
        setTimeline([]);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Brand-new install: no Safe configured → show the onboarding pitch in place
  // of the regular portfolio UI. We wait until `config` is loaded so we don't
  // flash the welcome screen for users who already have a Safe.
  if (config && !config.safeAddress) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Welcome to MeditFin</Text>
          <Text style={styles.welcomeBody}>
            You haven't set up a Safe yet. MeditFin needs a Safe account on Base
            to run automated DCA buys on your behalf — the bot signs from a
            local key but can never withdraw to anyone other than your Safe.
          </Text>

          <View style={styles.welcomeBullets}>
            <Text style={styles.bullet}>• Generate a fresh signer key on this device</Text>
            <Text style={styles.bullet}>• Deploy a 1-of-1 Safe on Base</Text>
            <Text style={styles.bullet}>• Fund the signer with ETH and your Safe with USDC</Text>
            <Text style={styles.bullet}>• Bot does daily DCA automatically — you keep custody</Text>
          </View>

          <TouchableOpacity style={styles.welcomeBtn} onPress={() => router.push('/onboarding')}>
            <Text style={styles.welcomeBtnTxt}>Start setup</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
            <Text style={styles.welcomeLink}>I already have a Safe — configure manually</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const runBot = async () => {
    const pk = await getPrivateKey();
    if (!config?.safeAddress || !pk) {
      Alert.alert('Not configured', 'Set Safe address and private key in Settings first.');
      return;
    }
    setRunning(true);
    setLastResult(null);
    try {
      const result = await runDailyDca(config, pk as `0x${string}`);
      const msg = `${result.buys.length} buys, ${result.sells.length} sells` +
        (result.errors.length ? `\nErrors: ${result.errors.join('; ')}` : '');
      setLastResult(msg);
      await logBotRun('manual', result);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastResult(`Error: ${msg}`);
      await logBotEvent('manual', 'error', msg, { stack: e instanceof Error ? e.stack : undefined });
    } finally {
      setRunning(false);
    }
  };

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const ethPrice      = live?.ethPrice ?? 0;
  const btcPrice      = live?.btcPrice ?? 0;

  const filteredPortfolioPositions = useMemo(
    () =>
      positions.filter((p) =>
        matchesPositionViewFilter(portfolioRowFilterFields(p, ethPrice, btcPrice), positionFilter),
      ),
    [positions, ethPrice, btcPrice, positionFilter],
  );

  const netWorth = live
    ? live.wethInSafe * ethPrice + live.cbBtcInSafe * btcPrice + live.usdcInSafe
    : 0;

  // Deployed P&L must compare **open** market value to **open** cost basis only.
  // Previously we summed usdcInvested across *all* positions (including closed),
  // which inflated the denominator and made $ / % wrong vs the Daily Coins.
  const openCostBasis = openPositions.reduce((s, p) => s + p.usdcInvested, 0);
  const deployedValue = openPositions.reduce((s, p) => {
    const price = p.asset === 'ETH' ? ethPrice : btcPrice;
    return s + p.assetAmount * price;
  }, 0);
  const deployedPnlUsd = deployedValue - openCostBasis;
  const deployedPnlPct = openCostBasis > 0 ? (deployedPnlUsd / openCostBasis) * 100 : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Live Portfolio</Text>
          {config?.safeAddress && (
            <Text style={styles.address}>{config.safeAddress.slice(0, 10)}…{config.safeAddress.slice(-8)}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={loading}>
          <Text style={styles.refreshTxt}>{loading ? '…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {config && config.safeAddress ? (
        <CollapsibleDcaStrategyPanel botConfig={config} onSaved={refresh} />
      ) : null}

      {/* Stat cards */}
      {live && (
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <StatCard label="Net Worth"     value={`$${fmt(netWorth, 0)}`} sub={`ETH $${fmt(live.wethInSafe * ethPrice, 0)} · BTC $${fmt(live.cbBtcInSafe * btcPrice, 0)}`} />
            <View style={styles.gap} />
            <StatCard label="USDC in Safe" value={`$${fmt(live.usdcInSafe)}`} sub="Undeployed" />
          </View>
          <View style={styles.gridRow}>
            <StatCard label="ETH"  value={`${fmt(live.wethInSafe,  4)}`} sub={`$${fmt(ethPrice, 0)}`} />
            <View style={styles.gap} />
            <StatCard label="BTC"  value={`${fmt(live.cbBtcInSafe, 6)}`} sub={`$${fmt(btcPrice, 0)}`} />
          </View>
          <View style={styles.gridRow}>
            <StatCard label="Deployed P&L"
              value={`${deployedPnlUsd >= 0 ? '+' : ''}$${fmt(deployedPnlUsd, 0)}`}
              sub={`${openCostBasis > 0 ? fmt(deployedPnlPct) : '0.00'}%`}
              positive={deployedPnlUsd >= 0}
            />
            <View style={styles.gap} />
            <StatCard label="Positions" value={String(openPositions.length)} sub={`of ${positions.length} total`} />
          </View>
        </View>
      )}

      {/* Run bot */}
      <TouchableOpacity style={[styles.runBtn, running && styles.runBtnDisabled]} onPress={runBot} disabled={running}>
        {running
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.runBtnTxt}>Run DCA Now</Text>
        }
      </TouchableOpacity>

      {lastResult && (
        <View style={[styles.resultBox, lastResult.startsWith('Error') && styles.resultBoxError]}>
          <Text style={styles.resultTxt}>{lastResult}</Text>
        </View>
      )}

      {timeline.length > 1 && (
        <View style={styles.chartWrapper}>
          <PortfolioChart data={timeline} height={260} />
        </View>
      )}

      {/* Positions: either gamified Daily Coins or a plain table */}
      {positions.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Positions (0)</Text>
          <Text style={styles.empty}>No positions yet. Run the bot to start.</Text>
        </View>
      ) : gamify ? (
        <CoinVault positions={positions.map((p) => enrichForVault(p, ethPrice, btcPrice))} />
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            Positions ({filteredPortfolioPositions.length}
            {positionFilter !== 'all' && positions.length !== filteredPortfolioPositions.length
              ? ` / ${positions.length}`
              : ''})
          </Text>
          <PositionFilterChips value={positionFilter} onChange={setPositionFilter} />
          {filteredPortfolioPositions.length === 0 ? (
            <Text style={styles.empty}>No positions match this filter.</Text>
          ) : (
            filteredPortfolioPositions.map((p) => {
            const price    = p.asset === 'ETH' ? ethPrice : btcPrice;
            const currVal  = p.status === 'OPEN' ? p.assetAmount * price : (p.usdcReceived ?? 0);
            const pnlPct   = p.status === 'OPEN'
              ? ((price - p.buyPrice) / p.buyPrice) * 100
              : (p.profitPct ?? 0);
            const pnlPos   = pnlPct >= 0;

            return (
              <View key={p.id} style={styles.posRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.posAsset}>
                    <Text style={p.asset === 'ETH' ? styles.eth : styles.btc}>{p.asset}</Text>
                    {'  '}<Text style={styles.posDate}>{p.buyDate}</Text>
                  </Text>
                  <Text style={styles.posMeta}>
                    ${fmt(p.usdcInvested)} → ${fmt(currVal)} · buy ${fmt(p.buyPrice, 0)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.posPnl, { color: pnlPos ? '#34d399' : '#f87171' }]}>
                    {pnlPos ? '+' : ''}{fmt(pnlPct)}%
                  </Text>
                  <View style={[styles.statusBadge, p.status === 'OPEN' && styles.statusOpen]}>
                    <Text style={styles.statusTxt}>{p.status}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://basescan.org/tx/${p.buyTxHash}`)}
                  style={styles.txLink}
                >
                  <Text style={styles.txTxt}>↗</Text>
                </TouchableOpacity>
              </View>
            );
          })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#030712' },
  content:      { padding: 16, paddingBottom: 40 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, marginTop: 8 },
  title:        { fontSize: 20, fontWeight: '700', color: '#fff' },
  address:      { fontSize: 11, color: '#4b5563', fontVariant: ['tabular-nums'], marginTop: 2 },
  welcomeCard:  { backgroundColor: '#0b1220', borderColor: '#1f2937', borderWidth: 1, borderRadius: 16, padding: 20, marginTop: 40 },
  welcomeTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 10 },
  welcomeBody:  { color: '#9ca3af', fontSize: 14, lineHeight: 21, marginBottom: 18 },
  welcomeBullets:{ marginBottom: 22 },
  bullet:       { color: '#d1d5db', fontSize: 13, lineHeight: 22 },
  welcomeBtn:   { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  welcomeBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  welcomeLink:  { color: '#60a5fa', fontSize: 13, textAlign: 'center' },
  refreshBtn:   { backgroundColor: '#1f2937', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  refreshTxt:   { color: '#9ca3af', fontSize: 12 },
  grid:         { gap: 8, marginBottom: 12 },
  gridRow:      { flexDirection: 'row' },
  gap:          { width: 8 },
  runBtn:       { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  runBtnDisabled: { backgroundColor: '#1e3a8a' },
  runBtnTxt:    { color: '#fff', fontWeight: '600', fontSize: 15 },
  resultBox:    { backgroundColor: '#064e3b', borderRadius: 8, padding: 10, marginBottom: 12 },
  resultBoxError: { backgroundColor: '#7f1d1d' },
  resultTxt:    { color: '#d1fae5', fontSize: 12 },
  card:         { backgroundColor: '#111827', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1f2937' },
  sectionLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  empty:        { color: '#374151', textAlign: 'center', paddingVertical: 20, fontSize: 13 },
  posRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1f2937' },
  posAsset:     { fontSize: 13, fontWeight: '600', color: '#fff' },
  posDate:      { fontSize: 11, color: '#6b7280', fontWeight: '400' },
  posMeta:      { fontSize: 11, color: '#6b7280', marginTop: 2 },
  posPnl:       { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  eth:          { color: '#60a5fa' },
  btc:          { color: '#fb923c' },
  statusBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#1f2937', marginTop: 4 },
  statusOpen:   { backgroundColor: '#1e3a8a' },
  statusTxt:    { fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' },
  txLink:       { paddingLeft: 10 },
  txTxt:        { color: '#3b82f6', fontSize: 16 },
  chartWrapper: { marginBottom: 12 },
});
