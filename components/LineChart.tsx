import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import type { SimulationDay } from '@/lib/types';

interface Props {
  days: SimulationDay[];
  height?: number;
}

const PADDING = { top: 10, right: 16, bottom: 40, left: 56 };

export default function LineChart({ days, height = 200 }: Props) {
  const width = Dimensions.get('window').width - 32; // screen width minus margins

  const { path, xLabels, yLabels } = useMemo(() => {
    if (days.length === 0) return { path: '', xLabels: [], yLabels: [] };

    const values   = days.map((d) => d.totalValue);
    const minVal   = Math.min(...values);
    const maxVal   = Math.max(...values);
    const valRange = maxVal - minVal || 1;

    const chartW = width  - PADDING.left - PADDING.right;
    const chartH = height - PADDING.top  - PADDING.bottom;

    const toX = (i: number) => PADDING.left + (i / (days.length - 1)) * chartW;
    const toY = (v: number) => PADDING.top  + chartH - ((v - minVal) / valRange) * chartH;

    // SVG path
    const points = days.map((d, i) => `${toX(i).toFixed(1)},${toY(d.totalValue).toFixed(1)}`);
    const pathStr = `M ${points[0]} L ${points.slice(1).join(' L ')}`;

    // X labels: ~5 evenly spaced dates
    const xLabelCount = Math.min(5, days.length);
    const xLabels = Array.from({ length: xLabelCount }, (_, k) => {
      const idx  = Math.round((k / (xLabelCount - 1)) * (days.length - 1));
      const date = days[idx].date;
      return { x: toX(idx), label: date.slice(0, 7) }; // YYYY-MM
    });

    // Y labels: 4 horizontal lines
    const yLabels = Array.from({ length: 4 }, (_, k) => {
      const frac = k / 3;
      const val  = minVal + frac * valRange;
      return { y: toY(val), label: `$${formatK(val)}` };
    });

    return { path: pathStr, xLabels, yLabels };
  }, [days, width, height]);

  if (days.length === 0) return null;

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        {/* Y grid lines + labels */}
        {yLabels.map(({ y, label }, i) => (
          <React.Fragment key={i}>
            <Line x1={PADDING.left} y1={y} x2={width - PADDING.right} y2={y}
              stroke="#1f2937" strokeWidth={1} />
            <SvgText x={PADDING.left - 4} y={y + 4} fontSize={9} fill="#6b7280"
              textAnchor="end">{label}</SvgText>
          </React.Fragment>
        ))}
        {/* Value line */}
        <Path d={path} stroke="#3b82f6" strokeWidth={2} fill="none" />
        {/* X labels */}
        {xLabels.map(({ x, label }, i) => (
          <SvgText key={i} x={x} y={height - 6} fontSize={9} fill="#6b7280"
            textAnchor="middle">{label}</SvgText>
        ))}
      </Svg>
    </View>
  );
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#111827', borderRadius: 12, overflow: 'hidden' },
});
