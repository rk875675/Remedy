import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ob } from './tokens';

/**
 * Outline glyphs the onboarding flow is allowed to use.
 * Every name exists in the installed Ionicons glyph map.
 */
const ICON_NAMES = [
  'chevron-back',
  'chevron-forward',
  'checkmark',
  'close',
  'bed-outline',
  'walk-outline',
  'barbell-outline',
  'fitness-outline',
  'body-outline',
  'moon-outline',
  'sunny-outline',
  'partly-sunny-outline',
  'time-outline',
  'timer-outline',
  'hourglass-outline',
  'calendar-outline',
  'flash-outline',
  'pulse-outline',
  'trending-up-outline',
  'trending-down-outline',
  'remove-outline',
  'swap-vertical-outline',
  'swap-horizontal-outline',
  'git-compare-outline',
  'medkit-outline',
  'medical-outline',
  'bandage-outline',
  'hand-left-outline',
  'hand-right-outline',
  'happy-outline',
  'sad-outline',
  'help-circle-outline',
  'help-outline',
  'alert-circle-outline',
  'shield-checkmark-outline',
  'lock-closed-outline',
  'leaf-outline',
  'flame-outline',
  'water-outline',
  'snow-outline',
  'thermometer-outline',
  'heart-outline',
  'people-outline',
  'person-outline',
  'home-outline',
  'desktop-outline',
  'laptop-outline',
  'car-outline',
  'bicycle-outline',
  'football-outline',
  'basketball-outline',
  'footsteps-outline',
  'arrow-up-outline',
  'arrow-down-outline',
  'arrow-forward-outline',
  'expand-outline',
  'contract-outline',
  'resize-outline',
  'sync-outline',
  'refresh-outline',
  'repeat-outline',
  'shuffle-outline',
  'layers-outline',
  'grid-outline',
  'location-outline',
  'locate-outline',
  'navigate-outline',
  'ellipse-outline',
  'radio-button-on-outline',
  'scan-outline',
  'eye-outline',
  'ear-outline',
  'mic-outline',
  'notifications-outline',
  'alarm-outline',
  'book-outline',
  'document-text-outline',
  'clipboard-outline',
  'school-outline',
  'ribbon-outline',
  'trophy-outline',
  'star-outline',
  'sparkles-outline',
  'rocket-outline',
  'speedometer-outline',
  'stats-chart-outline',
  'analytics-outline',
  'bar-chart-outline',
  'construct-outline',
  'hammer-outline',
  'cube-outline',
  'logo-instagram',
  'logo-tiktok',
  'logo-youtube',
  'logo-facebook',
  'logo-google',
  'search-outline',
  'ellipsis-horizontal',
  'add',
  'remove',
  'information-circle-outline',
  'woman-outline',
  'man-outline',
  'accessibility-outline',
  'cellular-outline',
  'battery-half-outline',
  'cafe-outline',
  'restaurant-outline',
  'bag-handle-outline',
  'shirt-outline',
  'cut-outline',
  'flower-outline',
  'rose-outline',
  'nutrition-outline',
  'pencil-outline',
  'chatbubble-ellipses-outline',
  'thumbs-up-outline',
  'thumbs-down-outline',
  'warning-outline',
  'stopwatch-outline',
  'tv-outline',
  'phone-portrait-outline',
  'skull-outline',
  'storefront-outline',
  'business-outline',
  'globe-outline',
  'mail-outline',
  'gift-outline',
  'musical-notes-outline',
  'play-outline',
  'pause-outline',
  'infinite-outline',
  'magnet-outline',
  'prism-outline',
  'compass-outline',
  'options-outline',
  'settings-outline',
  'link-outline',
  'unlink-outline',
  'git-branch-outline',
  'git-merge-outline',
  'git-network-outline',
  'cloud-outline',
  'rainy-outline',
  'thunderstorm-outline',
  'bonfire-outline',
  'cloudy-night-outline',
  'pin-outline',
  'flag-outline',
  'key-outline',
  'checkmark-circle-outline',
  'close-circle-outline',
  'caret-up-outline',
  'caret-down-outline',
  'chevron-up-outline',
  'chevron-down-outline',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

/** The only Ionicons import in the onboarding kit. Decorative: parents own the label. */
export function Icon({ name, size = ob.size.icon, color = ob.color.ink }: IconProps) {
  return <Ionicons name={name} size={size} color={color} accessible={false} />;
}

type IconTileProps = {
  name: IconName;
  selected?: boolean;
};

/** 40pt tile used at the left of an option row. */
export function IconTile({ name, selected = false }: IconTileProps) {
  return (
    <View style={[styles.tile, selected ? styles.tileSelected : null]}>
      <Icon name={name} size={ob.size.icon} color={selected ? ob.color.accentDeep : ob.color.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: ob.size.iconTile,
    height: ob.size.iconTile,
    borderRadius: ob.radius.tile,
    backgroundColor: ob.color.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    backgroundColor: ob.color.surface,
  },
});
