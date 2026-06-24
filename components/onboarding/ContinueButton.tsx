import React, { useRef } from 'react';
import { Text, StyleSheet, Pressable, Animated } from 'react-native';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
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
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  function handlePress() {
    hapticPrimaryAction();
    onPress();
  }

  return (
    <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
      >
        <Text style={[styles.text, disabled && styles.textDisabled]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  buttonDisabled: {
    backgroundColor: '#C9D2CC',
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  textDisabled: {
    color: '#FFFFFF',
  },
});
