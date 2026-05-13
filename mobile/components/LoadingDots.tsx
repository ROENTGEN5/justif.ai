/**
 * LoadingDots Component
 * Animated "thinking" indicator.
 */

import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import Strings from "../constants/Strings";
import { useTheme } from "../lib/theme";

export default function LoadingDots() {
  const { theme } = useTheme();
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const duration = 400;
    dot1.value = withRepeat(withSequence(withTiming(-8, { duration }), withTiming(0, { duration })), -1, false);
    dot2.value = withRepeat(withDelay(150, withSequence(withTiming(-8, { duration }), withTiming(0, { duration }))), -1, false);
    dot3.value = withRepeat(withDelay(300, withSequence(withTiming(-8, { duration }), withTiming(0, { duration }))), -1, false);
  }, []);

  const animStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const animStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const animStyle3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  const dotStyle = { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.loadingDotColor, marginHorizontal: 3 };

  return (
    <View className="items-start px-4 mb-3">
      <View style={{ backgroundColor: theme.surfaceElevated, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 18, borderBottomLeftRadius: 4 }}>
        <Text style={{ fontSize: 12, color: theme.textTertiary, fontWeight: "600", marginBottom: 8, fontStyle: "italic" }}>{Strings.thinking}</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Animated.View style={[dotStyle, animStyle1]} />
          <Animated.View style={[dotStyle, animStyle2]} />
          <Animated.View style={[dotStyle, animStyle3]} />
        </View>
      </View>
    </View>
  );
}
