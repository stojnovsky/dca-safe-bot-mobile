import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, Switch, Share, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getConfig, saveConfig, getPrivateKey, savePrivateKey } from '@/lib/config-store';
import { getPublicClient } from '@/lib/safe';
import { SAFE_ABI, DEFAULT_RPC, DEFAULT_PRICES_API_URL } from '@/lib/constants';
import {
  unregisterDcaTask,
  registerDcaTask,
  isDcaTaskRegistered,
  getBackgroundTaskStatus,
  runDcaTaskNow,
} from '@/tasks/dca-task';
import * as BackgroundTask from 'expo-background-task';
import * as Clipboard from 'expo-clipboard';
import type { BotConfig } from '@/lib/types';
import { exportPositionsToJson, importPositionsFromJson } from '@/lib/positions-export';
import { colors, switchColors } from '@/lib/theme';

function parsePos(v: string, fallback: number): number {
  const n = parseFloat(v);
  return !isNaN(n) && n > 0 ? n : fallback;
}

/** For % knobs: allow 0 to disable that side (stop-loss / reopen) or use 0% take-profit. */
function parseNonNeg(v: string, fallback: number): number {
  const n = parseFloat(v);
  return !isNaN(n) && n >= 0 ? n : fallback;
}

type NumDraft = {
  dailyAmountEth: string;
  dailyAmountBtc: string;
  profitThresholdEth: string;
  profitThresholdBtc: string;
  stopLossPctEth: string;
  stopLossPctBtc: string;
  reopenDownPctEth: string;
  reopenDownPctBtc: string;
};

function Field({ label, sub, value, onChangeText, secureTextEntry, placeholder, mono }: {
  label: string; sub?: string; value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {sub && <Text style={styles.fieldSub}>{sub}</Text>}
      <TextInput
        style={[styles.fieldInput, mono && styles.monoInput]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [config,  setConfig]  = useState<BotConfig>({
    safeAddress: '',
    rpcUrl: DEFAULT_RPC,
    pricesApiUrl: DEFAULT_PRICES_API_URL,
    dailyAmountEth: 5,
    dailyAmountBtc: 5,
    profitThresholdEth: 5,
    profitThresholdBtc: 5,
    stopLossEnabled: false,
    stopLossPctEth: 10,
    stopLossPctBtc: 10,
    reopenEnabled: false,
    reopenDownPctEth: 5,
    reopenDownPctBtc: 5,
    showLogsTab: false,
    gamifyPositions: true,
  });
  const [numDraft, setNumDraft] = useState<NumDraft>({
    dailyAmountEth: '5',
    dailyAmountBtc: '5',
    profitThresholdEth: '5',
    profitThresholdBtc: '5',
    stopLossPctEth: '10',
    stopLossPctBtc: '10',
    reopenDownPctEth: '5',
    reopenDownPctBtc: '5',
  });
  const [pk,      setPk]      = useState('');
  const [botOn,   setBotOn]   = useState(false);
  const [bgStatus, setBgStatus] = useState<BackgroundTask.BackgroundTaskStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [safeInfo, setSafeInfo] = useState<{ owners: string[]; threshold: number } | null>(null);
  const [positionsImportText, setPositionsImportText] = useState('');
  const [positionsBusy, setPositionsBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [cfg, storedPk, registered, status] = await Promise.all([
        getConfig(), getPrivateKey(),
        isDcaTaskRegistered(), getBackgroundTaskStatus(),
      ]);
      setConfig(cfg);
      setNumDraft({
        dailyAmountEth: String(cfg.dailyAmountEth),
        dailyAmountBtc: String(cfg.dailyAmountBtc),
        profitThresholdEth: String(cfg.profitThresholdEth ?? 5),
        profitThresholdBtc: String(cfg.profitThresholdBtc ?? 5),
        stopLossPctEth: String(cfg.stopLossPctEth ?? 10),
        stopLossPctBtc: String(cfg.stopLossPctBtc ?? 10),
        reopenDownPctEth: String(cfg.reopenDownPctEth ?? 5),
        reopenDownPctBtc: String(cfg.reopenDownPctBtc ?? 5),
      });
      if (storedPk) setPk(storedPk);
      setBotOn(registered);
      setBgStatus(status);
    })();
  }, []));

  const save = async () => {
    try {
      await saveConfig({
        ...config,
        dailyAmountEth:       parsePos(numDraft.dailyAmountEth, config.dailyAmountEth),
        dailyAmountBtc:       parsePos(numDraft.dailyAmountBtc, config.dailyAmountBtc),
        profitThresholdEth: parseNonNeg(numDraft.profitThresholdEth, config.profitThresholdEth ?? 5),
        profitThresholdBtc: parseNonNeg(numDraft.profitThresholdBtc, config.profitThresholdBtc ?? 5),
        stopLossPctEth:     parseNonNeg(numDraft.stopLossPctEth, config.stopLossPctEth ?? 10),
        stopLossPctBtc:     parseNonNeg(numDraft.stopLossPctBtc, config.stopLossPctBtc ?? 10),
        reopenDownPctEth:   parseNonNeg(numDraft.reopenDownPctEth, config.reopenDownPctEth ?? 5),
        reopenDownPctBtc:   parseNonNeg(numDraft.reopenDownPctBtc, config.reopenDownPctBtc ?? 5),
      });
      if (pk) await savePrivateKey(pk);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      Alert.alert('Error saving', String(e));
    }
  };

  const verifySafe = async () => {
    if (!config.safeAddress || !pk) {
      Alert.alert('Fill in', 'Enter Safe address and private key first.');
      return;
    }
    try {
      const client = getPublicClient(config.rpcUrl || DEFAULT_RPC);
      const [owners, threshold] = await Promise.all([
        client.readContract({ address: config.safeAddress as `0x${string}`, abi: SAFE_ABI, functionName: 'getOwners' }),
        client.readContract({ address: config.safeAddress as `0x${string}`, abi: SAFE_ABI, functionName: 'getThreshold' }),
      ]);
      setSafeInfo({ owners: owners as string[], threshold: Number(threshold) });
    } catch (e) {
      Alert.alert('Safe check failed', String(e));
    }
  };

  const toggleBot = async (on: boolean) => {
    setBotOn(on);
    try {
      if (on) await registerDcaTask();
      else    await unregisterDcaTask();
      const [registered, status] = await Promise.all([
        isDcaTaskRegistered(), getBackgroundTaskStatus(),
      ]);
      setBotOn(registered);
      setBgStatus(status);
    } catch (e) {
      Alert.alert('Background task error', String(e));
      setBotOn(!on);
    }
  };

  const exportPositionsBackup = async () => {
    setPositionsBusy(true);
    try {
      const json = await exportPositionsToJson();
      const meta = JSON.parse(json) as { positions?: unknown[]; usdcPositions?: unknown[] };
      const nPos = meta.positions?.length ?? 0;
      const nUsdc = meta.usdcPositions?.length ?? 0;
      await Clipboard.setStringAsync(json);
      Alert.alert(
        'Copied to clipboard',
        `${nPos} position(s) and ${nUsdc} USDC row(s). Paste into Notes or send to your other device, then use Import there.\n\nThis does not include your private key or Safe address — set those separately on the new device.`,
      );
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setPositionsBusy(false);
    }
  };

  const sharePositionsBackup = async () => {
    setPositionsBusy(true);
    try {
      const json = await exportPositionsToJson();
      await Share.share({
        message: json,
        title: 'DCA positions backup',
      });
    } catch {
      /* User cancelled the share sheet or share is unavailable */
    } finally {
      setPositionsBusy(false);
    }
  };

  const pasteImportFromClipboard = async () => {
    try {
      const t = await Clipboard.getStringAsync();
      setPositionsImportText(t ?? '');
    } catch (e) {
      Alert.alert('Clipboard', String(e));
    }
  };

  const runPositionsImport = (mode: 'merge' | 'replace') => {
    const raw = positionsImportText.trim();
    if (!raw) {
      Alert.alert('Nothing to import', 'Paste an export JSON string first (or use Paste from clipboard).');
      return;
    }
    const title = mode === 'replace' ? 'Replace all positions?' : 'Merge positions?';
    const message = mode === 'replace'
      ? 'This removes every position and USDC leg stored on this device, then loads the backup. Use this when restoring on a new phone. This cannot be undone.'
      : 'Rows whose IDs already exist are skipped. USDC rows are skipped if their linked position is missing.';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: mode === 'replace' ? 'Replace' : 'Merge',
        style: mode === 'replace' ? 'destructive' : 'default',
        onPress: async () => {
          setPositionsBusy(true);
          try {
            const r = await importPositionsFromJson(raw, mode);
            if (mode === 'replace') {
              Alert.alert('Import complete', `Loaded ${r.positionsImported} position(s) and ${r.usdcImported} USDC row(s).`);
            } else {
              Alert.alert(
                'Import complete',
                `Added ${r.positionsImported} position(s) (${r.positionsSkipped} skipped), ${r.usdcImported} USDC row(s) (${r.usdcSkipped} skipped).`,
              );
            }
            setPositionsImportText('');
          } catch (e) {
            Alert.alert('Import failed', String(e));
          } finally {
            setPositionsBusy(false);
          }
        },
      },
    ]);
  };

  const runNow = async () => {
    setTriggering(true);
    try {
      const [registered, status] = await Promise.all([
        isDcaTaskRegistered(), getBackgroundTaskStatus(),
      ]);
      setBotOn(registered);
      setBgStatus(status);

      if (!registered) {
        Alert.alert(
          'Bot not registered',
          'Toggle "Hourly background check" ON above first, then try again.',
        );
        return;
      }
      if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
        Alert.alert(
          'Background tasks restricted',
          'iOS reports background tasks are restricted. This happens on the iOS Simulator (BGTaskScheduler is unavailable there) or when "Background App Refresh" is disabled in iOS Settings. Test on a real device.',
        );
        return;
      }

      const ok = await runDcaTaskNow();
      Alert.alert(
        ok ? 'Task triggered' : 'Trigger failed',
        ok
          ? 'Check the Logs tab for the result.'
          : 'triggerTaskWorkerForTestingAsync only works in debug builds. Run via `npx expo run:ios` instead of a release/EAS build.',
      );
    } catch (e) {
      Alert.alert('Trigger error', String(e));
    } finally {
      setTriggering(false);
    }
  };

  const bgStatusLabel =
    bgStatus === BackgroundTask.BackgroundTaskStatus.Available  ? 'Available'  :
    bgStatus === BackgroundTask.BackgroundTaskStatus.Restricted ? 'Restricted (Background App Refresh disabled)' :
    bgStatus === null                                           ? '…'          : 'Unknown';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>

      {/* Safe wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safe Wallet</Text>
        <Field label="Safe Address" placeholder="0x…" value={config.safeAddress} onChangeText={(v) => setConfig((c) => ({ ...c, safeAddress: v }))} mono />
        <Field label="Bot Private Key" sub="Stored in iOS Keychain (Secure Enclave)" placeholder="0x…" value={pk} onChangeText={setPk} secureTextEntry mono />
        <Field label="RPC URL" placeholder={DEFAULT_RPC} value={config.rpcUrl} onChangeText={(v) => setConfig((c) => ({ ...c, rpcUrl: v }))} mono />

        <TouchableOpacity style={styles.secondaryBtn} onPress={verifySafe}>
          <Text style={styles.secondaryBtnTxt}>Verify Safe on-chain</Text>
        </TouchableOpacity>

        {safeInfo && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTxt}>
              Threshold: {safeInfo.threshold}/{safeInfo.owners.length}
            </Text>
            {safeInfo.owners.map((o) => (
              <Text key={o} style={styles.ownerTxt}>{o}</Text>
            ))}
          </View>
        )}
      </View>

      {/* DCA parameters */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DCA Strategy</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="ETH buy / day" placeholder="5" value={numDraft.dailyAmountEth} onChangeText={(v) => setNumDraft((d) => ({ ...d, dailyAmountEth: v }))} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Field label="BTC buy / day" placeholder="5" value={numDraft.dailyAmountBtc} onChangeText={(v) => setNumDraft((d) => ({ ...d, dailyAmountBtc: v }))} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field
              label="Sell ETH at +%"
              placeholder="5"
              value={numDraft.profitThresholdEth}
              onChangeText={(v) => setNumDraft((d) => ({ ...d, profitThresholdEth: v }))}
            />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Field
              label="Sell BTC at +%"
              placeholder="5"
              value={numDraft.profitThresholdBtc}
              onChangeText={(v) => setNumDraft((d) => ({ ...d, profitThresholdBtc: v }))}
            />
          </View>
        </View>

        <View style={[styles.toggleRow, { marginTop: 16 }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.toggleLabel}>Stop-loss</Text>
            <Text style={styles.toggleSub}>
              Off by default. When enabled, sells if unrealized PnL is at or below −ETH/BTC % from buy (after take-profit). Use 0% on one asset to skip stop-loss for that asset only.
            </Text>
          </View>
          <Switch
            value={config.stopLossEnabled === true}
            onValueChange={(v) => setConfig((c) => ({ ...c, stopLossEnabled: v }))}
            thumbColor={switchColors.thumbColor}
            trackColor={switchColors.trackColor}
          />
        </View>
        {config.stopLossEnabled ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="ETH max drawdown %"
                sub="From buy (10 = −10%)"
                placeholder="10"
                value={numDraft.stopLossPctEth}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, stopLossPctEth: v }))}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Field
                label="BTC max drawdown %"
                sub="From buy (10 = −10%)"
                placeholder="10"
                value={numDraft.stopLossPctBtc}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, stopLossPctBtc: v }))}
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.toggleRow, { marginTop: 16 }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.toggleLabel}>Reopen on dip</Text>
            <Text style={styles.toggleSub}>
              Off by default. Reopens a closed leg when spot falls the ETH/BTC % below its last exit (re-uses exit USDC). Use 0% on one asset to never reopen that asset from dip alone.
            </Text>
          </View>
          <Switch
            value={config.reopenEnabled === true}
            onValueChange={(v) => setConfig((c) => ({ ...c, reopenEnabled: v }))}
            thumbColor={switchColors.thumbColor}
            trackColor={switchColors.trackColor}
          />
        </View>
        {config.reopenEnabled ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="ETH dip from exit %"
                sub="e.g. 5 → spot ≤ exit × (1 − 5%)"
                placeholder="5"
                value={numDraft.reopenDownPctEth}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, reopenDownPctEth: v }))}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Field
                label="BTC dip from exit %"
                sub="e.g. 5 → spot ≤ exit × (1 − 5%)"
                placeholder="5"
                value={numDraft.reopenDownPctBtc}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, reopenDownPctBtc: v }))}
              />
            </View>
          </View>
        ) : null}
      </View>

      {/* Prices API */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prices API (Historical)</Text>
        <Field
          label="Base URL"
          sub="medit/prices-api backend serving BTC/ETH historical prices"
          placeholder={DEFAULT_PRICES_API_URL}
          value={config.pricesApiUrl}
          onChangeText={(v) => setConfig((c) => ({ ...c, pricesApiUrl: v }))}
          mono
        />
      </View>

      {/* Background bot toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Background Bot</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.toggleLabel}>Hourly background check</Text>
            <Text style={styles.toggleSub}>
              iOS schedules at its own discretion (typically every few hours, requires charging + idle).
            </Text>
          </View>
          <Switch value={botOn} onValueChange={toggleBot} thumbColor={switchColors.thumbColor} trackColor={switchColors.trackColor} />
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Registered</Text>
          <Text style={[styles.statusVal, { color: botOn ? colors.success : colors.textSecondary }]}>
            {botOn ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>iOS status</Text>
          <Text style={[
            styles.statusVal,
            { color: bgStatus === BackgroundTask.BackgroundTaskStatus.Available ? colors.success : colors.danger },
          ]}>
            {bgStatusLabel}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.secondaryBtn, { marginTop: 10 }]}
          onPress={runNow}
          disabled={triggering}
        >
          <Text style={styles.secondaryBtnTxt}>
            {triggering ? 'Triggering…' : 'Run Background Task Now (debug)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Positions backup (migrate to another device) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Positions backup</Text>
        <Text style={styles.toggleSub}>
          Export copies your local position history (opens, closes, USDC legs) as JSON. On the new device, enter the same Safe and private key in Settings, then import the JSON here. Your keys are never included in the export.
        </Text>
        <View style={[styles.row, { marginTop: 12, flexWrap: 'wrap', gap: 8 }]}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flexBtn]}
            onPress={exportPositionsBackup}
            disabled={positionsBusy}
          >
            <Text style={styles.secondaryBtnTxt}>{positionsBusy ? '…' : 'Copy export to clipboard'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flexBtn]}
            onPress={sharePositionsBackup}
            disabled={positionsBusy}
          >
            <Text style={styles.secondaryBtnTxt}>Share export…</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Import JSON</Text>
        <Text style={styles.fieldSub}>Paste a backup from another device, then choose merge or replace.</Text>
        <TextInput
          style={styles.importInput}
          value={positionsImportText}
          onChangeText={setPositionsImportText}
          placeholder='{"format":"dca-safe-positions-v1",…}'
          placeholderTextColor={colors.placeholder}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={[styles.row, { marginTop: 8, flexWrap: 'wrap', gap: 8 }]}>
          <TouchableOpacity style={[styles.secondaryBtn, styles.flexBtn]} onPress={pasteImportFromClipboard}>
            <Text style={styles.secondaryBtnTxt}>Paste from clipboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flexBtn]}
            onPress={() => runPositionsImport('merge')}
            disabled={positionsBusy}
          >
            <Text style={styles.secondaryBtnTxt}>Import (merge)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.flexBtn]}
            onPress={() => runPositionsImport('replace')}
            disabled={positionsBusy}
          >
            <Text style={[styles.secondaryBtnTxt, { color: colors.danger }]}>Import (replace all)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Display preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.toggleLabel}>Gamify positions</Text>
            <Text style={styles.toggleSub}>
              Show positions as Daily Coins (gold = closed in profit, bronze = closed in loss, live = open). Turn off for a plain table.
            </Text>
          </View>
          <Switch
            value={config.gamifyPositions !== false}
            onValueChange={async (v) => {
              setConfig((c) => ({ ...c, gamifyPositions: v }));
              try { await saveConfig({ gamifyPositions: v }); } catch { /* will be caught by Save */ }
            }}
            thumbColor={switchColors.thumbColor}
            trackColor={switchColors.trackColor}
          />
        </View>

        <View style={[styles.toggleRow, { marginTop: 14 }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.toggleLabel}>Show Logs tab</Text>
            <Text style={styles.toggleSub}>
              Developer-oriented log of every bot run (manual + background). Off by default.
            </Text>
          </View>
          <Switch
            value={!!config.showLogsTab}
            onValueChange={async (v) => {
              setConfig((c) => ({ ...c, showLogsTab: v }));
              try { await saveConfig({ showLogsTab: v }); } catch { /* will be caught by Save */ }
            }}
            thumbColor={switchColors.thumbColor}
            trackColor={switchColors.trackColor}
          />
        </View>
      </View>

      {/* Save */}
      <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnSaved]} onPress={save}>
        <Text style={styles.saveBtnTxt}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: colors.bg },
  content:       { padding: 16, paddingBottom: 60 },
  title:         { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 20, marginTop: 8 },
  section:       { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  sectionTitle:  { fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontWeight: '600' },
  field:         { marginBottom: 14 },
  fieldLabel:    { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  fieldSub:      { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  fieldInput:    { backgroundColor: colors.inputBg, color: colors.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  monoInput:     { fontVariant: ['tabular-nums'], fontSize: 12 },
  row:           { flexDirection: 'row' },
  flexBtn:       { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  secondaryBtn:  { backgroundColor: colors.surfaceElevated, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: colors.border },
  importInput:   {
    backgroundColor: colors.surfaceInset,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
    marginTop: 8,
    textAlignVertical: 'top',
  },
  secondaryBtnTxt: { color: colors.textSecondary, fontSize: 13 },
  infoBox:       { backgroundColor: colors.surfaceInset, borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  infoTxt:       { color: colors.success, fontSize: 12, marginBottom: 4 },
  ownerTxt:      { color: colors.textSecondary, fontSize: 10, fontVariant: ['tabular-nums'] },
  toggleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel:   { color: colors.text, fontSize: 14, fontWeight: '500', opacity: 0.9 },
  toggleSub:     { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  statusRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, marginTop: 8 },
  statusLabel:   { color: colors.textSecondary, fontSize: 11 },
  statusVal:     { fontSize: 11, fontWeight: '600' },
  saveBtn:       { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnSaved:  { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success },
  saveBtnTxt:    { color: colors.primaryOn, fontWeight: '700', fontSize: 15 },
});
