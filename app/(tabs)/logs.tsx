import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getBotLogs, clearBotLogs, type BotRunLog } from '@/lib/log-store';
import type { RunResult } from '@/lib/dca-runner';

export default function LogsScreen() {
  const [logs,       setLogs]       = useState<BotRunLog[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [expanded,   setExpanded]   = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await getBotLogs(200));
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onClear = () => {
    Alert.alert(
      'Clear all logs?',
      'This will permanently delete all bot run history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearBotLogs();
            refresh();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#3b82f6" />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Bot Logs</Text>
          <Text style={styles.sub}>{logs.length} run{logs.length !== 1 ? 's' : ''}</Text>
        </View>
        {logs.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
            <Text style={styles.clearTxt}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {logs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No runs yet</Text>
          <Text style={styles.emptyTxt}>
            Tap "Run DCA Now" on the Portfolio tab or wait for the next background run. Each run will appear here.
          </Text>
        </View>
      ) : (
        logs.map((log) => (
          <LogCard
            key={log.id}
            log={log}
            expanded={expanded.has(log.id)}
            onToggle={() => toggle(log.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

function LogCard({ log, expanded, onToggle }: { log: BotRunLog; expanded: boolean; onToggle: () => void }) {
  const result = parseDetails(log.details);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onToggle} style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.timeTxt}>{formatTime(log.timestamp)}</Text>
          <Text style={styles.dateTxt}>{formatDate(log.timestamp)}</Text>
        </View>
        <View style={styles.badges}>
          <Badge label={log.source === 'manual' ? 'Manual' : 'Auto'}
                 color={log.source === 'manual' ? '#3b82f6' : '#8b5cf6'} />
          <Badge label={log.status.toUpperCase()} color={statusColor(log.status)} />
        </View>
      </View>

      <View style={styles.metaRow}>
        {log.buys > 0  && <Stat label="buys"   value={log.buys}   color="#10b981" />}
        {log.sells > 0 && <Stat label="sells"  value={log.sells}  color="#3b82f6" />}
        {log.errors > 0 && <Stat label="errors" value={log.errors} color="#f87171" />}
        {log.message && <Text style={styles.msg} numberOfLines={expanded ? undefined : 1}>{log.message}</Text>}
      </View>

      {expanded && result && (
        <View style={styles.details}>
          {result.buys.map((b, i) => (
            <DetailLine
              key={`b-${i}`}
              prefix={`BUY  ${b.asset}`}
              value={`${b.assetAmount.toFixed(b.asset === 'BTC' ? 6 : 4)} @ $${fmt(b.price)}`}
              hash={b.txHash}
            />
          ))}
          {result.sells.map((s, i) => (
            <DetailLine
              key={`s-${i}`}
              prefix={`SELL ${s.asset}`}
              value={`+$${fmt(s.usdcReceived)} (${s.profitPct >= 0 ? '+' : ''}${fmt(s.profitPct)}%)`}
              hash={s.txHash}
            />
          ))}
          {result.errors.map((e, i) => (
            <Text key={`e-${i}`} style={styles.errLine}>{e}</Text>
          ))}
        </View>
      )}

      {expanded && !result && log.details && (
        <View style={styles.details}>
          <Text style={styles.errLine}>{log.details}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailLine({ prefix, value, hash }: { prefix: string; value: string; hash: string }) {
  return (
    <TouchableOpacity
      style={styles.detailRow}
      onPress={() => hash && Linking.openURL(`https://basescan.org/tx/${hash}`)}
      disabled={!hash}
    >
      <Text style={styles.detailPrefix}>{prefix}</Text>
      <Text style={styles.detailValue}>{value}</Text>
      {hash ? <Text style={styles.detailLink}>↗</Text> : null}
    </TouchableOpacity>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.badgeTxt, { color }]}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function parseDetails(details: string | null): RunResult | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    if (parsed && Array.isArray(parsed.buys) && Array.isArray(parsed.sells) && Array.isArray(parsed.errors)) {
      return parsed as RunResult;
    }
    return null;
  } catch {
    return null;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'ok':      return '#10b981';
    case 'error':   return '#f87171';
    case 'skipped': return '#6b7280';
    default:        return '#9ca3af';
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmt(n: number, dp = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: '#030712' },
  content:      { padding: 16, paddingBottom: 40 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, marginTop: 8 },
  title:        { fontSize: 20, fontWeight: '700', color: '#fff' },
  sub:          { fontSize: 11, color: '#4b5563', marginTop: 2 },
  clearBtn:     { backgroundColor: '#1f2937', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  clearTxt:     { color: '#9ca3af', fontSize: 12 },

  empty:        { backgroundColor: '#0f1729', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937' },
  emptyTitle:   { color: '#9ca3af', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  emptyTxt:     { color: '#4b5563', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  card:         { backgroundColor: '#0f1729', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' },
  row:          { flexDirection: 'row', alignItems: 'flex-start' },
  timeTxt:      { color: '#fff', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dateTxt:      { color: '#6b7280', fontSize: 11, marginTop: 1 },

  badges:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  badgeTxt:     { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  metaRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 14, flexWrap: 'wrap' },
  stat:         { alignItems: 'flex-start' },
  statVal:      { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLbl:      { color: '#4b5563', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  msg:          { color: '#9ca3af', fontSize: 11, flex: 1, lineHeight: 16 },

  details:      { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1f2937', gap: 6 },
  detailRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailPrefix: { color: '#9ca3af', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  detailValue:  { color: '#e5e7eb', fontSize: 11, flex: 1, fontVariant: ['tabular-nums'] },
  detailLink:   { color: '#3b82f6', fontSize: 12 },
  errLine:      { color: '#fca5a5', fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
});
