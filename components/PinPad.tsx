import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { colors, fonts } from '@/lib/theme';
import { PIN_LENGTH } from '@/lib/app-lock';

type Props = {
  title: string;
  subtitle?: string;
  error?: string | null;
  /** Fires once when exactly PIN_LENGTH digits are entered. Cleared by parent via `resetKey`. */
  onComplete: (pin: string) => void;
  /** Change this to clear the entered digits (e.g. after a failed attempt). */
  resetKey?: number | string;
  /** Optional footer below the keypad (e.g. biometric button). */
  footer?: React.ReactNode;
};

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
] as const;

export default function PinPad({
  title, subtitle, error, onComplete, resetKey, footer,
}: Props) {
  const [digits, setDigits] = useState('');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setDigits('');
  }, [resetKey]);

  const press = (key: string) => {
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (!key) return;
    setDigits((d) => {
      if (d.length >= PIN_LENGTH) return d;
      const next = d + key;
      if (next.length === PIN_LENGTH) {
        // Defer so the filled dots paint before parent handles the PIN.
        queueMicrotask(() => onCompleteRef.current(next));
      }
      return next;
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>MEDIT</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < digits.length && styles.dotFilled]}
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSlot} />}

      <View style={styles.pad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ki) => {
              if (!key) return <View key={ki} style={styles.keyGhost} />;
              const isDelete = key === '⌫';
              return (
                <TouchableOpacity
                  key={ki}
                  style={[styles.key, isDelete && styles.keyDelete]}
                  onPress={() => press(key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={isDelete ? 'Delete' : key}
                >
                  <Text style={[styles.keyTxt, isDelete && styles.keyDeleteTxt]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: colors.bg,
  },
  brand: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.brand,
    fontFamily: fonts.sansSemi,
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fonts.sansBold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  dots: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 28,
    marginBottom: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderMuted,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  error: {
    minHeight: 20,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  errorSlot: {
    minHeight: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  pad: {
    marginTop: 12,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyGhost: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyDelete: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyTxt: {
    fontSize: 26,
    color: colors.text,
    fontFamily: fonts.monoMedium,
    fontVariant: ['tabular-nums'],
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  keyDeleteTxt: {
    fontSize: 22,
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 28,
    alignItems: 'center',
  },
});
