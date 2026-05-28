import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../constants/colors';
import { hapticPrimaryAction } from '../../lib/haptics';

type ContinueButtonProps = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
};

export function ContinueButton({
  label = 'Continue',
  onPress,
  disabled = false,
}: ContinueButtonProps) {
  function handlePress() {
    hapticPrimaryAction();
    onPress();
  }

  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
