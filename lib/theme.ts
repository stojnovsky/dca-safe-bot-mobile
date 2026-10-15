/**
 * Medit visual tokens.
 * Ink canvas, acid lime, and electric violet — the mix showing up across
 * current fintech and consumer apps (Cash App neon, Phantom / Linear violet,
 * TikTok magenta for losses, large glass surfaces).
 */
export const colors = {
  bg: '#07080D',
  surface: '#12151E',
  surfaceElevated: '#1C2030',
  surfaceInset: '#0B0D14',
  surfaceHero: '#1A1430',
  heroViolet: '#241838',
  heroLime: '#182210',
  border: 'rgba(255,255,255,0.08)',
  borderMuted: 'rgba(255,255,255,0.05)',
  borderHero: 'rgba(210,255,76,0.28)',

  brand: '#D2FF4C',
  primary: '#D2FF4C',
  primaryMuted: '#8EAD32',
  primaryOn: '#10140A',

  accent: '#A78BFA',
  accentMuted: '#7C6BBF',

  success: '#D2FF4C',
  successBg: 'rgba(210,255,76,0.12)',
  successBorder: 'rgba(210,255,76,0.32)',
  successText: '#D2FF4C',

  danger: '#FF4D8D',
  dangerBg: 'rgba(255,77,141,0.12)',
  dangerBorder: 'rgba(255,77,141,0.32)',
  dangerText: '#FF4D8D',

  warning: '#FFB020',
  warningBg: 'rgba(255,176,32,0.14)',

  text: '#F4F6FB',
  textSecondary: '#B4B9CC',
  textMuted: '#7C849C',
  textDim: '#9AA1B5',
  textHint: '#5C647C',

  inputBg: '#0C0E16',
  placeholder: '#5C647C',

  eth: '#A78BFA',
  ethBg: 'rgba(167,139,250,0.16)',
  ethBorder: 'rgba(167,139,250,0.32)',
  btc: '#FF9F1C',
  btcBg: 'rgba(255,159,28,0.16)',
  btcBorder: 'rgba(255,159,28,0.32)',

  tabBarBg: '#0C0E16',
  tabActive: '#D2FF4C',
  tabInactive: '#8B93A7',

  switchThumb: '#10140A',
  switchTrackOn: '#D2FF4C',
  switchTrackOff: '#2A2E3C',

  link: '#C4B5FD',
  chipActiveBg: '#D2FF4C',
  chipActiveText: '#10140A',
  chipBg: '#12151E',
  chipText: '#B4B9CC',

  statusOpenBg: 'rgba(167,139,250,0.16)',
  overlay: '#000000',

  chartLine: '#D2FF4C',
  chartFill: 'rgba(210,255,76,0.22)',
  chartGrid: 'rgba(255,255,255,0.06)',
} as const;

/** Daily coin face colours */
export const coinColors = {
  gold: { face: '#FFE56A', rim: '#E0A010', text: '#4A3000' },
  bronze: { face: '#F0B060', rim: '#A86828', text: '#3A1800' },
  liveUp: { face: '#E8FF9A', rim: '#D2FF4C', text: '#1A2408' },
  liveDown: { face: '#FFD0E0', rim: '#FF4D8D', text: '#6A1030' },
} as const;

export const radii = {
  sm: 12,
  md: 18,
  lg: 22,
  xl: 26,
  hero: 28,
  button: 16,
  pill: 999,
} as const;

/** Font family names — load via @expo-google-fonts in root _layout */
export const fonts = {
  sans: 'DMSans_400Regular',
  sansSemi: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

export type AppColors = typeof colors;

export const switchColors = {
  thumbColor: colors.switchThumb,
  trackColor: { true: colors.switchTrackOn, false: colors.switchTrackOff } as const,
};

export const refreshColors = [colors.primary, colors.accent] as const;

/** Shared text styles */
export const type = {
  brandLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 2.4,
    textTransform: 'uppercase' as const,
    color: colors.brand,
    fontFamily: fonts.sansSemi,
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
    color: colors.text,
    fontFamily: fonts.sansBold,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    color: colors.text,
    fontFamily: fonts.sansBold,
  },
  monoValue: {
    fontFamily: fonts.monoMedium,
    fontVariant: ['tabular-nums'] as const,
  },
};
