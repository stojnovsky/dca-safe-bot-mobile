import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, Switch,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getConfig, saveConfig, getPrivateKey, savePrivateKey, getCoinGeckoKey, saveCoinGeckoKey } from '@/lib/config-store';
import { getPublicClient } from '@/lib/safe';
import { SAFE_ABI, DEFAULT_RPC } from '@/lib/constants';
import { unregisterDcaTask, registerDcaTask } from '@/tasks/dca-task';
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
  const [config,  setConfig]  = useState<BotConfig>({ safeAddress: '', rpcUrl: DEFAULT_RPC, dailyAmountEth: 5, dailyAmountBtc: 5, profitThreshold: 5 });
  const [pk,      setPk]      = useState('');
  const [cgKey,   setCgKey]   = useState('');
  const [botOn,   setBotOn]   = useState(true);
  const [saved,   setSaved]   = useState(false);
  const [safeInfo, setSafeInfo] = useState<{ owners: string[]; threshold: number } | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [cfg, storedPk, storedCg] = await Promise.all([
        getConfig(), getPrivateKey(), getCoinGeckoKey(),
      ]);
      setConfig(cfg);
      if (storedPk) setPk(storedPk);
      if (storedCg) setCgKey(storedCg);
    })();
  }, []));

  const save = async () => {
    try {
      await saveConfig(config);
      if (pk) await savePrivateKey(pk);
      if (cgKey) await saveCoinGeckoKey(cgKey);
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
    if (on) await registerDcaTask();
    else    await unregisterDcaTask();
  };

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

      {/* CoinGecko */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CoinGecko (Simulation)</Text>
        <Field label="Pro API Key" sub="Stored in iOS Keychain" placeholder="CG-…" value={cgKey} onChangeText={setCgKey} secureTextEntry />
      </View>

      {/* Background bot toggle */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Background Bot</Text>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Hourly background check</Text>
            <Text style={styles.toggleSub}>iOS runs at ~1 hour intervals (battery dependent)</Text>
          </View>
          <Switch value={botOn} onValueChange={toggleBot} thumbColor="#3b82f6" trackColor={{ true: '#1e3a8a', false: '#374151' }} />
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
  toggleSub:     { color: '#6b7280', fontSize: 11, marginTop: 2, maxWidth: 260 },
  saveBtn:       { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnSaved:  { backgroundColor: '#065f46' },
  saveBtnTxt:    { color: '#fff', fontWeight: '700', fontSize: 15 },
});
