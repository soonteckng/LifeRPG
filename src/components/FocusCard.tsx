import { focusAreaTitle } from "../utils/focusAreas";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import ContentReveal from "./ContentReveal";
import FocusLengthControl from "./FocusLengthControl";
import FocusAreaSheet from "./FocusAreaSheet";
import type { Subject } from "../services/taskService";
import { colors } from "../constants/theme";
import { durationLabel } from "../utils/sessionSetup";

export interface FocusCardProps {
  cardID: string; startID: string; areaActionID?: string;
  label: string; title: string; instruction: string; contentKey: string;
  seconds: number; area: string; tint: string; active: boolean; running: boolean;
  busy: boolean; disabled: boolean; editDisabled: boolean; restoring?: boolean;
  failed?: boolean; error?: string; setupDisabled?: boolean; onDuration: (seconds: number) => void;
  subjects?: Subject[]; areaId?: number | null; onArea?: (id: number | null) => void; onStart: () => void;
}
export default function FocusCard(props: FocusCardProps) {
  const areaLabel = focusAreaTitle(props.area);
  const [areaOpen, setAreaOpen] = useState(false);
  const locked = props.busy || (!props.active && props.disabled);
  const editLocked = props.active || props.busy || props.editDisabled;
  return <View style={s.card} testID={props.cardID}>
    <Text style={s.label}>{props.active ? props.running ? "In focus" : "Paused" : props.label}</Text>
    <View style={s.prompt} testID="focus-card-prompt"><ContentReveal key={props.contentKey}>
      <Text style={s.title} accessibilityRole="header">{props.title}</Text>
      <Text style={s.instruction}>{props.instruction}</Text>
    </ContentReveal></View>
    {props.active ? <View style={s.areaRow}><Text style={s.meta}>Focus area</Text><View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.area}>{areaLabel}</Text></View></View>
      : <Pressable testID={props.areaActionID} onPress={() => setAreaOpen(true)} disabled={props.setupDisabled ?? editLocked} style={s.areaRow} accessibilityRole="button" accessibilityLabel="Choose focus area" accessibilityState={{ disabled: props.setupDisabled ?? editLocked }}>
        <Text style={s.meta}>Focus area</Text><View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.area} numberOfLines={2}>{areaLabel}</Text><Ionicons name="chevron-forward" size={16} color={colors.accent} /></View>
      </Pressable>}
    <View style={s.duration} testID="focus-card-duration">
      {props.active ? <><Text style={s.meta}>Time remaining</Text><Text style={s.remaining}>{durationLabel(props.seconds)}</Text></>
        : <FocusLengthControl seconds={props.seconds} disabled={editLocked} onChange={props.onDuration} />}
    </View>
    <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={[s.primary, locked && s.disabled]}
      accessibilityRole="button" accessibilityLabel={props.active ? "Continue session" : `Start ${durationLabel(props.seconds)}, ${areaLabel}`} accessibilityState={{ disabled: locked, busy: props.busy }}>
      <Ionicons name="play-outline" size={22} color={colors.primaryText} /><Text style={s.primaryText}>{props.busy ? "Starting…" : props.active ? "Continue session" : props.failed ? "Retry start" : props.restoring ? "Restoring session…" : "Start focusing"}</Text>
    </Pressable>
    {!!props.error && <Text style={s.error} accessibilityRole="alert">{props.error}</Text>}
    <FocusAreaSheet visible={areaOpen && !props.active} subjects={props.subjects ?? []} selectedId={props.areaId ?? null} disabled={editLocked} onClose={() => setAreaOpen(false)} onSelect={id => props.onArea?.(id)} />
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 18, borderRadius: 24, gap: 16, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  prompt: { minHeight: 118 }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.5 },
  instruction: { color: colors.secondary, fontSize: 16, lineHeight: 23, marginTop: 8 },
  areaRow: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  areaValue: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 }, area: { color: colors.text, fontSize: 15, lineHeight: 21, flexShrink: 1 }, dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, duration: { gap: 8 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, optionText: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  remaining: { minHeight: 50, color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: "500", fontVariant: ["tabular-nums"] },
  primary: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: colors.primaryText, fontSize: 17, lineHeight: 23, fontWeight: "500", flexShrink: 1, textAlign: "center" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
