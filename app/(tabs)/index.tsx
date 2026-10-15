import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Alert, Linking, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { formatUnits } from 'viem';
import { getConfig, getPrivateKey, useConfig } from '@/lib/config-store';
import { getPublicClient } from '@/lib/safe';
import { getAllPositions, getAllUsdcPositions } from '@/lib/position-store';
import { runDailyDca, closeOpenPositionNow } from '@/lib/dca-runner';
import { logBotRun, logBotEvent } from '@/lib/log-store';
import { getPricesForRange } from '@/lib/price-store';
import { buildPositionTimeline } from '@/lib/timeline';
import { localCalendarDate } from '@/lib/calendar-day';
import { CONTRACTS, ERC20_ABI, PRICE_API_URL } from '@/lib/constants';
import type { BotConfig, CryptoPosition } from '@/lib/types';
import StatCard from '@/components/StatCard';
import HeroCard from '@/components/HeroCard';
import AssetRowCard from '@/components/AssetRowCard';
import BotStatusBanner from '@/components/BotStatusBanner';
import PortfolioChart, { type ChartPoint } from '@/components/PortfolioChart';
import CoinVault from '@/components/CoinVault';
import CollapsibleDcaStrategyPanel from '@/components/CollapsibleDcaStrategyPanel';
import PositionFilterChips from '@/components/PositionFilterChips';
import {
  matchesPositionViewFilter,
  type PositionFilterFields,
  type PositionsViewFilter,
} from '@/lib/position-filters';
import {
  registerDcaTask,
  unregisterDcaTask,
  isDcaTaskRegistered,
} from '@/tasks/dca-task';
import { colors, fonts, radii, refreshColors, type as typeTokens } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtShortDate(ymd: string | null): string {
  if (!ymd) return '—';
  const p = ymd.split('-').map(Number);
  const y = p[0];
  const m = p[1];
  const day = p[2];
  if (!y || !m || !day) return ymd;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function maxBuyDateForAsset(
  pos: Awaited<ReturnType<typeof getAllPositions>>,
  asset: 'ETH' | 'BTC',
): string | null {
  let max: string | null = null;
  for (const p of pos) {
    if (p.asset !== asset) continue;
    if (!max || p.buyDate > max) max = p.buyDate;
  }
  return max;
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
  const [closingOpenId, setClosingOpenId] = useState<string | null>(null);
  const [botOn, setBotOn] = useState(false);
  const [botBusy, setBotBusy] = useState(false);

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

      try { setBotOn(await isDcaTaskRegistered()); } catch { /* ignore */ }

      if (pos.length > 0) {
        const start = [...pos].sort((a, b) => a.buyDate.localeCompare(b.buyDate))[0].buyDate;
        const today = localCalendarDate();
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

  const ethPrice      = live?.ethPrice ?? 0;
  const btcPrice      = live?.btcPrice ?? 0;
  const openPositions = positions.filter((p) => p.status === 'OPEN');

  const filteredPortfolioPositions = useMemo(
    () =>
      positions.filter((p) =>
        matchesPositionViewFilter(portfolioRowFilterFields(p, ethPrice, btcPrice), positionFilter),
      ),
    [positions, ethPrice, btcPrice, positionFilter],
  );

  const dcaDayInfo = useMemo(() => {
    const today = localCalendarDate();
    const ethLast = maxBuyDateForAsset(positions, 'ETH');
    const btcLast = maxBuyDateForAsset(positions, 'BTC');
    return {
      today,
      ethLast,
      btcLast,
      ethDoneToday: ethLast === today,
      btcDoneToday: btcLast === today,
    };
  }, [positions]);

  const positionStats = useMemo(() => {
    let ethOpen = 0, ethClosed = 0, btcOpen = 0, btcClosed = 0;
    for (const p of positions) {
      if (p.asset === 'ETH') {
        if (p.status === 'OPEN') ethOpen++;
        else ethClosed++;
      } else if (p.asset === 'BTC') {
        if (p.status === 'OPEN') btcOpen++;
        else btcClosed++;
      }
    }
    return { ethOpen, ethClosed, btcOpen, btcClosed };
  }, [positions]);

  const confirmAndCloseOpen = useCallback(
    (positionId: string, label: string) => {
      if (!config?.safeAddress) return;
      Alert.alert(
        'Close on-chain?',
        `Swap this ${label} position to USDC at current spot from your Safe. Gas is paid from the bot signer’s ETH on Base.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            style: 'destructive',
            onPress: async () => {
              const pk = await getPrivateKey();
              if (!pk) {
                Alert.alert('Private key', 'Add a bot private key in Settings.');
                return;
              }
              setClosingOpenId(positionId);
              try {
                const r = await closeOpenPositionNow(config, pk as `0x${string}`, positionId);
                if (r.ok) {
                  Alert.alert('Position closed', `Tx: ${r.txHash.slice(0, 12)}…${r.txHash.slice(-8)}`);
                  await logBotEvent('manual', 'ok', `Manual close ${label}`, { txHash: r.txHash });
                } else {
                  Alert.alert('Close failed', r.error);
                  await logBotEvent('manual', 'error', `Manual close failed: ${r.error}`, { positionId });
                }
              } finally {
                setClosingOpenId(null);
                refresh();
              }
            },
          },
        ],
      );
    },
    [config, refresh],
  );

  const onVaultRequestCloseOpen = useCallback(
    (p: CryptoPosition) => {
      confirmAndCloseOpen(p.id, `${p.asset} · ${p.buyDate}`);
    },
    [confirmAndCloseOpen],
  );

  const toggleBot = useCallback(async (on: boolean) => {
    if (botBusy) return;
    setBotBusy(true);
    setBotOn(on);
    try {
      if (on) await registerDcaTask();
      else    await unregisterDcaTask();
      setBotOn(await isDcaTaskRegistered());
    } catch (e) {
      Alert.alert('Background task error', String(e));
      setBotOn(!on);
    } finally {
      setBotBusy(false);
    }
  }, [botBusy]);

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

  // Per-asset open-position rollup for the AssetRowCards (mockup "Open Positions").
  const perAsset = useMemo(() => {
    const calc = (asset: 'ETH' | 'BTC') => {
      const rows = openPositions.filter((p) => p.asset === asset);
      const holdings = rows.reduce((s, p) => s + p.assetAmount, 0);
      const invested = rows.reduce((s, p) => s + p.usdcInvested, 0);
      const price    = asset === 'ETH' ? ethPrice : btcPrice;
      const value    = holdings * price;
      const pnlUsd   = value - invested;
      const pnlPct   = invested > 0 ? (pnlUsd / invested) * 100 : 0;
      const avgPrice = holdings > 0 ? invested / holdings : 0;
      return { holdings, invested, price, value, pnlUsd, pnlPct, avgPrice };
    };
    return { eth: calc('ETH'), btc: calc('BTC') };
  }, [openPositions, ethPrice, btcPrice]);

  const heroWidth = Dimensions.get('window').width - 36; // matches content paddingHorizontal
  const sparklinePoints = useMemo(() => timeline.map((d) => d.portfolioValue), [timeline]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          tintColor={colors.textSecondary}
          colors={[...refreshColors]}
        />
      }
    >
      <ScreenHeader
        compact
        title="Portfolio"
        right={
          <TouchableOpacity style={styles.refreshBtn} onPress={refresh} disabled={loading || closingOpenId !== null}>
            <Text style={styles.refreshTxt}>{loading ? '…' : 'Refresh'}</Text>
          </TouchableOpacity>
        }
      />

      {live && (
        <HeroCard
          label="Total value"
          value={`$${fmt(Math.trunc(netWorth), 0)}`}
          valueTail={`.${(netWorth - Math.trunc(netWorth)).toFixed(2).slice(2)}`}
          badge={{
            text: `${deployedPnlUsd >= 0 ? '+' : '−'}$${fmt(Math.abs(deployedPnlUsd), 0)}  ${deployedPnlUsd >= 0 ? '+' : ''}${fmt(deployedPnlPct, 1)}%`,
            positive: deployedPnlUsd >= 0,
          }}
          subline={
            config?.safeAddress
              ? `Safe · ${config.safeAddress.slice(0, 6)}…${config.safeAddress.slice(-4)} · Base`
              : undefined
          }
          innerWidth={heroWidth}
          sparkline={sparklinePoints}
        />
      )}

      {timeline.length > 1 && (
        <View style={styles.chartWrapper}>
          <PortfolioChart data={timeline} height={220} />
        </View>
      )}

      <TouchableOpacity
        style={[styles.runBtn, (running || closingOpenId !== null) && styles.runBtnDisabled]}
        onPress={runBot}
        disabled={running || closingOpenId !== null}
      >
        {running
          ? <ActivityIndicator color={colors.primaryOn} size="small" />
          : <Text style={styles.runBtnTxt}>Run DCA now</Text>
        }
      </TouchableOpacity>

      {lastResult && (
        <View style={[styles.resultBox, lastResult.startsWith('Error') && styles.resultBoxError]}>
          <Text style={[styles.resultTxt, lastResult.startsWith('Error') && styles.resultTxtError]}>{lastResult}</Text>
        </View>
      )}

      {config?.safeAddress ? (
        <BotStatusBanner
          running={botOn}
          onToggle={toggleBot}
          disabled={botBusy}
        />
      ) : null}

      {live && (
        <View style={styles.gridRow}>
          <StatCard label="Cash" value={`$${fmt(live.usdcInSafe, 0)}`} sub="USDC in Safe" />
          <View style={styles.gap} />
          <StatCard
            label="Open P&L"
            value={`${deployedPnlUsd >= 0 ? '+' : ''}$${fmt(deployedPnlUsd, 0)}`}
            sub={`${openCostBasis > 0 ? fmt(deployedPnlPct) : '0.00'}%`}
            positive={deployedPnlUsd >= 0}
          />
          <View style={styles.gap} />
          <StatCard label="Open" value={String(openPositions.length)} sub={`of ${positions.length}`} />
        </View>
      )}

      {live && (openPositions.length > 0) ? (
        <>
          <Text style={[typeTokens.sectionLabel, styles.sectionGap]}>Holdings</Text>
          <View style={styles.group}>
            {perAsset.eth.holdings > 0 ? (
              <AssetRowCard
                embedded
                asset="ETH"
                holdings={perAsset.eth.holdings}
                avgPrice={perAsset.eth.avgPrice}
                valueUsd={perAsset.eth.value}
                pnlUsd={perAsset.eth.pnlUsd}
                pnlPct={perAsset.eth.pnlPct}
                share={netWorth > 0 ? perAsset.eth.value / netWorth : 0}
                spotPrice={ethPrice}
              />
            ) : null}
            {perAsset.eth.holdings > 0 && perAsset.btc.holdings > 0 ? (
              <View style={styles.hairline} />
            ) : null}
            {perAsset.btc.holdings > 0 ? (
              <AssetRowCard
                embedded
                asset="BTC"
                holdings={perAsset.btc.holdings}
                avgPrice={perAsset.btc.avgPrice}
                valueUsd={perAsset.btc.value}
                pnlUsd={perAsset.btc.pnlUsd}
                pnlPct={perAsset.btc.pnlPct}
                share={netWorth > 0 ? perAsset.btc.value / netWorth : 0}
                spotPrice={btcPrice}
              />
            ) : null}
          </View>
        </>
      ) : null}

      {/* Positions: either gamified Daily Coins or a plain table */}
      {positions.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Positions (0)</Text>
          <Text style={styles.empty}>No positions yet. Run the bot to start.</Text>
        </View>
      ) : gamify ? (
        <CoinVault
          positions={positions.map((p) => enrichForVault(p, ethPrice, btcPrice))}
          onRequestCloseOpen={config?.safeAddress ? onVaultRequestCloseOpen : undefined}
        />
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
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                  disabled={p.status !== 'OPEN' || !config?.safeAddress || closingOpenId !== null}
                  activeOpacity={p.status === 'OPEN' && config?.safeAddress ? 0.65 : 1}
                  onPress={() => {
                    if (p.status !== 'OPEN' || !config?.safeAddress) return;
                    Alert.alert(
                      `${p.asset} (open)`,
                      `Bought ${p.buyDate} · $${fmt(p.usdcInvested)} in. Tap Confirm to sell at spot, or use the link for the buy tx.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Close now',
                          style: 'destructive',
                          onPress: () => confirmAndCloseOpen(p.id, `${p.asset} · ${p.buyDate}`),
                        },
                      ],
                    );
                  }}
                >
                <View style={{ flex: 1 }}>
                  <Text style={styles.posAsset}>
                    <Text style={p.asset === 'ETH' ? styles.eth : styles.btc}>{p.asset}</Text>
                    {'  '}<Text style={styles.posDate}>{p.buyDate}</Text>
                    {p.status === 'OPEN' && config?.safeAddress ? (
                      <Text style={styles.posTapHint}> · tap to close</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.posMeta}>
                    ${fmt(p.usdcInvested)} → ${fmt(currVal)} · buy ${fmt(p.buyPrice, 0)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.posPnl, { color: pnlPos ? colors.success : colors.danger }]}>
                    {pnlPos ? '+' : ''}{fmt(pnlPct)}%
                  </Text>
                  <View style={[styles.statusBadge, p.status === 'OPEN' && styles.statusOpen]}>
                    <Text style={styles.statusTxt}>{p.status}</Text>
                  </View>
                </View>
                </TouchableOpacity>
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

      {config?.safeAddress ? (
        <>
          <Text style={[typeTokens.sectionLabel, styles.sectionGap]}>Today</Text>
          <View style={styles.group}>
            <View style={styles.legRow}>
              <Text style={styles.eth}>ETH</Text>
              <Text style={styles.legMid} numberOfLines={1}>
                {dcaDayInfo.ethDoneToday ? 'Bought today' : 'Waiting for today’s leg'}
              </Text>
              <Text style={styles.legDate}>{fmtShortDate(dcaDayInfo.ethLast)}</Text>
            </View>
            <View style={styles.hairline} />
            <View style={styles.legRow}>
              <Text style={styles.btc}>BTC</Text>
              <Text style={styles.legMid} numberOfLines={1}>
                {dcaDayInfo.btcDoneToday ? 'Bought today' : 'Waiting for today’s leg'}
              </Text>
              <Text style={styles.legDate}>{fmtShortDate(dcaDayInfo.btcLast)}</Text>
            </View>
            <View style={styles.hairline} />
            <Text style={styles.legFoot}>
              One buy per asset each day · {positionStats.ethOpen} ETH open · {positionStats.btcOpen} BTC open
            </Text>
          </View>
        </>
      ) : null}

      {config?.safeAddress ? (
        <CollapsibleDcaStrategyPanel botConfig={config} onSaved={refresh} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: colors.bg },
  content:      { paddingHorizontal: 18, paddingBottom: 128, paddingTop: 4 },
  sectionGap: { marginTop: 20, marginBottom: 10 },
  welcomeCard:  { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: 20, marginTop: 40 },
  welcomeTitle: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 10 },
  welcomeBody:  { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  welcomeBullets:{ marginBottom: 22 },
  bullet:       { color: colors.text, fontSize: 13, lineHeight: 22, opacity: 0.85 },
  welcomeBtn:   { backgroundColor: colors.primary, borderRadius: radii.button, paddingVertical: 16, alignItems: 'center', marginBottom: 14 },
  welcomeBtnTxt:{ color: colors.primaryOn, fontWeight: '700', fontSize: 15 },
  welcomeLink:  { color: colors.link, fontSize: 13, textAlign: 'center' },
  refreshBtn:   { backgroundColor: colors.surfaceElevated, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  refreshTxt:   { color: colors.textSecondary, fontSize: 12 },
  grid:         { gap: 8, marginBottom: 12 },
  gridRow:      { flexDirection: 'row', marginBottom: 8 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  hairline: { height: 1, backgroundColor: colors.border, marginLeft: 72 },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  legMid: { flex: 1, color: colors.text, fontSize: 14, fontFamily: fonts.sans },
  legDate: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.mono },
  legFoot: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: fonts.sans,
  },
  gap:          { width: 8 },
  runBtn:       {
    backgroundColor: colors.primary,
    borderRadius: radii.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  runBtnDisabled: { backgroundColor: colors.primaryMuted, opacity: 0.7 },
  runBtnTxt:    { color: colors.primaryOn, fontWeight: '700', fontSize: 15, fontFamily: fonts.sansSemi },
  resultBox:    { backgroundColor: colors.successBg, borderRadius: radii.sm, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.successBorder },
  resultBoxError: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  resultTxt:    { color: colors.successText, fontSize: 12 },
  resultTxtError: { color: colors.dangerText },
  card:         { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  sectionLabel: { ...typeTokens.sectionLabel, marginBottom: 10 },
  empty:        { color: colors.textMuted, textAlign: 'center', paddingVertical: 20, fontSize: 13 },
  posRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  posAsset:     { fontSize: 13, fontWeight: '600', color: colors.text },
  posDate:      { fontSize: 11, color: colors.textSecondary, fontWeight: '400' },
  posMeta:      { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  posPnl:       { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  eth:          { color: colors.eth },
  btc:          { color: colors.btc },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, marginTop: 4 },
  statusOpen:   { backgroundColor: colors.statusOpenBg, borderWidth: 1, borderColor: colors.border },
  statusTxt:    { fontSize: 9, color: colors.textSecondary, textTransform: 'uppercase' },
  txLink:       { paddingLeft: 10 },
  txTxt:        { color: colors.link, fontSize: 16 },
  chartWrapper: { marginBottom: 12 },
  dcaInfoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dcaInfoTitle: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 6 },
  dcaInfoSub:   { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginBottom: 10 },
  dcaInfoEm:    { color: colors.link, fontWeight: '600' },
  dcaInfoLine:  { fontSize: 12, color: colors.text, lineHeight: 20, opacity: 0.9 },
  dcaInfoDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  dcaInfoSmallTitle: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  posTapHint:   { fontSize: 10, color: colors.textSecondary, fontWeight: '400' },
});
