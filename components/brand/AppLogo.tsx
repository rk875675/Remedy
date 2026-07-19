import { Image, ImageStyle } from 'react-native';
import { brand, BRAND_LOGO, BrandLogoSize } from '../../lib/brand';

type AppLogoProps = {
  size?: BrandLogoSize | number;
  style?: ImageStyle;
};

export function AppLogo({ size = 'md', style }: AppLogoProps) {
  const px = typeof size === 'number' ? size : brand.logoSizes[size];
  const cornerRadius = px * brand.logoCornerRadiusRatio;

  return (
    <Image
      source={BRAND_LOGO}
      style={[{ width: px, height: px, borderRadius: cornerRadius }, style]}
      resizeMode="cover"
      accessibilityRole="image"
      accessibilityLabel="Remedy"
    />
  );
}
