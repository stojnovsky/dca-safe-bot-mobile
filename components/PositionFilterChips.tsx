import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { POSITION_VIEW_FILTERS, type PositionsViewFilter } from '@/lib/position-filters';

interface Props {
  value: PositionsViewFilter;
  onChange: (f: PositionsViewFilter) => void;
}

export default function PositionFilterChips({ value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
      {POSITION_VIEW_FILTERS.map((f) => (
        <TouchableOpacity
          key={f.key}
          onPress={() => onChange(f.key)}
          style={[styles.chip, value === f.key && styles.chipActive]}
        >
          <Text style={[styles.txt, value === f.key && styles.txtActive]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row:        { flexGrow: 0, marginBottom: 10 },
  chip:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#1f2937', marginRight: 6 },
  chipActive: { backgroundColor: '#2563eb' },
  txt:        { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  txtActive:  { color: '#fff' },
});
