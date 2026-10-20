import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";

/**
 * A tab's "?" card: a few numbered tips, nothing to fill in, so it floats.
 * Study and Routines share it, so both read and behave the same.
 */
export default function HowItWorksSheet({ visible, onClose, onDismiss, title, label, steps }: {
  visible: boolean; onClose: () => void; onDismiss?: () => void; title: string; label: string; steps: readonly (readonly [string, string])[];
}) {
  const insets = useSafeAreaInsets();
  return <AppSheet visible={visible} onRequestClose={onClose} onDismiss={onDismiss} compact label={label} motionMode="timed"
    header={<SheetHeader title={title} onClose={onClose} />}>
    <BottomSheetScrollView contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
      <View style={s.list}>{steps.map(([heading, body], index) => <View key={heading} style={[s.row, index > 0 && s.line]}>
        <View style={s.step}><Text style={s.stepText}>{index + 1}</Text></View>
        <View style={s.flex}><Text style={s.title}>{heading}</Text><Text style={s.caption}>{body}</Text></View>
      </View>)}</View>
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 12 }, flex: { flex: 1, minWidth: 0 },
  list: { ...edge, borderRadius: 20, backgroundColor: colors.sheetCard, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  step: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  stepText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  title: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
