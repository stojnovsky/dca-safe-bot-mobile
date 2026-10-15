import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, fonts, radii } from '@/lib/theme';
import Sparkline from './Sparkline';

interface Props {
  /** Small uppercase label above the big value (e.g. "Total Value"). */
  label: string;
  /** Primary value rendered in mono (e.g. "$2,840"). */
  value: string;
  /** Optional cents tail rendered smaller and muted next to the value. */
  valueTail?: string;
  /** Inline tag at top-right (e.g. "+12.7%"). */
  badge?: { text: string; positive: boolean };
  /** Small muted footer line (e.g. "Safe · 0x4f2a…c91e · Base L2"). */
  subline?: string;
  /** Width budget for the inner sparkline. */
  innerWidth: number;
  /** Sparkline series — pass an empty array or omit to hide it. */
  sparkline?: number[];
}

/**
 * Aurora glass card: violet wash on the left, acid-lime bloom on the top-right,
 * optional sparkline under the value. Headline element on the Portfolio screen.
 *
 * Implementation note: React Native has no native gradient support — both
 * gradients are painted via an absolutely positioned <Svg> behind the content.
 */
export default function HeroCard({
  label,
  value,
  valueTail,
  badge,
  subline,
  innerWidth,
  sparkline,
}: Props) {
  const cardW = innerWidth;
  // Card height adapts to whether we have a sparkline + subline. The Svg
  // background is sized to fit. We rely on the inner View to size the card.
  return (
    <View style={[styles.card, { width: cardW }]}>
      {/* Gradient background + radial glow */}
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        // viewBox lets the gradients scale to whatever final card height we render
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0"    stopColor={colors.heroViolet} />
            <Stop offset="0.55" stopColor={colors.surface} />
            <Stop offset="1"    stopColor={colors.heroLime} />
          </LinearGradient>
          <RadialGradient
            id="hero-glow"
            cx="100%"
            cy="0%"
            rx="72%"
            ry="85%"
            fx="100%"
            fy="0%"
          >
            <Stop offset="0"   stopColor={colors.brand} stopOpacity={0.5} />
            <Stop offset="0.42" stopColor={colors.brand} stopOpacity={0.1} />
            <Stop offset="1"   stopColor={colors.brand} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id="hero-glow-violet"
            cx="0%"
            cy="110%"
            rx="70%"
            ry="80%"
            fx="0%"
            fy="100%"
          >
            <Stop offset="0"   stopColor={colors.accent} stopOpacity={0.45} />
            <Stop offset="0.55" stopColor={colors.accent} stopOpacity={0.08} />
            <Stop offset="1"   stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#hero-bg)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#hero-glow)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#hero-glow-violet)" />
      </Svg>

      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>

        <Text style={styles.value}>
          {value}
          {valueTail ? <Text style={styles.valueTail}>{valueTail}</Text> : null}
        </Text>

        {badge ? (
          <Text style={[styles.delta, !badge.positive && styles.deltaNeg]}>{badge.text}</Text>
        ) : null}

        {subline ? <Text style={styles.subline}>{subline}</Text> : null}
      </View>

      {sparkline && sparkline.length > 1 ? (
        <View style={styles.sparkWrap}>
          <Sparkline data={sparkline} width={cardW} height={72} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderHero,
    borderRadius: radii.hero,
    padding: 0,
    overflow: 'hidden',
    marginBottom: 16,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 8,
  },
  label: {
    fontSize: 11,
    color: colors.textDim,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: fonts.sansSemi,
  },
  delta: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
    fontFamily: fonts.sansSemi,
  },
  deltaNeg: { color: colors.danger },
  value: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.text,
    fontFamily: fonts.monoMedium,
    marginTop: 8,
  },
  valueTail: {
    fontSize: 16,
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontWeight: '400',
  },
  subline: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontFamily: fonts.mono,
  },
  sparkWrap: {
    marginTop: 8,
  },
});
