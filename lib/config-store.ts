import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { BotConfig } from './types';
import { DEFAULT_RPC, DEFAULT_PRICES_API_URL } from './constants';

const CONFIG_KEY        = 'bot_config';
const PK_KEY            = 'bot_private_key';
const PK_MIGRATED_FLAG  = 'pk_acl_migrated_v1';

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
  profitThreshold: 5,
};

export async function getConfig(): Promise<BotConfig> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<BotConfig>): Promise<void> {
  const current = await getConfig();
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...config }));
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
