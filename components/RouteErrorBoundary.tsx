import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { colors, fonts } from '@/lib/theme';

/**
 * Expo Router wraps any route that exports `ErrorBoundary` with it. Without one,
 * a render error unmounts the whole React root and release builds abort via
 * RCTFatal. This keeps the failure inside the route and offers a retry.
 */
export default function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message}</Text>
      <TouchableOpacity onPress={retry} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnTxt}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.sansBold,
    fontWeight: '700',
  },
  message: {
    color: colors.textSecondary,
    marginTop: 8,
    fontSize: 13,
    fontFamily: fonts.mono,
  },
  btn: {
    alignSelf: 'flex-start',
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnTxt: {
    color: colors.brand,
    fontSize: 15,
    fontFamily: fonts.sansSemi,
    fontWeight: '600',
  },
});
