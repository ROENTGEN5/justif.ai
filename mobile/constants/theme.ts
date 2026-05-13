/**
 * Theme configuration for Justif.ai
 * Supports light, dark, and night modes.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#171717',
    background: '#FFFFFF',
    tint: '#171717',
    icon: '#737373',
    tabIconDefault: '#737373',
    tabIconSelected: '#171717',
  },
  dark: {
    text: '#FAFAFA',
    background: '#171717',
    tint: '#FFFFFF',
    icon: '#737373',
    tabIconDefault: '#737373',
    tabIconSelected: '#FFFFFF',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
