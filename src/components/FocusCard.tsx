import { focusAreaTitle } from "../utils/focusAreas";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import ContentReveal from "./ContentReveal";
import FocusLengthControl from "./FocusLengthControl";
import { PinnedAction } from "./PinnedAction";
import { useFeatureTour } from "./FeatureTour";
import type { Subject } from "../services/taskService";
import { colors } from "../constants/theme";
import { durationLabel, sessionTime } from "../utils/sessionSetup";
import { sessionDockState } from "../utils/sessionReporting";

export interface FocusCardProps {
  cardID: string; startID: string; areaActionID?: string; preferencesID?: string;
  label: string; title: string; instruction: string; contentKey: string; suggested?: boolean;
  seconds: number; duration?: number; area: string; tint: string; active: boolean; running: boolean;
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
  const dock = sessionDockState({ isCompleted: false, isRunning: props.running, actionError: null, sessionSummary: null, timeLeft: props.seconds, awaitingStart: props.awaitingStart });
  const prompt = <View style={s.prompt} testID="focus-card-prompt"><ContentReveal key={props.contentKey}>
    <View style={[s.heading, props.active ? s.fieldsRow : s.group]}>
    {!props.active && props.onPreferences ? <Pressable testID={props.preferencesID ?? "focus-card-preferences"} onPress={openPreferences} disabled={preferencesLocked} style={[s.areaButton, preferencesLocked && s.disabled]}
      accessibilityRole="button" accessibilityLabel="Change focus direction" accessibilityHint="Choose your focus area and a suggested activity, or free focus." accessibilityState={{ disabled: preferencesLocked }}>
      <View style={s.rowIcon}><View style={[s.dot, { backgroundColor: props.tint }]} /></View><Text style={s.rowLabel}>Focus area</Text><View style={s.rowValue}><Text style={s.rowValueText} numberOfLines={1}>{areaLabel}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable> : <View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.title} accessibilityRole="header">{props.active ? props.title : areaLabel}</Text></View>}
    {!props.active && <FocusLengthControl compact showLabel={false} seconds={props.seconds} customSeconds={props.customSeconds} disabled={editLocked} onChange={props.onDuration} onCustomSave={props.onCustomDuration} />}
    {!props.active && props.protection}
    </View>
    {!props.active && <View style={s.suggestionRow} testID="focus-card-suggestion">
      <Ionicons name={suggested ? "bulb-outline" : "leaf-outline"} size={15} color={suggested ? colors.accent : colors.secondary} />
      <Text style={s.suggestion} numberOfLines={2} accessibilityLabel={suggested ? `Suggested: ${props.title}. ${props.instruction}` : "Free focus. Choose your own activity."}>{suggested ? `Suggested: ${props.title}` : "Free focus · One thing at a time."}</Text>
    </View>}
    {props.active && <Text style={s.instruction} numberOfLines={touring ? tour?.previewLines ?? 2 : 2}>{props.instruction}</Text>}
  </ContentReveal></View>;
  return <View style={[s.cardIdle, touring && s.tourCard]} testID={props.cardID}>
    {props.goal && <View style={s.goalCard}>{props.goal}</View>}
    {props.active ? <View style={s.sessionCard}>
      <View style={s.heading}>
        <Text style={s.label}>{props.awaitingStart ? "Checking session start" : props.running ? "In progress" : "Paused"}</Text>
      </View>
      {prompt}
      <View style={s.duration} testID="focus-card-duration"><Text style={s.meta}>{props.awaitingStart ? "Planned time" : "Time remaining"}</Text><Text style={s.remaining} accessibilityLabel={durationLabel(props.seconds)}>{sessionTime(props.seconds)}</Text></View>
    </View> : prompt}
    {props.active && !!props.protection && <View style={s.group}>{props.protection}</View>}
    <PinnedAction>
      {props.active ? <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={[s.banner, locked && s.disabled]}
        accessibilityRole="button" accessibilityLabel="Continue session" accessibilityState={{ disabled: locked, busy: props.busy }}>
        <View pointerEvents="none" style={s.bannerTint} />
        {!props.awaitingStart && !!props.duration && props.duration > 0 && <View pointerEvents="none" style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.max(0, Math.min(1, 1 - props.seconds / props.duration)) * 100}%` }]} />
        </View>}
        <View style={s.bannerCopy}>
          <View style={s.bannerLabel}><Ionicons name={dock.icon} size={16} color={colors.accent} /><Text style={s.barTitle} numberOfLines={1}>{dock.label}</Text></View>
          {!!dock.detail && <Text style={s.barTime} numberOfLines={1}>{dock.detail}</Text>}
        </View>
        <View style={s.bannerCircle}><Ionicons name="chevron-up" size={20} color={colors.accent} /></View>
      </Pressable> : <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={[s.startTile, locked && s.disabled]}
        accessibilityRole="button" accessibilityLabel={`Start ${durationLabel(props.seconds)}, ${areaLabel}`} accessibilityState={{ disabled: locked, busy: props.busy }}>
        <View style={s.playCircle}><Ionicons name="play" size={20} color={colors.primary} /></View>
        <View style={s.startCopy}>
          <Text style={s.startText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{props.busy ? "Starting…" : props.failed ? "Retry start" : props.restoring ? "Restoring session…" : "Start session"}</Text>
        </View>
      </Pressable>}
    </PinnedAction>
    {!!props.error && <Text style={s.error} accessibilityRole="alert">{props.error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 20, borderRadius: 28, gap: 16, backgroundColor: colors.focusSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(170,179,255,0.2)" }, fieldsRow: { flexWrap: "nowrap", alignItems: "stretch" },
  tourCard: { gap: 12 }, goal: { paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  label: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "500", flexShrink: 1 },
  change: { minHeight: 44, minWidth: 68, paddingHorizontal: 4, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  changeText: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  prompt: { minHeight: 0 }, title: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "600", letterSpacing: -0.3, flexShrink: 1 },
  suggestionRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8, paddingHorizontal: 16 },
  suggestion: { color: colors.secondary, fontSize: 13, lineHeight: 19, flex: 1 },
  instruction: { color: colors.secondary, fontSize: 14, lineHeight: 21, marginTop: 8 },
  areaValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }, dot: { width: 10, height: 10, borderRadius: 5 },
  areaButton: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, duration: { gap: 2, marginTop: 4 },
  durationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, optionText: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  remaining: { color: colors.text, fontSize: 40, lineHeight: 48, fontWeight: "600", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  primary: { minHeight: 58, padding: 14, borderRadius: 20, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: colors.primaryText, fontSize: 17, lineHeight: 23, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  cardIdle: { width: "100%", gap: 12 },
  goalCard: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  group: { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch", gap: 0, backgroundColor: colors.surface, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: "hidden" },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  rowLabel: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  rowValue: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  rowValueText: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  startTile: { minHeight: 60, paddingLeft: 20, paddingRight: 10, paddingVertical: 8, borderRadius: 22, flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.primary },
  startText: { color: colors.primaryText, fontSize: 18, lineHeight: 24, fontWeight: "600", letterSpacing: -0.3 },
  playCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  sessionCard: { padding: 16, gap: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  startCopy: { flex: 1, minWidth: 0 },
  banner: { minHeight: 60, paddingLeft: 20, paddingRight: 10, paddingVertical: 8, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(170,179,255,0.3)" },
  bannerTint: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(170,179,255,0.14)" },
  bannerCopy: { flex: 1, minWidth: 0, gap: 1 },
  bannerLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  barTitle: { flexShrink: 1, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  barTime: { color: colors.accent, fontSize: 14, lineHeight: 19, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bannerCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(170,179,255,0.2)" },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(170,179,255,0.12)" },
  progressFill: { height: 3, backgroundColor: colors.accent },
});
