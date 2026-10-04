import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { type } from "../constants/typography";
import { colors } from "../constants/theme";

// One navigation bar for pushed pages and the full-screen Session.
// Direction communicates back (left) versus minimise (down).
export default function AppHeader({
  title,
  onBack,
  dismiss = false,
  backLabel = "Go back",
  action,
  centered = false,
}: {
  title: string;
  onBack?: () => void;
  dismiss?: boolean;
  backLabel?: string;
  action?: ReactNode;
  centered?: boolean;
}) {
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
          color={colors.text}
        />
      </Pressable>}
      <Text style={[s.title, centered && { textAlign: "center", fontSize: 18 }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {(action || centered) && <View style={s.control}>{action}</View>}
    </View>
  );
}
const s = StyleSheet.create({
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
