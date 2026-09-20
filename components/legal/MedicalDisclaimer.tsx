import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../../constants/colors';
import { MEDICAL_DISCLAIMER_LINE } from '../../constants/legalTerms';

export function MedicalDisclaimer({ style }: { style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.text, style]}>{MEDICAL_DISCLAIMER_LINE}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
