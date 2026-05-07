import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { BotConfig } from './types';
import { DEFAULT_RPC } from './constants';

const CONFIG_KEY   = 'bot_config';
const PK_KEY       = 'bot_private_key';
const CG_KEY_STORE = 'coingecko_pro_key';

const DEFAULT_CONFIG: BotConfig = {
  safeAddress:     '',
  rpcUrl:          DEFAULT_RPC,
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
  await SecureStore.setItemAsync(PK_KEY, pk);
}

export async function getCoinGeckoKey(): Promise<string | null> {
  return SecureStore.getItemAsync(CG_KEY_STORE);
}

export async function saveCoinGeckoKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(CG_KEY_STORE, key);
}
