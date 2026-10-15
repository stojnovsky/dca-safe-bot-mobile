import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { POSITION_VIEW_FILTERS, type PositionsViewFilter } from '@/lib/position-filters';
import { colors, fonts, radii } from '@/lib/theme';

interface Props {
  value: PositionsViewFilter;
  onChange: (v: PositionsViewFilter) => void;
}

export default function PositionFilterChips({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {POSITION_VIEW_FILTERS.map((f) => {
        const active = value === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f.key)}
          >
            <Text style={[styles.txt, active && styles.txtActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', paddingVertical: 2, gap: 8 },
  chip:       {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.chipBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.chipActiveBg },
  txt:        { fontSize: 12, color: colors.chipText, fontWeight: '600', fontFamily: fonts.sansSemi },
  txtActive:  { color: colors.chipActiveText, fontWeight: '700' },
});
