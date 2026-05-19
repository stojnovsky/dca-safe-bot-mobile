import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { saveConfig } from '@/lib/config-store';
import type { BotConfig } from '@/lib/types';
import { colors, switchColors } from '@/lib/theme';

function parsePos(v: string, fallback: number): number {
  const n = parseFloat(v);
  return !isNaN(n) && n > 0 ? n : fallback;
}

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

function draftFromConfig(cfg: BotConfig): NumDraft {
  return {
    dailyAmountEth: String(cfg.dailyAmountEth),
    dailyAmountBtc: String(cfg.dailyAmountBtc),
    profitThresholdEth: String(cfg.profitThresholdEth ?? 5),
    profitThresholdBtc: String(cfg.profitThresholdBtc ?? 5),
    stopLossPctEth: String(cfg.stopLossPctEth ?? 10),
    stopLossPctBtc: String(cfg.stopLossPctBtc ?? 10),
    reopenDownPctEth: String(cfg.reopenDownPctEth ?? 5),
    reopenDownPctBtc: String(cfg.reopenDownPctBtc ?? 5),
  };
}

function Field({
  label, sub, value, onChangeText, placeholder, mono,
}: {
  label: string;
  sub?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {sub ? <Text style={styles.fieldSub}>{sub}</Text> : null}
      <TextInput
        style={[styles.fieldInput, mono && styles.monoInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType="decimal-pad"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

interface Props {
  botConfig: BotConfig;
  /** Called after a successful save so the parent can refresh merged config. */
  onSaved?: () => void;
}

export default function CollapsibleDcaStrategyPanel({ botConfig, onSaved }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [numDraft, setNumDraft] = useState<NumDraft>(() => draftFromConfig(botConfig));
  const [stopLossEnabled, setStopLossEnabled] = useState(botConfig.stopLossEnabled === true);
  const [reopenEnabled, setReopenEnabled] = useState(botConfig.reopenEnabled === true);
  const [saving, setSaving] = useState(false);

  const hydrate = useCallback(() => {
    setNumDraft(draftFromConfig(botConfig));
    setStopLossEnabled(botConfig.stopLossEnabled === true);
    setReopenEnabled(botConfig.reopenEnabled === true);
  }, [botConfig]);

  useEffect(() => {
    if (!expanded) hydrate();
  }, [botConfig, expanded, hydrate]);

  const toggleExpanded = () => {
    setExpanded((e) => {
      if (!e) hydrate();
      return !e;
    });
  };

  const persist = async () => {
    setSaving(true);
    try {
      await saveConfig({
        dailyAmountEth: parsePos(numDraft.dailyAmountEth, botConfig.dailyAmountEth),
        dailyAmountBtc: parsePos(numDraft.dailyAmountBtc, botConfig.dailyAmountBtc),
        profitThresholdEth: parseNonNeg(numDraft.profitThresholdEth, botConfig.profitThresholdEth ?? 5),
        profitThresholdBtc: parseNonNeg(numDraft.profitThresholdBtc, botConfig.profitThresholdBtc ?? 5),
        stopLossEnabled,
        stopLossPctEth: parseNonNeg(numDraft.stopLossPctEth, botConfig.stopLossPctEth ?? 10),
        stopLossPctBtc: parseNonNeg(numDraft.stopLossPctBtc, botConfig.stopLossPctBtc ?? 10),
        reopenEnabled,
        reopenDownPctEth: parseNonNeg(numDraft.reopenDownPctEth, botConfig.reopenDownPctEth ?? 5),
        reopenDownPctBtc: parseNonNeg(numDraft.reopenDownPctBtc, botConfig.reopenDownPctBtc ?? 5),
      });
      onSaved?.();
      Alert.alert('Saved', 'DCA strategy updated.');
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.bar}
        onPress={toggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.barTextCol}>
          <Text style={styles.barTitle}>DCA strategy</Text>
          <Text style={styles.barSub}>Buy · sell · stop-loss · reopen on dip</Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Same settings as Settings → DCA Strategy. Values apply to the next bot run.
          </Text>

          <Text style={styles.groupLabel}>Buy (USDC / day)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="ETH"
                placeholder="5"
                value={numDraft.dailyAmountEth}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, dailyAmountEth: v }))}
              />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Field
                label="BTC"
                placeholder="5"
                value={numDraft.dailyAmountBtc}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, dailyAmountBtc: v }))}
              />
            </View>
          </View>

          <Text style={[styles.groupLabel, { marginTop: 12 }]}>Sell (take-profit %)</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="ETH +%"
                placeholder="5"
                value={numDraft.profitThresholdEth}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, profitThresholdEth: v }))}
              />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Field
                label="BTC +%"
                placeholder="5"
                value={numDraft.profitThresholdBtc}
                onChangeText={(v) => setNumDraft((d) => ({ ...d, profitThresholdBtc: v }))}
              />
            </View>
          </View>

          <View style={[styles.toggleRow, { marginTop: 14 }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.toggleLabel}>Stop-loss</Text>
              <Text style={styles.toggleSub}>Sell if down from buy (per asset). 0% skips that asset.</Text>
            </View>
            <Switch
              value={stopLossEnabled}
              onValueChange={setStopLossEnabled}
              thumbColor={switchColors.thumbColor}
              trackColor={switchColors.trackColor}
            />
          </View>
          {stopLossEnabled ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label="ETH max DD %"
                  placeholder="10"
                  value={numDraft.stopLossPctEth}
                  onChangeText={(v) => setNumDraft((d) => ({ ...d, stopLossPctEth: v }))}
                />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Field
                  label="BTC max DD %"
                  placeholder="10"
                  value={numDraft.stopLossPctBtc}
                  onChangeText={(v) => setNumDraft((d) => ({ ...d, stopLossPctBtc: v }))}
                />
              </View>
            </View>
          ) : null}

          <View style={[styles.toggleRow, { marginTop: 14 }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.toggleLabel}>Reopen on dip</Text>
              <Text style={styles.toggleSub}>Re-open a closed leg after spot drops from last exit.</Text>
            </View>
            <Switch
              value={reopenEnabled}
              onValueChange={setReopenEnabled}
              thumbColor={switchColors.thumbColor}
              trackColor={switchColors.trackColor}
            />
          </View>
          {reopenEnabled ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label="ETH dip %"
                  placeholder="5"
                  value={numDraft.reopenDownPctEth}
                  onChangeText={(v) => setNumDraft((d) => ({ ...d, reopenDownPctEth: v }))}
                />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Field
                  label="BTC dip %"
                  placeholder="5"
                  value={numDraft.reopenDownPctBtc}
                  onChangeText={(v) => setNumDraft((d) => ({ ...d, reopenDownPctBtc: v }))}
                />
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={persist}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryOn} size="small" />
            ) : (
              <Text style={styles.saveBtnTxt}>Save strategy</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceElevated,
  },
  barTextCol: { flex: 1, marginRight: 8 },
  barTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  barSub:   { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  chevron:  { color: colors.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] },
  body:     { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  hint:     { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  groupLabel: { fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  row:      { flexDirection: 'row' },
  field:    { marginBottom: 8 },
  fieldLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 3 },
  fieldSub:   { fontSize: 9, color: colors.textMuted, marginBottom: 3 },
  fieldInput: {
    backgroundColor: colors.inputBg,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monoInput: { fontVariant: ['tabular-nums'], fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: colors.text, fontSize: 13, fontWeight: '600', opacity: 0.9 },
  toggleSub:   { color: colors.textSecondary, fontSize: 10, marginTop: 2, lineHeight: 14 },
  saveBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnTxt: { color: colors.primaryOn, fontWeight: '700', fontSize: 14 },
});
