import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { POSITION_VIEW_FILTERS, type PositionsViewFilter } from '@/lib/position-filters';
import { colors } from '@/lib/theme';

interface Props {
  value: PositionsViewFilter;
  onChange: (v: PositionsViewFilter) => void;
}

export default function PositionFilterChips({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.chipBg, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.primary },
  txt:        { fontSize: 12, color: colors.chipText, fontWeight: '500' },
  txtActive:  { color: colors.chipActiveText, fontWeight: '700' },
});
