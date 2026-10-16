import { focusAreaTitle } from "../utils/focusAreas";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import ContentReveal from "./ContentReveal";
import FocusLengthControl from "./FocusLengthControl";
import { useFeatureTour } from "./FeatureTour";
import type { Subject } from "../services/taskService";
import { colors } from "../constants/theme";
import { durationLabel } from "../utils/sessionSetup";

export interface FocusCardProps {
  cardID: string; startID: string; areaActionID?: string; preferencesID?: string;
  label: string; title: string; instruction: string; contentKey: string; suggested?: boolean;
  seconds: number; area: string; tint: string; active: boolean; running: boolean;
  busy: boolean; disabled: boolean; editDisabled: boolean; restoring?: boolean;
  failed?: boolean; error?: string; setupDisabled?: boolean; awaitingStart?: boolean; onDuration: (seconds: number) => void;
  customSeconds?: number | null; onCustomDuration?: (seconds: number) => void;
  onPreferences?: () => void;
  goal?: ReactNode;
  protection?: ReactNode;
  subjects?: Subject[]; areaId?: number | null; onArea?: (id: number | null) => void; onStart: () => void;
}
export default function FocusCard(props: FocusCardProps) {
  const areaLabel = focusAreaTitle(props.area);
  const tour = useFeatureTour(), touring = !!tour?.previewFocus;
  const locked = props.busy || (!props.active && props.disabled);
  const editLocked = props.active || props.busy || props.editDisabled;
  const preferencesLocked = props.busy || (props.setupDisabled ?? editLocked);
  const suggested = !props.active && props.suggested;
  const openPreferences = () => { if (!preferencesLocked) props.onPreferences?.(); };
  return <View style={[s.card, touring && s.tourCard]} testID={props.cardID}>
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[s.glow, { backgroundColor: props.tint }]} />
    {props.goal && <View style={s.goal}>{props.goal}</View>}
    {props.active && <View style={s.heading}>
      <Text style={s.label}>{props.awaitingStart ? "Checking session start" : props.active ? props.running ? "In progress" : "Paused" : "Your focus"}</Text>
    </View>}
    <View style={s.prompt} testID="focus-card-prompt"><ContentReveal key={props.contentKey}>
      <View style={s.heading}>
      {!props.active && props.onPreferences ? <Pressable testID={props.preferencesID ?? "focus-card-preferences"} onPress={openPreferences} disabled={preferencesLocked} style={[s.areaValue, s.areaButton, preferencesLocked && s.disabled]}
        accessibilityRole="button" accessibilityLabel="Change focus direction" accessibilityHint="Choose your focus area and a suggested activity, or free focus." accessibilityState={{ disabled: preferencesLocked }}>
        <View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.title}>{areaLabel}</Text><Ionicons name="chevron-down" size={13} color={colors.accent} />
      </Pressable> : <View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.title} accessibilityRole="header">{props.active ? props.title : areaLabel}</Text></View>}
      {!props.active && <FocusLengthControl compact showLabel={false} seconds={props.seconds} customSeconds={props.customSeconds} disabled={editLocked} onChange={props.onDuration} onCustomSave={props.onCustomDuration} />}
      </View>
      {!props.active && <View style={s.suggestionRow} testID="focus-card-suggestion">
        <Ionicons name={suggested ? "bulb-outline" : "leaf-outline"} size={17} color={suggested ? colors.accent : colors.secondary} />
        <Text style={s.suggestion} numberOfLines={2} accessibilityLabel={suggested ? `Suggested: ${props.title}. ${props.instruction}` : "Free focus. Choose your own activity."}>{suggested ? `Suggested: ${props.title}` : "Free focus · One thing at a time."}</Text>
      </View>}
      {props.active && <Text style={s.instruction} numberOfLines={touring ? tour?.previewLines ?? 2 : 2}>{props.instruction}</Text>}
    </ContentReveal></View>
    {props.active && <View style={s.duration} testID="focus-card-duration"><Text style={s.meta}>{props.awaitingStart ? "Planned time" : "Time remaining"}</Text><Text style={s.remaining}>{durationLabel(props.seconds)}</Text></View>}
    <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={[s.primary, locked && s.disabled]}
      accessibilityRole="button" accessibilityLabel={props.active ? "Continue session" : `Start ${durationLabel(props.seconds)}, ${areaLabel}`} accessibilityState={{ disabled: locked, busy: props.busy }}>
      <Ionicons name="play" size={18} color={colors.primaryText} /><Text style={s.primaryText}>{props.busy ? "Starting…" : props.active ? "Continue session" : props.failed ? "Retry start" : props.restoring ? "Restoring session…" : "Start session"}</Text>
    </Pressable>
    {props.protection}
    {!!props.error && <Text style={s.error} accessibilityRole="alert">{props.error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 20, borderRadius: 28, gap: 16, backgroundColor: colors.focusSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(170,179,255,0.2)", overflow: "hidden" }, glow: { position: "absolute", top: -96, right: -72, width: 230, height: 230, borderRadius: 115, opacity: 0.13 },
  tourCard: { gap: 12 }, goal: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500", flexShrink: 1 },
  change: { minHeight: 44, minWidth: 68, paddingHorizontal: 4, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  changeText: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  prompt: { minHeight: 0 }, title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3, flexShrink: 1 },
  suggestionRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 8 },
  suggestion: { color: colors.muted, fontSize: 14, lineHeight: 21, flex: 1 },
  instruction: { color: colors.secondary, fontSize: 14, lineHeight: 21, marginTop: 8 },
  areaValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }, dot: { width: 10, height: 10, borderRadius: 5 },
  areaButton: { flexBasis: 200, minWidth: 200, minHeight: 44, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)" },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, duration: { gap: 8 },
  durationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, optionText: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  remaining: { minHeight: 50, color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: "500", fontVariant: ["tabular-nums"] },
  primary: { minHeight: 58, padding: 14, borderRadius: 20, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: colors.primaryText, fontSize: 17, lineHeight: 23, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
