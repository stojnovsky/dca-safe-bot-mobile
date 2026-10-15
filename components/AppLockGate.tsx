import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PinPad from '@/components/PinPad';
import {
  getAppLockPrefs,
  getBiometricLabel,
  isAppLockEnabled,
  lockSession,
  unlockWithBiometrics,
  unlockWithPin,
  useAppLockSession,
} from '@/lib/app-lock';
import { colors, fonts } from '@/lib/theme';

/**
 * Full-screen privacy gate. Renders as an absolute overlay above the app tree
 * whenever App Lock is enabled and the in-memory session is locked.
 * Background DCA is unaffected — this is UI-only.
 */
export default function AppLockGate({ children }: { children: React.ReactNode }) {
  const { locked, loading } = useAppLockSession();
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [bioLabel, setBioLabel] = useState('Biometrics');
  const [bioEnabled, setBioEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const appState = useRef(AppState.currentState);
  const bioPrompted = useRef(false);

  // Relock when the app fully backgrounds (not on inactive — Face ID /
  // Control Center briefly set inactive and would fight the biometric sheet).
  useEffect(() => {
    const onChange = async (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (prev !== 'background' && next === 'background') {
        if (await isAppLockEnabled()) {
          lockSession();
          bioPrompted.current = false;
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  // Refresh biometric affordance whenever the lock screen appears.
  useEffect(() => {
    if (!locked) return;
    let alive = true;
    (async () => {
      const prefs = await getAppLockPrefs();
      if (!alive) return;
      setBioEnabled(prefs.biometric);
      if (prefs.biometric) {
        setBioLabel(await getBiometricLabel());
      }
    })();
    return () => { alive = false; };
  }, [locked]);

  const tryBiometric = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlockWithBiometrics();
      if (!ok) {
        // User cancelled or failed — stay on PIN pad, no scary error.
      }
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // Auto-prompt biometrics once per lock.
  useEffect(() => {
    if (!locked || !bioEnabled || bioPrompted.current) return;
    bioPrompted.current = true;
    const t = setTimeout(() => { tryBiometric().catch(() => undefined); }, 350);
    return () => clearTimeout(t);
  }, [locked, bioEnabled, tryBiometric]);

  const onPin = useCallback(async (pin: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlockWithPin(pin);
      if (!ok) {
        setError('Incorrect passcode');
        setResetKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <View style={styles.root}>
      {children}
      {!loading && locked ? (
        <View style={styles.overlay} accessibilityViewIsModal>
          <PinPad
            title="Enter passcode"
            subtitle="Unlock to open Medit"
            error={error}
            onComplete={onPin}
            resetKey={resetKey}
            footer={
              bioEnabled ? (
                <TouchableOpacity
                  onPress={() => { tryBiometric().catch(() => undefined); }}
                  disabled={busy}
                  style={styles.bioBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Unlock with ${bioLabel}`}
                >
                  <Text style={styles.bioTxt}>Unlock with {bioLabel}</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 1000,
    elevation: 1000,
  },
  bioBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  bioTxt: {
    color: colors.brand,
    fontSize: 15,
    fontFamily: fonts.sansSemi,
    fontWeight: '600',
  },
});
