import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../../constants/colors';
import { hapticSelection } from '../../lib/haptics';

type OptionCardProps = {
  label: string;
  icon?: React.ReactNode;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
};

export function OptionCard({ label, icon, subtitle, selected, onPress }: OptionCardProps) {
  function handlePress() {
    hapticSelection();
    onPress();
  }

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {icon && (
        <View style={[styles.iconCircle, selected && styles.iconCircleSelected]}>
          {icon}
        </View>
      )}
      <View style={styles.textContainer}>
        <Text style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, selected && styles.subtitleSelected]}>
            {subtitle}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E0DC',
    backgroundColor: colors.surface,
    gap: 14,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FAE8E4',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSelected: {
    backgroundColor: colors.primary,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subtitleSelected: {
    color: colors.primary,
  },
});
