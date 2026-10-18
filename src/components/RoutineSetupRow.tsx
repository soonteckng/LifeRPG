import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Pressable from "./MotionPressable";
import SheetButton from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { focusAreaTitle } from "../utils/focusAreas";
import { areaTint, lifeAreaColor } from "../utils/lifeAreaColor";
import { routineDuration } from "../utils/savedRoutine";
import type { RoutineEntry } from "../utils/routinePresentation";
import type { Subject } from "../services/taskService";

/** Routine's second row: any activity in the category, or one of your saved routines. */
export default function RoutineSetupRow({ entries, selected, areas, disabled = false, open: openProp, onOpenChange, onSelect }: {
  entries: RoutineEntry[]; selected: RoutineEntry | null; areas: Pick<Subject, "id" | "title" | "color_code">[]; disabled?: boolean;
  open?: boolean; onOpenChange?: (open: boolean) => void; onSelect: (entry: RoutineEntry | null) => void;
}) {
  const router = useRouter();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next); };
  const after = useRef<(() => void) | null>(null);
  const area = selected ? areas.find(item => item.id === selected.areaId) : undefined, tint = selected ? lifeAreaColor(selected.areaId, area?.color_code) : colors.accent;
  return <>
    <Pressable disabled={disabled} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Choose routine" accessibilityValue={{ text: selected?.name ?? "Any activity" }} style={s.row}>
      <View style={[s.icon, { backgroundColor: areaTint(tint) }]}><Ionicons name="repeat" size={16} color={tint} /></View>
      <Text style={s.label}>Routine</Text>
      <Text style={[s.value, selected ? s.chosen : s.any]} numberOfLines={1}>{selected?.name ?? "Any"}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </Pressable>
    <AppSheet visible={open} onRequestClose={() => setOpen(false)} onDismiss={() => { const go = after.current; after.current = null; go?.(); }} floating compact maxHeightRatio={0.8} label="routine choices"
      header={<SheetHeader title="Routine" subtitle="Pick one, or just focus in your category." onClose={() => setOpen(false)} />}>
      <BottomSheetScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        <SheetButton disabled={disabled} onPress={() => { onSelect(null); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: !selected }}
          accessibilityLabel="Any activity in your category" style={[s.choice, !selected && s.choiceOn]}>
          <View style={[s.choiceIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="sparkles-outline" size={18} color={colors.accent} /></View>
          <View style={s.copy}><Text style={s.choiceTitle}>Any activity</Text><Text style={s.meta}>Just focus in your category</Text></View>
          {!selected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
        </SheetButton>
        {entries.map(entry => {
          const entryArea = areas.find(item => item.id === entry.areaId), color = lifeAreaColor(entry.areaId, entryArea?.color_code), on = entry.key === selected?.key;
          return <SheetButton key={entry.key} disabled={disabled} onPress={() => { onSelect(entry); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
            accessibilityLabel={`${entry.name}, ${routineDuration(entry.seconds)}`} style={[s.choice, on && s.choiceOn]}>
            <View style={[s.choiceIcon, { backgroundColor: areaTint(color) }]}><Ionicons name="repeat" size={18} color={color} /></View>
            <View style={s.copy}><Text style={s.choiceTitle} numberOfLines={1}>{entry.name}</Text><Text style={s.meta}>{routineDuration(entry.seconds)} · {focusAreaTitle(entryArea?.title)}</Text></View>
            {on && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
          </SheetButton>;
        })}
        {!entries.length && <Text style={s.meta}>Make a routine in the Routines tab and it shows up here.</Text>}
        <SheetButton onPress={() => { after.current = () => router.navigate("/routines"); setOpen(false); }} accessibilityRole="button" style={s.manage}>
          <Text style={s.link}>{entries.length ? "Manage routines" : "Open Routines"}</Text></SheetButton>
      </BottomSheetScrollView>
    </AppSheet>
  </>;
}
const s = StyleSheet.create({
  row: { minHeight: 52, paddingVertical: 11, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  value: { flex: 1, textAlign: "right", fontSize: 16, lineHeight: 22 }, chosen: { color: colors.text }, any: { color: colors.secondary },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  choice: { ...edge, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, padding: 12, borderRadius: 16, backgroundColor: colors.sheetCard, borderWidth: 1.5 },
  choiceOn: { borderColor: colors.accent },
  choiceIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  choiceTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "500" },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  manage: { minHeight: 44, alignItems: "center", justifyContent: "center" }, link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
