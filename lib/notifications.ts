import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import type { RunResult } from './dca-runner';

const KEY_ENABLED  = 'notifications_enabled';
const KEY_PROMPTED = 'notifications_prompted_v1';

const DCA_CATEGORY  = 'DCA_RUN';
const ANDROID_CHANNEL = 'dca-events';
const PORTFOLIO_DEEP_LINK = 'dcabot://portfolio';

// ── Types ──────────────────────────────────────────────────────────────────

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type DcaNotificationVariant =
  | 'success'      // buys (and possibly sells) succeeded
  | 'take_profit'  // sells only
  | 'partial'      // mix of success + errors
  | 'skip'         // skipped due to insufficient USDC
  | 'error';       // run failed

export interface DcaNotificationPayload extends Record<string, unknown> {
  deepLink: string;
  variant: DcaNotificationVariant;
  buys: number;
  sells: number;
  errors: number;
  date: string;
}

// ── Foreground handler + channels + categories ────────────────────────────

let configured = false;

/**
 * One-time setup of the foreground-presentation handler, the Android channel
 * and the iOS notification category (action buttons). Safe to call repeatedly.
 * Call from app/_layout.tsx on mount.
 */
export async function configureNotificationHandler(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // expo-notifications ≥0.28 uses `shouldShowBanner`/`shouldShowList`;
      // the old `shouldShowAlert` is still accepted for back-compat and
      // suppresses a deprecation warning on iOS.
      shouldShowAlert:  true,
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name:                 'DCA bot events',
      description:          'Buys, take-profits and errors from the background DCA task.',
      importance:           Notifications.AndroidImportance.DEFAULT,
      sound:                'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate:        true,
    });
  }

  await Notifications.setNotificationCategoryAsync(DCA_CATEGORY, [
    { identifier: 'VIEW_PORTFOLIO', buttonTitle: 'View Portfolio', options: { opensAppToForeground: true  } },
    { identifier: 'DISMISS',        buttonTitle: 'Dismiss',        options: { opensAppToForeground: false } },
  ]);
}

// ── Permissions ────────────────────────────────────────────────────────────

export async function getNotificationPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionStatus;
}

/**
 * Ask the OS for notification permission. Idempotent — returns 'granted'
 * immediately if already granted, 'denied' if the user has previously denied
 * and the OS won't show the prompt again.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted')   return 'granted';
  if (!existing.canAskAgain)           return 'denied';

  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status as PermissionStatus;
}

/** Deep-link the user into the OS Settings page for this app. */
export function openSystemSettings(): Promise<void> {
  return Linking.openSettings();
}

// ── Enable/disable toggle (Settings tab) ───────────────────────────────────

type EnabledListener = (enabled: boolean) => void;
const enabledListeners = new Set<EnabledListener>();

export async function getNotificationsEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY_ENABLED);
  return raw === '1';
}

export async function setNotificationsEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_ENABLED, on ? '1' : '0');
  enabledListeners.forEach((l) => { try { l(on); } catch { /* ignore */ } });
}

/**
 * Reactive hook for the Settings toggle. Also exposes the live OS permission
 * status so the UI can show an "Open Settings" CTA when the OS has denied us.
 */
export function useNotificationsState(): {
  enabled:    boolean;
  permission: PermissionStatus;
  loading:    boolean;
  refresh:    () => Promise<void>;
} {
  const [enabled,    setEnabled]    = useState(false);
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [loading,    setLoading]    = useState(true);

  const refresh = useCallback(async () => {
    const [v, p] = await Promise.all([getNotificationsEnabled(), getNotificationPermission()]);
    setEnabled(v);
    setPermission(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const l: EnabledListener = (on) => setEnabled(on);
    enabledListeners.add(l);
    return () => { enabledListeners.delete(l); };
  }, [refresh]);

  return { enabled, permission, loading, refresh };
}

// ── Onboarding prompt ──────────────────────────────────────────────────────

/**
 * Ask once, right after onboarding finishes. Safe to call on every "Finish"
 * — the persisted flag makes subsequent calls no-ops, so the user is never
 * re-prompted (they can flip the Settings toggle later to recover from a
 * denial via Linking.openSettings).
 */
export async function maybePromptForNotificationPermission(): Promise<PermissionStatus | 'skipped'> {
  try {
    const already = await AsyncStorage.getItem(KEY_PROMPTED);
    if (already) return 'skipped';

    const status = await requestNotificationPermission();
    await AsyncStorage.setItem(KEY_PROMPTED, '1');

    if (status === 'granted') {
      await setNotificationsEnabled(true);
    }
    return status;
  } catch (e) {
    console.warn('[notifications] permission prompt failed', e);
    return 'skipped';
  }
}

// ── Composing + scheduling ────────────────────────────────────────────────

/** Raw immediate local notification. Exposed as a primitive escape hatch. */
export async function sendLocalNotification(
  title: string,
  body:  string,
  data:  Record<string, unknown> = {},
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data:               { deepLink: PORTFOLIO_DEEP_LINK, ...data },
      sound:              'default',
      categoryIdentifier: DCA_CATEGORY,
      // Android: route through the dca-events channel
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
    trigger: null, // fire immediately
  });
}

// Patterns used to classify entries in result.errors[]. The runner concatenates
// raw strings ("Already bought ETH today, skipping", "Insufficient USDC in
// Safe: have $… need $…", etc.) — keep regexes in sync with lib/dca-runner.ts.
const INFO_ERROR_PATTERNS = [/^Already bought (ETH|BTC) today/i];
const LOW_FUNDS_PATTERN   = /^Insufficient USDC/i;

function classifyErrors(errors: string[]): { info: string[]; lowFunds: string[]; real: string[] } {
  const info:     string[] = [];
  const lowFunds: string[] = [];
  const real:     string[] = [];
  for (const e of errors) {
    if      (INFO_ERROR_PATTERNS.some((re) => re.test(e))) info.push(e);
    else if (LOW_FUNDS_PATTERN.test(e))                    lowFunds.push(e);
    else                                                   real.push(e);
  }
  return { info, lowFunds, real };
}

function fmtAmount(n: number): string {
  if (n >= 1)    return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toFixed(6);
}

function summarizeBuys(buys: RunResult['buys']): string {
  return buys.map((b) => `${fmtAmount(b.assetAmount)} ${b.asset}`).join(' + ');
}

function summarizeSells(sells: RunResult['sells']): string {
  return sells.map((s) => {
    const sign = s.profitPct >= 0 ? '+' : '';
    return `${s.asset} → $${s.usdcReceived.toFixed(2)} (${sign}${s.profitPct.toFixed(1)}%)`;
  }).join(', ');
}

interface ComposedMessage {
  title:   string;
  body:    string;
  payload: DcaNotificationPayload;
}

/**
 * Pure function: maps a RunResult to a notification payload, or null if the
 * run is a no-op (suppression rule). Exported so the BG task can call it
 * deterministically and so it's unit-testable.
 */
export function composeDcaRunNotification(result: RunResult): ComposedMessage | null {
  const { lowFunds, real } = classifyErrors(result.errors);
  const buys  = result.buys.length;
  const sells = result.sells.length;

  // Suppression: nothing happened and no actionable error
  if (buys === 0 && sells === 0 && lowFunds.length === 0 && real.length === 0) {
    return null;
  }

  let variant: DcaNotificationVariant;
  let title:   string;
  let body:    string;

  if (buys > 0 && sells > 0 && real.length === 0) {
    variant = 'success';
    title   = '💸 DCA executed';
    body    = `Bought ${summarizeBuys(result.buys)} · Sold ${summarizeSells(result.sells)}`;
  } else if (buys > 0 && sells === 0 && real.length === 0) {
    variant = 'success';
    title   = '🟢 DCA executed';
    body    = `Bought ${summarizeBuys(result.buys)}`;
  } else if (buys === 0 && sells > 0 && real.length === 0) {
    variant = 'take_profit';
    title   = '💰 Take-profit triggered';
    body    = `Sold ${summarizeSells(result.sells)}`;
  } else if (buys === 0 && sells === 0 && lowFunds.length > 0 && real.length === 0) {
    variant = 'skip';
    title   = '⚠️ DCA skipped';
    body    = 'Insufficient USDC in Safe — top up to keep DCA running.';
  } else if (buys === 0 && sells === 0 && real.length > 0) {
    variant = 'error';
    title   = '❌ DCA run failed';
    body    = `${real.length} error${real.length === 1 ? '' : 's'} — tap to check the app.`;
  } else {
    variant = 'partial';
    title   = '⚠️ DCA partially executed';
    const parts: string[] = [];
    if (buys  > 0) parts.push(`Bought ${summarizeBuys(result.buys)}`);
    if (sells > 0) parts.push(`Sold ${summarizeSells(result.sells)}`);
    if (real.length > 0) parts.push(`${real.length} error${real.length === 1 ? '' : 's'}`);
    body = parts.join(' · ');
  }

  return {
    title,
    body,
    payload: {
      deepLink: PORTFOLIO_DEEP_LINK,
      variant,
      buys,
      sells,
      errors: real.length,
      date:   result.date,
    },
  };
}

/**
 * Public entry from the DCA background task. Respects the user's opt-out,
 * suppresses no-op runs, and never throws — a notification failure must
 * never propagate up into the task result.
 */
export async function sendDcaRunNotification(result: RunResult): Promise<void> {
  try {
    if (!(await getNotificationsEnabled())) return;
    if ((await getNotificationPermission()) !== 'granted') return;

    const composed = composeDcaRunNotification(result);
    if (!composed) return;

    await sendLocalNotification(composed.title, composed.body, composed.payload);
  } catch (e) {
    console.warn('[notifications] sendDcaRunNotification failed', e);
  }
}

// ── Deep-link listener ─────────────────────────────────────────────────────

/**
 * Wires notification taps to a navigation callback. Handles all three states:
 *
 *   - foreground  : addNotificationResponseReceivedListener fires immediately
 *   - background  : same listener fires when the user taps and the app
 *                   transitions to foreground
 *   - quit / cold : getLastNotificationResponseAsync recovers the tap that
 *                   launched the app
 *
 * The "Dismiss" action button is filtered out so it doesn't navigate.
 * Returns a cleanup function — call from a useEffect.
 */
export function attachNotificationListeners(onOpen: () => void): () => void {
  const handle = (response: Notifications.NotificationResponse) => {
    try {
      if (response?.actionIdentifier === 'DISMISS') return;
      onOpen();
    } catch (e) {
      console.warn('[notifications] tap handler failed', e);
    }
  };

  const sub = Notifications.addNotificationResponseReceivedListener(handle);

  // Cold-start: app launched from a notification tap while it was killed.
  let coldStartHandled = false;
  (async () => {
    try {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response && !coldStartHandled) {
        coldStartHandled = true;
        // give the navigator a tick to mount the tab tree
        setTimeout(() => handle(response), 0);
      }
    } catch {
      /* ignore */
    }
  })();

  return () => sub.remove();
}
