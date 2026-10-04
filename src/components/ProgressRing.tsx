import type { ReactNode } from "react";
import { View } from "react-native";
import { colors } from "../constants/theme";

// Overlapping strokes form a continuous arc without adding a native dependency.
// Decorative only: the host supplies the goal/timer accessibility value.
export default function ProgressRing({ size, progress, color = colors.accent, children, stroke = 10 }: {
  size: number; progress: number; color?: string; children?: ReactNode; stroke?: number;
}) {
  const fraction = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const count = 180;
  const width = Math.PI * 2 * radius / count + 1;
  const filled = Math.round(fraction * count);
  return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: colors.line }} />
    {Array.from({ length: filled }, (_, index) => {
      const angle = index / count * Math.PI * 2;
      return <View key={index} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: "absolute", width, height: stroke, borderRadius: 1,
        left: size / 2 + Math.sin(angle) * radius - width / 2,
        top: size / 2 - Math.cos(angle) * radius - stroke / 2,
        transform: [{ rotate: `${index / count * 360}deg` }], backgroundColor: color }} />;
    })}
    {filled > 0 && [0, (filled - 1) / count * Math.PI * 2].map((angle, index) => <View key={`cap-${index}`} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", width: stroke, height: stroke, borderRadius: stroke / 2, backgroundColor: color,
        left: size / 2 + Math.sin(angle) * radius - stroke / 2, top: size / 2 - Math.cos(angle) * radius - stroke / 2 }} />)}
    {children}
  </View>;
}
