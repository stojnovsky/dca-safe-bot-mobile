/**
 * App color palette (dark leaderboard-style UI).
 * Use these tokens instead of hard-coded hex in screens and components.
 */
export const colors = {
  bg: '#0D0D0D',
  surface: '#1A1A1A',
  surfaceElevated: '#1E1E1E',
  surfaceInset: '#121212',

  primary: '#FF6B35',
  primaryMuted: '#B34724',
  primaryOn: '#0D0D0D',

  accent: '#4FD1C5',
  accentMuted: '#2C9A91',

  success: '#48BB78',
  successBg: '#1A2E22',
  successText: '#9AE6B4',

  danger: '#FC8181',
  dangerBg: '#3D1F1F',
  dangerText: '#FEB2B2',

  warning: '#F6AD55',
  warningBg: '#3D2E14',

  border: '#2D3748',
  borderFocus: '#FF6B35',

  text: '#FFFFFF',
  textSecondary: '#718096',
  textMuted: '#4A5568',

  inputBg: '#1E1E1E',
  placeholder: '#4A5568',

  eth: '#4FD1C5',
  btc: '#FF6B35',

  tabBarBg: '#0D0D0D',
  tabActive: '#FF6B35',
  tabInactive: '#718096',

  switchThumb: '#FF6B35',
  switchTrackOn: '#66351A',
  switchTrackOff: '#2D3748',

  link: '#4FD1C5',
  chipActiveBg: '#FF6B35',
  chipActiveText: '#0D0D0D',
  chipBg: '#1E1E1E',
  chipText: '#718096',

  statusOpenBg: '#2D3748',
  overlay: '#000000',
} as const;

export type AppColors = typeof colors;

/** React Native Switch track/thumb colors */
export const switchColors = {
  thumbColor: colors.switchThumb,
  trackColor: { true: colors.switchTrackOn, false: colors.switchTrackOff } as const,
};

/** Pull-to-refresh tint on Android */
export const refreshColors = [colors.primary, colors.accent] as const;
