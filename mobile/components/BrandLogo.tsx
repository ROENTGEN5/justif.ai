import React from "react";
import { Image } from "expo-image";

/** Shared artwork for every in-app brand mark; never crop the wordmark. */
export default function BrandLogo({ size = 64, style }: { size?: number; style?: React.ComponentProps<typeof Image>["style"] }) {
  return <Image source={require("../assets/brand-logo.jpg")} contentFit="contain" cachePolicy="memory-disk" accessibilityLabel="Justif.ai logo" accessibilityIgnoresInvertColors style={[{ width: size, height: size, borderRadius: size * 0.22 }, style]} />;
}
