import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert, Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { formatUnits } from 'viem';
import { getConfig, getPrivateKey } from '@/lib/config-store';
import { getPublicClient } from '@/lib/safe';
import { getAllPositions, getAllUsdcPositions } from '@/lib/position-store';
import { runDailyDca } from '@/lib/dca-runner';
import { CONTRACTS, ERC20_ABI, PRICE_API_URL } from '@/lib/constants';
import type { BotConfig } from '@/lib/types';
import StatCard from '@/components/StatCard';

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

export default function PortfolioScreen() {
  const [live,       setLive]       = useState<LiveData | null>(null);
  const [positions,  setPositions]  = useState<Awaited<ReturnType<typeof getAllPositions>>>([]);
  const [config,     setConfig]     = useState<BotConfig | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [running,    setRunning]    = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

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

      if (cfg.safeAddress) {
        const liveData = await readBalance(cfg.safeAddress as `0x${string}`, cfg.rpcUrl);
        setLive(liveData);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

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
      refresh();
    } catch (e) {
      setLastResult(`Error: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const ethPrice      = live?.ethPrice ?? 0;
  const btcPrice      = live?.btcPrice ?? 0;

  const netWorth = live
    ? live.wethInSafe * ethPrice + live.cbBtcInSafe * btcPrice + live.usdcInSafe
    : 0;

  const totalInvested = positions.reduce((s, p) => s + p.usdcInvested, 0);
  const deployedValue = openPositions.reduce((s, p) => {
    const price = p.asset === 'ETH' ? ethPrice : btcPrice;
    return s + p.assetAmount * price;
  }, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Live Portfolio</Text>
          {config?.safeAddress ? (
            <Text style={styles.address}>{config.safeAddress.slice(0, 10)}…{config.safeAddress.slice(-8)}</Text>
          ) : (
            <Text style={styles.noConfig}>Configure in Settings</Text>
          )}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={loading}>
          <Text style={styles.refreshTxt}>{loading ? '…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

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
              value={`${deployedValue - totalInvested >= 0 ? '+' : ''}$${fmt(deployedValue - totalInvested, 0)}`}
              sub={`${totalInvested > 0 ? fmt(((deployedValue - totalInvested) / totalInvested) * 100) : '0.00'}%`}
              positive={deployedValue >= totalInvested}
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

      {/* Positions table */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Positions ({positions.length})</Text>
        {positions.length === 0 && (
          <Text style={styles.empty}>No positions yet. Run the bot to start.</Text>
        )}
        {positions.map((p) => {
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
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#030712' },
  content:      { padding: 16, paddingBottom: 40 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, marginTop: 8 },
  title:        { fontSize: 20, fontWeight: '700', color: '#fff' },
  address:      { fontSize: 11, color: '#4b5563', fontVariant: ['tabular-nums'], marginTop: 2 },
  noConfig:     { fontSize: 11, color: '#92400e', marginTop: 2 },
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
});
