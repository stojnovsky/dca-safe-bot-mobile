import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, Switch,
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
import type { BotConfig } from '@/lib/types';

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
        placeholderTextColor="#374151"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const [config,  setConfig]  = useState<BotConfig>({ safeAddress: '', rpcUrl: DEFAULT_RPC, pricesApiUrl: DEFAULT_PRICES_API_URL, dailyAmountEth: 5, dailyAmountBtc: 5, profitThreshold: 5 });
  const [pk,      setPk]      = useState('');
  const [botOn,   setBotOn]   = useState(false);
  const [bgStatus, setBgStatus] = useState<BackgroundTask.BackgroundTaskStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [safeInfo, setSafeInfo] = useState<{ owners: string[]; threshold: number } | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [cfg, storedPk, registered, status] = await Promise.all([
        getConfig(), getPrivateKey(),
        isDcaTaskRegistered(), getBackgroundTaskStatus(),
      ]);
      setConfig(cfg);
      if (storedPk) setPk(storedPk);
      setBotOn(registered);
      setBgStatus(status);
    })();
  }, []));

  const save = async () => {
    try {
      await saveConfig(config);
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

  const set = (key: keyof BotConfig) => (v: string) => {
    const numeric = ['dailyAmountEth', 'dailyAmountBtc', 'profitThreshold'];
    setConfig((c) => ({ ...c, [key]: numeric.includes(key) ? parseFloat(v) || 0 : v }));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>

      {/* Safe wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safe Wallet</Text>
        <Field label="Safe Address" placeholder="0x…" value={config.safeAddress} onChangeText={set('safeAddress')} mono />
        <Field label="Bot Private Key" sub="Stored in iOS Keychain (Secure Enclave)" placeholder="0x…" value={pk} onChangeText={setPk} secureTextEntry mono />
        <Field label="RPC URL" placeholder={DEFAULT_RPC} value={config.rpcUrl} onChangeText={set('rpcUrl')} mono />

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
            <Field label="ETH buy / day" placeholder="5" value={String(config.dailyAmountEth)} onChangeText={set('dailyAmountEth')} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Field label="BTC buy / day" placeholder="5" value={String(config.dailyAmountBtc)} onChangeText={set('dailyAmountBtc')} />
          </View>
        </View>
        <Field label="Sell at profit %" placeholder="5" value={String(config.profitThreshold)} onChangeText={set('profitThreshold')} />
      </View>

      {/* Prices API */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prices API (Historical)</Text>
        <Field
          label="Base URL"
          sub="medit/prices-api backend serving BTC/ETH historical prices"
          placeholder={DEFAULT_PRICES_API_URL}
          value={config.pricesApiUrl}
          onChangeText={set('pricesApiUrl')}
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
          <Switch value={botOn} onValueChange={toggleBot} thumbColor="#3b82f6" trackColor={{ true: '#1e3a8a', false: '#374151' }} />
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Registered</Text>
          <Text style={[styles.statusVal, { color: botOn ? '#10b981' : '#6b7280' }]}>
            {botOn ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>iOS status</Text>
          <Text style={[
            styles.statusVal,
            { color: bgStatus === BackgroundTask.BackgroundTaskStatus.Available ? '#10b981' : '#f87171' },
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

      {/* Save */}
      <TouchableOpacity style={[styles.saveBtn, saved && styles.saveBtnSaved]} onPress={save}>
        <Text style={styles.saveBtnTxt}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#030712' },
  content:       { padding: 16, paddingBottom: 60 },
  title:         { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 20, marginTop: 8 },
  section:       { backgroundColor: '#111827', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1f2937' },
  sectionTitle:  { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontWeight: '600' },
  field:         { marginBottom: 14 },
  fieldLabel:    { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  fieldSub:      { fontSize: 10, color: '#4b5563', marginBottom: 4 },
  fieldInput:    { backgroundColor: '#1f2937', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#374151' },
  monoInput:     { fontVariant: ['tabular-nums'], fontSize: 12 },
  row:           { flexDirection: 'row' },
  secondaryBtn:  { backgroundColor: '#1f2937', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  secondaryBtnTxt: { color: '#9ca3af', fontSize: 13 },
  infoBox:       { backgroundColor: '#0d1117', borderRadius: 8, padding: 10, marginTop: 8 },
  infoTxt:       { color: '#10b981', fontSize: 12, marginBottom: 4 },
  ownerTxt:      { color: '#6b7280', fontSize: 10, fontVariant: ['tabular-nums'] },
  toggleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel:   { color: '#d1d5db', fontSize: 14, fontWeight: '500' },
  toggleSub:     { color: '#6b7280', fontSize: 11, marginTop: 2 },
  statusRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, marginTop: 8 },
  statusLabel:   { color: '#9ca3af', fontSize: 11 },
  statusVal:     { fontSize: 11, fontWeight: '600' },
  saveBtn:       { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnSaved:  { backgroundColor: '#065f46' },
  saveBtnTxt:    { color: '#fff', fontWeight: '700', fontSize: 15 },
});
