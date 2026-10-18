import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";

/** A list row that slides left to reveal Edit and Remove, as in Mail or Reminders. Routines and exams share it. */
export default function SwipeRow({ enabled, label, onEdit, onRemove, children }: { enabled: boolean; label: string; onEdit: () => void; onRemove?: () => void; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <Swipeable friction={1.6} rightThreshold={56} overshootRight={false} dragOffsetFromRightEdge={12}
    renderRightActions={(_progress, _translation, methods) => <View style={s.actions}>
      <Pressable onPress={() => { methods.close(); onEdit(); }} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} style={[s.action, s.edit]}><Ionicons name="create-outline" size={19} color={colors.text} /><Text style={s.text}>Edit</Text></Pressable>
      {onRemove && <Pressable onPress={() => { methods.close(); onRemove(); }} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} style={[s.action, s.remove]}><Ionicons name="trash-outline" size={19} color={colors.text} /><Text style={s.text}>Remove</Text></Pressable>}
    </View>}>{children}</Swipeable>;
}
const s = StyleSheet.create({
  actions: { flexDirection: "row" },
  action: { width: 76, alignItems: "center", justifyContent: "center", gap: 3 },
  edit: { backgroundColor: colors.selection }, remove: { backgroundColor: "#D93D35" },
  text: { color: colors.text, fontSize: 13, fontWeight: "600" },
});
