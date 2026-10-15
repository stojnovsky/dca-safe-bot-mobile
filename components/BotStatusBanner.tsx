import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { colors, fonts, radii, switchColors } from '@/lib/theme';

interface Props {
  running: boolean;
  /** e.g. "Last run 38m ago" — falls back to a default if omitted. */
  lastRunLabel?: string;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
}

/**
 * The "Bot is running · Last run …" banner — status dot, headline, toggle.
 * The dot color tracks `running` so a glance tells you whether the hourly
 * task is armed.
 */
export default function BotStatusBanner({ running, lastRunLabel, onToggle, disabled }: Props) {
  return (
    <View style={[styles.banner, running ? styles.bannerOn : styles.bannerOff]}>
      <View
        style={[
          styles.dot,
          { backgroundColor: running ? colors.success : colors.danger },
          { shadowColor: running ? colors.success : colors.danger },
        ]}
      />
      <View style={styles.textCol}>
        <Text style={styles.headline}>
          {running ? 'Bot is running' : 'Bot is paused'}
        </Text>
        <Text style={styles.sub}>
          {lastRunLabel ?? (running ? 'Hourly background check armed' : 'No background activity')}
        </Text>
      </View>
      <Switch
        value={running}
        onValueChange={onToggle}
        disabled={disabled}
        thumbColor={switchColors.thumbColor}
        trackColor={switchColors.trackColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  bannerOn: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  bannerOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    // iOS glow + Android elevation — the dot's color leaks softly outward.
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 2,
  },
  textCol: { flex: 1 },
  headline: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fonts.sansSemi,
  },
  sub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
    fontFamily: fonts.sans,
  },
});
