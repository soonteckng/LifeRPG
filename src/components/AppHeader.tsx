import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { type } from "../constants/typography";
import { colors, sceneInk } from "../constants/theme";

// One navigation bar for pushed pages and the full-screen Session.
// Direction communicates back (left) versus minimise (down).
export default function AppHeader({
  title,
  onBack,
  dismiss = false,
  backLabel = "Go back",
  action,
  centered = false,
  onToday,
  light = false,
}: {
  title: string;
  /** Over the dark session scene. */
  light?: boolean;
  /** Pages that open from Today: a "Today" link above the title goes back. */
  onToday?: () => void;
  onBack?: () => void;
  dismiss?: boolean;
  backLabel?: string;
  action?: ReactNode;
  centered?: boolean;
}) {
  if (onToday) return (
    <View style={s.stacked}>
      <View style={s.todayRow}>
        <Pressable onPress={onToday} accessibilityRole="button" accessibilityLabel="Back to Today" style={s.today} hitSlop={6} testID="header-today">
          <Ionicons name="chevron-back" size={20} color={colors.accent} />
          <Text style={s.todayText}>Today</Text>
        </Pressable>
        {action && <View style={s.control}>{action}</View>}
      </View>
      <Text style={s.bigTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
    </View>
  );
  return (
    <View style={s.bar}>
      {onBack && <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={s.control}
        hitSlop={4}
      >
        <Ionicons
          name={dismiss ? "chevron-down" : "chevron-back"}
          size={24}
          color={light ? sceneInk.text : colors.text}
        />
      </Pressable>}
      <Text style={[s.title, centered && { textAlign: "center", fontSize: 20 }, light && { color: sceneInk.text }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {(action || centered) && <View style={s.control}>{action}</View>}
    </View>
  );
}
const s = StyleSheet.create({
  stacked: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6, gap: 2 },
  todayRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  today: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -6, paddingRight: 8 },
  todayText: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  bigTitle: { ...type.pageTitle, fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  bar: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  control: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "left",
    ...type.pageTitle,
  },
});
