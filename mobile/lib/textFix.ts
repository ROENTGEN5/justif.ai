/**
 * Android text-measurement safeguards.
 *
 * On some Android devices (OEM system fonts, bold weights, Fabric sub-pixel
 * rounding) React Native measures a <Text> node slightly narrower than the
 * width it actually needs when drawn. The result is either the last glyph
 * being clipped ("Ligh" instead of "Light") or the final word wrapping onto a
 * hidden second line ("Sign" instead of "Sign Out").
 *
 * Spread `textFix` onto any <Text> that hugs its content (chips, pills,
 * buttons, labels, timestamps):
 *
 *   <Text {...textFix} style={...}>Label</Text>
 *
 * For labels that must stay on one line, also use `singleLine` so the worst
 * case becomes an ellipsis instead of a silently hidden word.
 */

import { Platform, TextProps } from "react-native";

export const textFix: Partial<TextProps> =
  Platform.OS === "android"
    ? { textBreakStrategy: "simple", android_hyphenationFrequency: "none" }
    : {};

export const singleLine: Partial<TextProps> = {
  ...textFix,
  numberOfLines: 1,
  ellipsizeMode: "tail",
};
