import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '@/lib/theme';

interface Props {
  data: number[];
  width: number;
  height?: number;
  color?: string;
  fillFrom?: string;
  fillTo?: string;
  strokeWidth?: number;
}

/**
 * Minimal area-chart sparkline. Renders a single stroked line plus a
 * top-down gradient-filled area underneath. No axes, no labels — purely
 * decorative, designed to live inside hero cards.
 */
export default function Sparkline({
  data,
  width,
  height = 50,
  color = colors.chartLine,
  fillFrom,
  fillTo,
  strokeWidth = 1.5,
}: Props) {
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, []);

  if (data.length < 2) {
    return <View style={[styles.placeholder, { width, height }]} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    // Inset 4px from top/bottom so the stroke doesn't clip
    const y = 4 + (1 - (v - min) / range) * (height - 8);
    return { x, y };
  });

  const linePath =
    `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} ` +
    points.slice(1).map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const areaPath =
    linePath +
    ` L ${points[points.length - 1].x.toFixed(1)},${height} ` +
    ` L ${points[0].x.toFixed(1)},${height} Z`;

  const gradFrom = fillFrom ?? `${color}40`; // ~25% alpha
  const gradTo   = fillTo   ?? `${color}00`; // 0% alpha

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={gradFrom} />
          <Stop offset="1" stopColor={gradTo} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${id})`} />
      <Path d={linePath} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: 'transparent' },
});
