import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

const KEY_ENABLED   = 'app_lock_enabled';
const KEY_BIOMETRIC = 'app_lock_biometric';
const PIN_STORE_KEY = 'app_lock_pin_v1';

const PIN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const PIN_LENGTH = 6;

// ── Types ──────────────────────────────────────────────────────────────────

interface PinRecord {
  salt: string;
  hash: string;
}

export type BiometricAvailability =
  | 'available'
  | 'no_hardware'
  | 'not_enrolled'
  | 'unavailable';

export interface AppLockPrefs {
  enabled: boolean;
  biometric: boolean;
  hasPin: boolean;
}

// ── In-memory session ──────────────────────────────────────────────────────

let sessionUnlocked = false;

type SessionListener = (unlocked: boolean) => void;
const sessionListeners = new Set<SessionListener>();

type PrefsListener = (prefs: AppLockPrefs) => void;
const prefsListeners = new Set<PrefsListener>();

function notifySession(): void {
  const v = sessionUnlocked;
  sessionListeners.forEach((l) => { try { l(v); } catch { /* ignore */ } });
}

async function notifyPrefs(): Promise<void> {
  const prefs = await getAppLockPrefs();
  prefsListeners.forEach((l) => { try { l(prefs); } catch { /* ignore */ } });
}

export function isSessionUnlocked(): boolean {
  return sessionUnlocked;
}

export function unlockSession(): void {
  if (sessionUnlocked) return;
  sessionUnlocked = true;
  notifySession();
}

export function lockSession(): void {
  if (!sessionUnlocked) return;
  sessionUnlocked = false;
  notifySession();
}

export function subscribeSession(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

export function subscribePrefs(listener: PrefsListener): () => void {
  prefsListeners.add(listener);
  return () => { prefsListeners.delete(listener); };
}

// ── PIN hashing ────────────────────────────────────────────────────────────

function isSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

async function readPinRecord(): Promise<PinRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(PIN_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PinRecord;
    if (!parsed?.salt || !parsed?.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePinRecord(record: PinRecord): Promise<void> {
  await SecureStore.setItemAsync(PIN_STORE_KEY, JSON.stringify(record), PIN_OPTIONS);
}

async function clearPinRecord(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_STORE_KEY);
}

// ── Prefs ──────────────────────────────────────────────────────────────────

export async function getAppLockPrefs(): Promise<AppLockPrefs> {
  const [enabledRaw, bioRaw, pin] = await Promise.all([
    AsyncStorage.getItem(KEY_ENABLED),
    AsyncStorage.getItem(KEY_BIOMETRIC),
    readPinRecord(),
  ]);
  return {
    enabled:   enabledRaw === '1',
    biometric: bioRaw === '1',
    hasPin:    !!pin,
  };
}

export async function isAppLockEnabled(): Promise<boolean> {
  const prefs = await getAppLockPrefs();
  return prefs.enabled && prefs.hasPin;
}

/** Call once at startup: if lock is on, require unlock before showing the UI. */
let sessionInitialized = false;

export async function initAppLockSession(): Promise<boolean> {
  if (sessionInitialized) return sessionUnlocked;
  sessionInitialized = true;
  const on = await isAppLockEnabled();
  sessionUnlocked = !on;
  notifySession();
  return sessionUnlocked;
}

export async function enableAppLock(pin: string): Promise<void> {
  if (!isSixDigitPin(pin)) throw new Error('PIN must be exactly 6 digits');
  const salt = randomUUID();
  const hash = await hashPin(pin, salt);
  await writePinRecord({ salt, hash });
  await AsyncStorage.setItem(KEY_ENABLED, '1');
  unlockSession();
  await notifyPrefs();
}

export async function changePin(currentPin: string, nextPin: string): Promise<boolean> {
  if (!isSixDigitPin(nextPin)) throw new Error('PIN must be exactly 6 digits');
  const ok = await verifyPin(currentPin);
  if (!ok) return false;
  const salt = randomUUID();
  const hash = await hashPin(nextPin, salt);
  await writePinRecord({ salt, hash });
  await notifyPrefs();
  return true;
}

export async function disableAppLock(pinOrBiometric: 'biometric' | string): Promise<boolean> {
  if (pinOrBiometric === 'biometric') {
    const ok = await authenticateWithBiometrics('Confirm to turn off App Lock');
    if (!ok) return false;
  } else {
    const ok = await verifyPin(pinOrBiometric);
    if (!ok) return false;
  }
  await clearPinRecord();
  await AsyncStorage.multiSet([
    [KEY_ENABLED, '0'],
    [KEY_BIOMETRIC, '0'],
  ]);
  unlockSession();
  await notifyPrefs();
  return true;
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!isSixDigitPin(pin)) return false;
  const record = await readPinRecord();
  if (!record) return false;
  const hash = await hashPin(pin, record.salt);
  return hash === record.hash;
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  if (on) {
    const availability = await getBiometricAvailability();
    if (availability !== 'available') {
      throw new Error(biometricUnavailableMessage(availability));
    }
  }
  await AsyncStorage.setItem(KEY_BIOMETRIC, on ? '1' : '0');
  await notifyPrefs();
}

// ── Biometrics ─────────────────────────────────────────────────────────────

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return 'no_hardware';
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return 'not_enrolled';
    return 'available';
  } catch {
    return 'unavailable';
  }
}

export function biometricUnavailableMessage(status: BiometricAvailability): string {
  switch (status) {
    case 'no_hardware':
      return 'This device does not support Face ID or fingerprint unlock.';
    case 'not_enrolled':
      return Platform.OS === 'ios'
        ? 'No Face ID or Touch ID is set up. Add one in iOS Settings, then try again.'
        : 'No biometric unlock is set up. Add a fingerprint or face unlock in system Settings, then try again.';
    default:
      return 'Biometric unlock is unavailable right now.';
  }
}

export async function getBiometricLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const hasFinger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    if (Platform.OS === 'ios') {
      if (hasFace) return 'Face ID';
      if (hasFinger) return 'Touch ID';
    }
    if (hasFace && hasFinger) return 'Biometrics';
    if (hasFace) return 'Face unlock';
    if (hasFinger) return 'Fingerprint';
  } catch { /* fall through */ }
  return 'Biometrics';
}

export async function authenticateWithBiometrics(
  promptMessage = 'Unlock Medit',
): Promise<boolean> {
  const availability = await getBiometricAvailability();
  if (availability !== 'available') return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use passcode',
      disableDeviceFallback: true,
      // Avoid iOS passcode sheet — app PIN is the fallback.
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Unlock via PIN or biometric. On success, marks the in-memory session unlocked.
 */
export async function unlockWithPin(pin: string): Promise<boolean> {
  const ok = await verifyPin(pin);
  if (ok) unlockSession();
  return ok;
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const prefs = await getAppLockPrefs();
  if (!prefs.enabled || !prefs.biometric) return false;
  const ok = await authenticateWithBiometrics();
  if (ok) unlockSession();
  return ok;
}

// ── React hooks ────────────────────────────────────────────────────────────

export function useAppLockPrefs(): AppLockPrefs & { loading: boolean; refresh: () => Promise<void> } {
  const [prefs, setPrefs] = useState<AppLockPrefs>({
    enabled: false,
    biometric: false,
    hasPin: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getAppLockPrefs();
    setPrefs(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return subscribePrefs((p) => setPrefs(p));
  }, [refresh]);

  return { ...prefs, loading, refresh };
}

export function useAppLockSession(): {
  locked: boolean;
  loading: boolean;
} {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      const on = await isAppLockEnabled();
      if (!alive) return;
      setLocked(on && !isSessionUnlocked());
    };

    (async () => {
      try {
        await initAppLockSession();
        if (!alive) return;
        await sync();
      } catch {
        // Keychain failures must not escape startup. The gate stays open.
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const unsubSession = subscribeSession(() => { sync().catch(() => undefined); });
    const unsubPrefs = subscribePrefs(() => { sync().catch(() => undefined); });

    return () => {
      alive = false;
      unsubSession();
      unsubPrefs();
    };
  }, []);

  return { locked, loading };
}
