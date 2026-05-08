import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, GestureResponderEvent } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Circle, G } from 'react-native-svg';

export interface ChartPoint {
  date: string;          // YYYY-MM-DD
  invested: number;      // cumulative USD
  portfolioValue: number;// total USD value
  pnlPercent: number;    // (value - invested) / invested * 100
}

interface Props {
  data: ChartPoint[];
  title?: string;
  height?: number;
}

const PADDING = { top: 16, right: 48, bottom: 56, left: 56 };

const C = {
  card:           '#0f1729',
  cardBorder:     '#1f2937',
  text:           '#9ca3af',
  textStrong:     '#e5e7eb',
  grid:           '#1f2937',
  invested:       '#1e3a8a',
  investedStroke: '#3b82f6',
  value:          '#60a5fa',
  pnl:            '#10b981',
  cross:          '#94a3b8',
};

export default function PortfolioChart({
  data,
  title = 'Portfolio Value vs Invested',
  height = 260,
}: Props) {
  const width = Dimensions.get('window').width - 32;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (data.length === 0) return null;

    const allMoney = [
      ...data.map((d) => d.invested),
      ...data.map((d) => d.portfolioValue),
    ];
    const moneyMax = Math.max(...allMoney, 1);
    const moneyMin = 0;

    const pctAbsMax = Math.max(...data.map((d) => Math.abs(d.pnlPercent)), 1);
    const pctRange = pctAbsMax * 1.2;

    const chartW = width - PADDING.left - PADDING.right;
    const chartH = height - PADDING.top - PADDING.bottom;

    const toX = (i: number) =>
      data.length === 1
        ? PADDING.left + chartW / 2
        : PADDING.left + (i / (data.length - 1)) * chartW;
    const toYMoney = (v: number) =>
      PADDING.top + chartH - ((v - moneyMin) / (moneyMax - moneyMin || 1)) * chartH;
    const toYPct = (v: number) =>
      PADDING.top + chartH - ((v + pctRange) / (2 * pctRange)) * chartH;

    const baselineY = toYMoney(0);

    let investedPath = `M ${toX(0).toFixed(1)},${baselineY.toFixed(1)} `;
    for (let i = 0; i < data.length; i++) {
      const x = toX(i);
      const y = toYMoney(data[i].invested);
      investedPath += `L ${x.toFixed(1)},${y.toFixed(1)} `;
      if (i < data.length - 1) {
        const xNext = toX(i + 1);
        investedPath += `L ${xNext.toFixed(1)},${y.toFixed(1)} `;
      }
    }
    investedPath += `L ${toX(data.length - 1).toFixed(1)},${baselineY.toFixed(1)} Z`;

    const valuePath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toYMoney(d.portfolioValue).toFixed(1)}`)
      .join(' ');

    const pnlPath = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toYPct(d.pnlPercent).toFixed(1)}`)
      .join(' ');

    const yTicks = 5;
    const yLabels = Array.from({ length: yTicks }, (_, k) => {
      const frac = k / (yTicks - 1);
      const val = moneyMin + frac * (moneyMax - moneyMin);
      return { y: toYMoney(val), label: '$' + formatK(val) };
    });
    const pctLabels = Array.from({ length: yTicks }, (_, k) => {
      const frac = k / (yTicks - 1);
      const val = -pctRange + frac * 2 * pctRange;
      return { y: toYPct(val), label: `${val >= 0 ? '' : ''}${val.toFixed(0)}%` };
    });

    const xLabelCount = Math.min(7, data.length);
    const xLabels = Array.from({ length: xLabelCount }, (_, k) => {
      const idx = Math.round((k / Math.max(1, xLabelCount - 1)) * (data.length - 1));
      const d = data[idx].date;
      return { x: toX(idx), label: d.slice(5) };
    });

    return { investedPath, valuePath, pnlPath, yLabels, pctLabels, xLabels, chartW, toX, toYMoney, toYPct };
  }, [data, width, height]);

  if (!chart) {
    return (
      <View style={[styles.card, { height }]}>
        {title && <Text style={styles.title}>{title}</Text>}
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>No data</Text>
        </View>
      </View>
    );
  }

  const handleTouch = (evt: GestureResponderEvent) => {
    const x = evt.nativeEvent.locationX;
    const rel = (x - PADDING.left) / chart.chartW;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1))));
    setActiveIdx(idx);
  };

  const active = activeIdx !== null ? data[activeIdx] : null;
  const activeX = activeIdx !== null ? chart.toX(activeIdx) : 0;

  return (
    <View style={styles.card}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
      >
        <Svg width={width} height={height}>
          {chart.yLabels.map(({ y, label }, i) => {
            const isEdge = i === 0 || i === chart.yLabels.length - 1;
            return (
              <G key={`y-${i}`}>
                <Line
                  x1={PADDING.left}
                  y1={y}
                  x2={width - PADDING.right}
                  y2={y}
                  stroke={C.grid}
                  strokeWidth={1}
                  strokeDasharray={isEdge ? undefined : '2 4'}
                />
                <SvgText x={PADDING.left - 6} y={y + 3} fontSize={9} fill={C.text} textAnchor="end">
                  {label}
                </SvgText>
              </G>
            );
          })}

          {chart.pctLabels.map(({ y, label }, i) => (
            <SvgText
              key={`pct-${i}`}
              x={width - PADDING.right + 6}
              y={y + 3}
              fontSize={9}
              fill={C.text}
              textAnchor="start"
            >
              {label}
            </SvgText>
          ))}

          <Path
            d={chart.investedPath}
            fill={C.invested}
            stroke={C.investedStroke}
            strokeWidth={0.5}
            fillOpacity={0.55}
          />

          <Path
            d={chart.pnlPath}
            stroke={C.pnl}
            strokeWidth={1.5}
            fill="none"
            strokeDasharray="4 3"
          />

          <Path d={chart.valuePath} stroke={C.value} strokeWidth={2} fill="none" />

          {chart.xLabels.map(({ x, label }, i) => (
            <SvgText
              key={`x-${i}`}
              x={x}
              y={height - PADDING.bottom + 14}
              fontSize={9}
              fill={C.text}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          ))}

          {active !== null && (
            <G>
              <Line
                x1={activeX}
                y1={PADDING.top}
                x2={activeX}
                y2={height - PADDING.bottom}
                stroke={C.cross}
                strokeWidth={1}
                strokeOpacity={0.4}
              />
              <Circle
                cx={activeX}
                cy={chart.toYMoney(active.portfolioValue)}
                r={4}
                fill={C.value}
                stroke="#fff"
                strokeWidth={1.5}
              />
              <Circle
                cx={activeX}
                cy={chart.toYPct(active.pnlPercent)}
                r={3}
                fill={C.pnl}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </G>
          )}
        </Svg>

        {active && (
          <Tooltip
            x={activeX}
            chartWidth={width}
            chartHeight={height}
            point={active}
          />
        )}
      </View>

      <View style={styles.legend}>
        <Legend swatch={<View style={[styles.legendBox, { backgroundColor: C.invested, borderColor: C.investedStroke }]} />} label="Invested" />
        <Legend swatch={<View style={[styles.legendDash, { borderColor: C.pnl }]} />} label="P&L %" />
        <Legend swatch={<View style={[styles.legendLine, { backgroundColor: C.value }]} />} label="Portfolio Value" />
      </View>
    </View>
  );
}

function Tooltip({
  x,
  chartWidth,
  chartHeight,
  point,
}: {
  x: number;
  chartWidth: number;
  chartHeight: number;
  point: ChartPoint;
}) {
  const TOOLTIP_W = 145;
  const flipLeft = x + 12 + TOOLTIP_W > chartWidth;
  const left = flipLeft ? Math.max(8, x - TOOLTIP_W - 8) : x + 8;
  const top = Math.min(chartHeight / 3, 80);

  return (
    <View pointerEvents="none" style={[styles.tooltip, { top, left, width: TOOLTIP_W }]}>
      <Text style={styles.tooltipDate}>{point.date.slice(5)}</Text>
      <View style={styles.tooltipRow}>
        <Text style={styles.tooltipKey}>Invested:</Text>
        <Text style={styles.tooltipVal}>${formatNumber(point.invested)}</Text>
      </View>
      <View style={styles.tooltipRow}>
        <Text style={[styles.tooltipKey, { color: C.value }]}>Portfolio Value:</Text>
        <Text style={styles.tooltipVal}>${formatNumber(point.portfolioValue)}</Text>
      </View>
      <View style={styles.tooltipRow}>
        <Text style={[styles.tooltipKey, { color: C.pnl }]}>P&L %:</Text>
        <Text style={styles.tooltipVal}>
          {point.pnlPercent >= 0 ? '+' : ''}{point.pnlPercent.toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <Text style={styles.legendTxt}>{label}</Text>
    </View>
  );
}

function formatK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(1);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textStrong,
    marginBottom: 4,
    marginLeft: 4,
  },
  empty:        { padding: 24, alignItems: 'center' },
  emptyTxt:     { color: '#4b5563', fontSize: 12 },

  legend:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 6, gap: 16 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendTxt:    { color: C.text, fontSize: 10 },
  legendBox:    { width: 10, height: 10, borderWidth: 1, borderRadius: 1 },
  legendDash:   { width: 16, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  legendLine:   { width: 16, height: 2, borderRadius: 1 },

  tooltip: {
    position: 'absolute',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tooltipDate:  { color: '#cbd5e1', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  tooltipRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 1 },
  tooltipKey:   { color: '#9ca3af', fontSize: 10 },
  tooltipVal:   { color: '#fff', fontSize: 10, fontVariant: ['tabular-nums'] },
});
