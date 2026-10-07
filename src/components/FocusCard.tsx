import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import ContentReveal from "./ContentReveal";
import FocusDurationSheet from "./FocusDurationSheet";
import { colors } from "../constants/theme";
import { durationLabel } from "../utils/sessionSetup";

export interface FocusCardProps {
  cardID: string; startID: string; areaActionID?: string;
  label: string; title: string; instruction: string; contentKey: string;
  seconds: number; area: string; tint: string; active: boolean; running: boolean;
  busy: boolean; disabled: boolean; editDisabled: boolean; restoring?: boolean;
  failed?: boolean; error?: string; setupDisabled?: boolean; onDuration: (seconds: number) => void;
  onSetup: () => void; onStart: () => void;
}
export default function FocusCard(props: FocusCardProps) {
  const [custom, setCustom] = useState(false);
  const locked = props.busy || (!props.active && props.disabled);
  const editLocked = props.active || props.busy || props.editDisabled;
  const customSelected = props.seconds !== 600 && props.seconds !== 1800;
  return <View style={s.card} testID={props.cardID}>
    <Text style={s.label}>{props.active ? props.running ? "In focus" : "Paused" : props.label}</Text>
    <View style={s.prompt} testID="focus-card-prompt"><ContentReveal key={props.contentKey}>
      <Text style={s.title} accessibilityRole="header">{props.title}</Text>
      <Text style={s.instruction}>{props.instruction}</Text>
    </ContentReveal></View>
    {props.active ? <View style={s.areaRow}><Text style={s.meta}>Life area</Text><View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.area}>{props.area}</Text></View></View>
      : <Pressable testID={props.areaActionID} onPress={props.onSetup} disabled={props.setupDisabled ?? editLocked} style={s.areaRow} accessibilityRole="button" accessibilityLabel="Change duration or area" accessibilityState={{ disabled: props.setupDisabled ?? editLocked }}>
        <Text style={s.meta}>Life area</Text><View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.area} numberOfLines={2}>{props.area}</Text><Ionicons name="chevron-forward" size={16} color={colors.accent} /></View>
      </Pressable>}
    <View style={s.duration} testID="focus-card-duration">
      <Text style={s.meta}>{props.active ? "Time remaining" : "Focus length"}</Text>
      {props.active ? <Text style={s.remaining}>{durationLabel(props.seconds)}</Text> : <View style={s.presets}>
        {[600, 1800].map(seconds => <Pressable key={seconds} onPress={() => props.onDuration(seconds)} disabled={editLocked}
          accessibilityRole="button" accessibilityLabel={`Use ${seconds / 60} minutes`} accessibilityState={{ selected: props.seconds === seconds, disabled: editLocked }}
          style={[s.option, props.seconds === seconds && s.selected]}><Text style={[s.optionText, props.seconds === seconds && s.selectedText]}>{seconds / 60} min</Text></Pressable>)}
        <Pressable onPress={() => setCustom(true)} disabled={editLocked} accessibilityRole="button" accessibilityLabel="Set a custom focus duration"
          accessibilityState={{ selected: customSelected, disabled: editLocked }} style={[s.option, customSelected && s.selected]}>
          <Text style={[s.optionText, customSelected && s.selectedText]}>{customSelected ? durationLabel(props.seconds) : "Custom"}</Text>
        </Pressable>
      </View>}
    </View>
    <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={[s.primary, locked && s.disabled]}
      accessibilityRole="button" accessibilityLabel={props.active ? "Continue session" : `Start ${durationLabel(props.seconds)}, ${props.area}`} accessibilityState={{ disabled: locked, busy: props.busy }}>
      <Ionicons name="play-outline" size={22} color="#171827" /><Text style={s.primaryText}>{props.busy ? "Starting…" : props.active ? "Continue session" : props.failed ? "Retry start" : props.restoring ? "Restoring session…" : "Start focusing"}</Text>
    </Pressable>
    {!!props.error && <Text style={s.error} accessibilityRole="alert">{props.error}</Text>}
    <FocusDurationSheet seconds={props.seconds} visible={custom && !props.active} disabled={editLocked} onClose={() => setCustom(false)} onSave={props.onDuration} />
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 18, borderRadius: 24, gap: 16, backgroundColor: "#171E2B", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.16)" },
  label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  prompt: { minHeight: 118 }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.5 },
  instruction: { color: colors.secondary, fontSize: 16, lineHeight: 23, marginTop: 8 },
  areaRow: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  areaValue: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 }, area: { color: colors.text, fontSize: 15, lineHeight: 21, flexShrink: 1 }, dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, duration: { gap: 8 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: "#354467" }, optionText: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  remaining: { minHeight: 50, color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: "500", fontVariant: ["tabular-nums"] },
  primary: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: "#E5E4FF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: "#171827", fontSize: 17, lineHeight: 23, fontWeight: "500", flexShrink: 1, textAlign: "center" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
