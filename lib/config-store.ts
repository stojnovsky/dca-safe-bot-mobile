import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import type { BotConfig } from './types';
import { DEFAULT_RPC, DEFAULT_PRICES_API_URL } from './constants';

const CONFIG_KEY            = 'bot_config';
const PK_KEY                = 'bot_private_key';
const PK_MIGRATED_FLAG      = 'pk_acl_migrated_v1';
const ONBOARDING_DRAFT_KEY  = 'onboarding_draft_v1';

// iOS Keychain accessibility class for the bot's private key.
//
// `WHEN_UNLOCKED` (the SecureStore default) cannot be read while the device is
// locked, so the BGProcessingTask fails with errSecInteractionNotAllowed:
//   "User interaction is not allowed".
//
// `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` is the right tier for background tasks:
//   - readable any time the device has been unlocked at least once since boot
//   - the key never syncs via iCloud Keychain (mandatory for wallet secrets)
const PK_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const DEFAULT_CONFIG: BotConfig = {
  safeAddress:     '',
  rpcUrl:          DEFAULT_RPC,
  pricesApiUrl:    DEFAULT_PRICES_API_URL,
  dailyAmountEth:  5,
  dailyAmountBtc:  5,
  profitThresholdEth: 5,
  profitThresholdBtc: 5,
  stopLossEnabled: false,
  stopLossPctEth:  10,
  stopLossPctBtc:  10,
  reopenEnabled:   false,
  reopenDownPctEth: 5,
  reopenDownPctBtc: 5,
  showLogsTab:     false,
  gamifyPositions: true,
};

// ── Reactive subscription so the tabbar (or any other screen) can re-render
//    when settings change without polling.
type ConfigListener = (cfg: BotConfig) => void;
const listeners = new Set<ConfigListener>();

export function subscribeConfig(listener: ConfigListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * React hook returning the latest BotConfig with automatic re-render on every
 * `saveConfig`. Returns `null` until the first load resolves so callers can
 * distinguish "loading" from "defaults".
 */
export function useConfig(): BotConfig | null {
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  useEffect(() => {
    let alive = true;
    getConfig().then((c) => { if (alive) setCfg(c); });
    const unsub = subscribeConfig((c) => setCfg(c));
    return () => { alive = false; unsub(); };
  }, []);
  return cfg;
}

export async function getConfig(): Promise<BotConfig> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged: BotConfig = { ...DEFAULT_CONFIG, ...parsed } as BotConfig;

    const pt = parsed.profitThreshold;
    if (typeof pt === 'number' && parsed.profitThresholdEth === undefined && parsed.profitThresholdBtc === undefined) {
      merged.profitThresholdEth = pt;
      merged.profitThresholdBtc = pt;
    }

    const sl = parsed.stopLossPct;
    if (typeof sl === 'number' && parsed.stopLossPctEth === undefined && parsed.stopLossPctBtc === undefined) {
      merged.stopLossPctEth = sl;
      merged.stopLossPctBtc = sl;
    }

    const ro = parsed.reopenDownPct;
    if (typeof ro === 'number' && parsed.reopenDownPctEth === undefined && parsed.reopenDownPctBtc === undefined) {
      merged.reopenDownPctEth = ro;
      merged.reopenDownPctBtc = ro;
    }

    return merged;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<BotConfig>): Promise<void> {
  const current = await getConfig();
  const merged  = { ...current, ...config };
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  listeners.forEach((l) => { try { l(merged); } catch { /* ignore listener errors */ } });
}

export async function getPrivateKey(): Promise<string | null> {
  return SecureStore.getItemAsync(PK_KEY);
}

export async function savePrivateKey(pk: string): Promise<void> {
  await SecureStore.setItemAsync(PK_KEY, pk, PK_OPTIONS);
}

/**
 * One-shot migration: re-save any key that was stored with the old
 * `WHEN_UNLOCKED` accessibility under the new `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`
 * class so it can be read by the BGProcessingTask while the screen is locked.
 *
 * Must be called from a foreground (device-unlocked) context — typically from
 * `app/_layout.tsx` on mount. Safe to call on every launch: it's a no-op once
 * the migration flag is set.
 */
export async function migrateKeychainAccessibility(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(PK_MIGRATED_FLAG)) return;

    const pk = await SecureStore.getItemAsync(PK_KEY);
    if (pk) {
      await SecureStore.deleteItemAsync(PK_KEY);
      await SecureStore.setItemAsync(PK_KEY, pk, PK_OPTIONS);
    }

    await AsyncStorage.setItem(PK_MIGRATED_FLAG, '1');
  } catch {
    // Best-effort — if migration fails we'll retry on the next launch.
  }
}

export async function getPricesApiUrl(): Promise<string> {
  return (await getConfig()).pricesApiUrl || DEFAULT_PRICES_API_URL;
}

/**
 * Persistence for an in-progress onboarding session. The wizard generates the
 * signer key and a CREATE2 salt up-front, then asks the user to fund both
 * the signer (ETH) and the *predicted* Safe address (USDC). If the user
 * closes the app between funding and deployment, we MUST be able to resume
 * with the same key / nonce — otherwise the USDC they already sent becomes
 * unreachable.
 */
export interface OnboardingDraft {
  saltNonce:    string;  // bigint serialized as decimal string
  safeAddress:  string;  // predicted CREATE2 address
  signerAddress:string;
}

export async function saveOnboardingDraft(d: OnboardingDraft): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(d));
}

export async function getOnboardingDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

export async function clearOnboardingDraft(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
}
