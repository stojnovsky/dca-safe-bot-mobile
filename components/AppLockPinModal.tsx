import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PinPad from '@/components/PinPad';
import {
  changePin,
  disableAppLock,
  enableAppLock,
  verifyPin,
} from '@/lib/app-lock';
import { colors, fonts } from '@/lib/theme';

export type PinFlowMode = 'setup' | 'confirmDisable' | 'change';

type Props = {
  visible: boolean;
  mode: PinFlowMode;
  onClose: () => void;
  onSuccess: () => void;
};

type Step = 'enter' | 'confirm' | 'current' | 'new' | 'newConfirm';

/**
 * Full-screen modal for setting / changing / confirming the 6-digit app PIN.
 */
export default function AppLockPinModal({ visible, mode, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setFirstPin('');
    setCurrentPin('');
    setResetKey((k) => k + 1);
    if (mode === 'setup') setStep('enter');
    else if (mode === 'confirmDisable') setStep('enter');
    else setStep('current');
  }, [visible, mode]);

  const fail = (msg: string) => {
    setError(msg);
    setResetKey((k) => k + 1);
  };

  const onComplete = useCallback(async (pin: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'setup') {
        if (step === 'enter') {
          setFirstPin(pin);
          setStep('confirm');
          setResetKey((k) => k + 1);
          return;
        }
        if (pin !== firstPin) {
          fail('Passcodes did not match. Try again.');
          setFirstPin('');
          setStep('enter');
          return;
        }
        await enableAppLock(pin);
        onSuccess();
        return;
      }

      if (mode === 'confirmDisable') {
        const ok = await disableAppLock(pin);
        if (!ok) {
          fail('Incorrect passcode');
          return;
        }
        onSuccess();
        return;
      }

      // change
      if (step === 'current') {
        const ok = await verifyPin(pin);
        if (!ok) {
          fail('Incorrect passcode');
          return;
        }
        setCurrentPin(pin);
        setStep('new');
        setResetKey((k) => k + 1);
        return;
      }
      if (step === 'new') {
        setFirstPin(pin);
        setStep('newConfirm');
        setResetKey((k) => k + 1);
        return;
      }
      if (step === 'newConfirm') {
        if (pin !== firstPin) {
          fail('Passcodes did not match. Try again.');
          setFirstPin('');
          setStep('new');
          return;
        }
        const ok = await changePin(currentPin, pin);
        if (!ok) {
          fail('Could not change passcode. Try again.');
          setCurrentPin('');
          setFirstPin('');
          setStep('current');
          return;
        }
        onSuccess();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, mode, step, firstPin, currentPin, onSuccess]);

  const title = (() => {
    if (mode === 'setup') {
      return step === 'confirm' ? 'Confirm passcode' : 'Create passcode';
    }
    if (mode === 'confirmDisable') return 'Enter passcode';
    if (step === 'current') return 'Current passcode';
    if (step === 'newConfirm') return 'Confirm new passcode';
    return 'New passcode';
  })();

  const subtitle = (() => {
    if (mode === 'setup') {
      return step === 'confirm'
        ? 'Enter the same 6 digits again'
        : 'Choose a 6-digit passcode to unlock Medit';
    }
    if (mode === 'confirmDisable') return 'Confirm to turn off App Lock';
    if (step === 'current') return 'Enter your current 6-digit passcode';
    if (step === 'newConfirm') return 'Enter the new passcode again';
    return 'Choose a new 6-digit passcode';
  })();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <TouchableOpacity
          style={styles.cancel}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
        <PinPad
          title={title}
          subtitle={subtitle}
          error={error}
          onComplete={onComplete}
          resetKey={resetKey}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  cancel: {
    position: 'absolute',
    top: 56,
    left: 20,
    zIndex: 2,
    padding: 8,
  },
  cancelTxt: {
    color: colors.textSecondary,
    fontSize: 16,
    fontFamily: fonts.sansSemi,
  },
});
