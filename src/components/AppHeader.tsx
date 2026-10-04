import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

// One navigation bar for pushed pages and the full-screen Session.
// Direction communicates back (left) versus minimise (down).
export default function AppHeader({
  title,
  onBack,
  dismiss = false,
  backLabel = "Go back",
  action,
}: {
  title: string;
  onBack: () => void;
  dismiss?: boolean;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.bar}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={s.control}
        hitSlop={4}
      >
        <Ionicons
          name={dismiss ? "chevron-down" : "chevron-back"}
          size={24}
          color={colors.text}
        />
      </Pressable>
      <Text style={s.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={s.control}>{action}</View>
    </View>
  );
}
const s = StyleSheet.create({
  bar: {
    minHeight: 56,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
});
