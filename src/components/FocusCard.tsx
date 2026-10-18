import { focusAreaIcon, focusAreaTitle } from "../utils/focusAreas";
import { areaTint } from "../utils/lifeAreaColor";
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
import { colors, radius, edge } from "../constants/theme";
import { durationLabel, sessionTime } from "../utils/sessionSetup";
import { sessionDockState } from "../utils/sessionReporting";

export interface FocusCardProps {
  cardID: string; startID: string; areaActionID?: string; preferencesID?: string;
  label: string; title: string; instruction: string; contentKey: string; suggested?: boolean;
  seconds: number; duration?: number; area: string; tint: string; active: boolean; running: boolean;
  busy: boolean; disabled: boolean; editDisabled: boolean; restoring?: boolean;
  failed?: boolean; error?: string; setupDisabled?: boolean; awaitingStart?: boolean; finishing?: boolean;
  // Only a real failure greys Start; a brief load keeps it solid but inert.
  dimmed?: boolean; breakSeconds?: number; onDuration: (seconds: number) => void;
  customSeconds?: number | null; onCustomDuration?: (seconds: number) => void;
  onPreferences?: () => void;
  goal?: ReactNode;
  protection?: ReactNode;
  subjects?: Subject[]; areaId?: number | null; onArea?: (id: number | null) => void; onStart: () => void;
  /** Routine · Study, shown above the rows before a session starts. */
  modeSwitch?: ReactNode;
  /** Study replaces the Category row with its own first row. */
  leadRow?: ReactNode;
  /** Routine adds its Routine row under the Category row. */
  afterArea?: ReactNode;
}
export default function FocusCard(props: FocusCardProps) {
  const areaLabel = focusAreaTitle(props.area);
  const tour = useFeatureTour(), touring = !!tour?.previewFocus;
  const locked = props.busy || (!props.active && props.disabled);
  // Drawn solid even when unavailable: a see-through bar shows the list beneath it.
  const dim = props.dimmed ?? locked;
  const editLocked = props.active || props.busy || props.editDisabled;
  const preferencesLocked = props.busy || (props.setupDisabled ?? editLocked);
  const suggested = !props.active && props.suggested;
  const openPreferences = () => { if (!preferencesLocked) props.onPreferences?.(); };
  const dock = sessionDockState({ isCompleted: false, isRunning: props.running, actionError: null, sessionSummary: null, timeLeft: props.seconds, awaitingStart: props.awaitingStart, finishing: props.finishing, breakSecondsLeft: props.breakSeconds });
  const onBreak = (props.breakSeconds ?? 0) > 0;
  const prompt = <View style={s.prompt} testID="focus-card-prompt"><ContentReveal key={props.contentKey}>
    <View style={[s.heading, props.active ? s.fieldsRow : s.group]}>
    {!props.active && props.modeSwitch}
    {!props.active && props.leadRow ? props.leadRow : !props.active && props.onPreferences ? <Pressable testID={props.preferencesID ?? "focus-card-preferences"} onPress={openPreferences} disabled={preferencesLocked} style={[s.areaButton, preferencesLocked && s.disabled]}
      accessibilityRole="button" accessibilityLabel="Change focus direction" accessibilityHint="Choose where this time counts." accessibilityState={{ disabled: preferencesLocked }}>
      <View style={[s.rowIcon, { backgroundColor: areaTint(props.tint) }]}><Ionicons name={focusAreaIcon(props.area)} size={16} color={props.tint} /></View><Text style={s.rowLabel}>Category</Text><View style={s.rowValue}><Text style={s.rowValueText} numberOfLines={1}>{areaLabel}</Text></View><Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
    </Pressable> : <View style={s.areaValue}><View style={[s.dot, { backgroundColor: props.tint }]} /><Text style={s.title} accessibilityRole="header">{props.active ? props.title : areaLabel}</Text></View>}
    {!props.active && !props.leadRow && props.afterArea}
    {!props.active && <FocusLengthControl compact showLabel={false} seconds={props.seconds} customSeconds={props.customSeconds} disabled={editLocked} onChange={props.onDuration} onCustomSave={props.onCustomDuration} />}
    {!props.active && props.protection}
    </View>
    {!props.active && !props.leadRow && suggested && <View style={s.suggestionRow} testID="focus-card-suggestion">
      <Ionicons name="bulb-outline" size={15} color={colors.accent} />
      <Text style={s.suggestion} numberOfLines={2} accessibilityLabel={`Suggested: ${props.title}. ${props.instruction}`}>{`Suggested: ${props.title}`}</Text>
    </View>}
    {props.active && <Text style={s.instruction} numberOfLines={touring ? tour?.previewLines ?? 2 : 2}>{props.instruction}</Text>}
  </ContentReveal></View>;
  return <View style={[s.cardIdle, touring && s.tourCard]} testID={props.cardID}>
    {props.goal && <View style={s.goalCard}>{props.goal}</View>}
    {props.active ? <View style={s.sessionCard}>
      <View style={s.heading}>
        <Text style={[s.label, onBreak && s.breakLabel]}>{props.awaitingStart ? "Checking session start" : props.finishing ? "Finishing up" : onBreak ? "On break · protection returns by itself" : props.running ? "In progress" : "Paused"}</Text>
      </View>
      {prompt}
      <View style={s.duration} testID="focus-card-duration"><Text style={s.meta}>{props.awaitingStart ? "Planned time" : onBreak ? `Break left · ${sessionTime(props.seconds)} of focus after` : "Time remaining"}</Text><Text style={[s.remaining, onBreak && s.breakTime]} accessibilityLabel={durationLabel(onBreak ? props.breakSeconds ?? 0 : props.seconds)}>{sessionTime(onBreak ? props.breakSeconds ?? 0 : props.seconds)}</Text></View>
    </View> : prompt}
    {props.active && !!props.protection && <View style={s.group}>{props.protection}</View>}
    <PinnedAction>
      {props.active ? <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={s.banner}
        accessibilityRole="button" accessibilityLabel="Continue session" accessibilityState={{ disabled: locked, busy: props.busy }}>
        {!props.awaitingStart && !!props.duration && props.duration > 0 && <View pointerEvents="none" style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${Math.max(0, Math.min(1, 1 - props.seconds / props.duration)) * 100}%` }]} />
        </View>}
        <View style={s.bannerCopy}>
          <View style={s.bannerLabel}><Ionicons name={dock.icon} size={16} color={colors.primaryText} /><Text style={s.barTitle} numberOfLines={1}>{dock.label}</Text></View>
          {!!dock.detail && <Text style={s.barTime} numberOfLines={1}>{props.awaitingStart ? dock.detail : `${dock.detail} left`}</Text>}
        </View>
        <View style={s.bannerCircle}><Ionicons name="chevron-up" size={20} color={colors.primary} /></View>
      </Pressable> : <Pressable testID={props.startID} onPress={props.onStart} disabled={locked} style={[s.startTile, dim && s.startDim]}
        accessibilityRole="button" accessibilityLabel={`Start ${durationLabel(props.seconds)}, ${areaLabel}`} accessibilityState={{ disabled: locked, busy: props.busy }}>
        <View style={[s.playCircle, dim && s.playDim]}><Ionicons name="play" size={18} color={dim ? colors.secondary : colors.primary} /></View>
        <View style={s.startCopy}>
          <Text style={[s.startText, dim && s.startTextDim]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{props.busy ? "Starting…" : props.failed ? "Retry start" : props.restoring ? "Restoring session…" : `Start ${durationLabel(props.seconds)} · ${areaLabel}`}</Text>
        </View>
      </Pressable>}
    </PinnedAction>
    {!!props.error && <Text style={s.error} accessibilityRole="alert">{props.error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 20, borderRadius: radius.card, gap: 16, backgroundColor: colors.focusSurface, ...edge }, fieldsRow: { flexWrap: "nowrap", alignItems: "stretch" },
  tourCard: { gap: 12 }, goal: { paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  label: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "500", flexShrink: 1 },
  change: { minHeight: 44, minWidth: 68, paddingHorizontal: 4, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  changeText: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  prompt: { minHeight: 0 }, title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3, flexShrink: 1 },
  suggestionRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8, paddingHorizontal: 16 },
  suggestion: { color: colors.secondary, fontSize: 13, lineHeight: 18, flex: 1 },
  instruction: { color: colors.secondary, fontSize: 14, lineHeight: 20, marginTop: 8 },
  areaValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }, dot: { width: 10, height: 10, borderRadius: 5 },
  areaButton: { minHeight: 52, paddingVertical: 11, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, duration: { gap: 2, marginTop: 4 },
  durationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, optionText: { color: colors.secondary, fontSize: 15, lineHeight: 20, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  remaining: { color: colors.text, fontSize: 40, lineHeight: 48, fontWeight: "600", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  primary: { minHeight: 58, padding: 14, borderRadius: 20, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", flexShrink: 1, textAlign: "center" },
  breakLabel: { color: colors.streak, fontWeight: "600" }, breakTime: { color: colors.streak },
  disabled: { opacity: 0.5 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  cardIdle: { width: "100%", gap: 12 },
  goalCard: { ...edge, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  group: { ...edge, flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch", gap: 0, backgroundColor: colors.surface, borderRadius: radius.card, overflow: "hidden" },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  rowLabel: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  rowValue: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  rowValueText: { color: colors.secondary, fontSize: 16, lineHeight: 22 },
  startTile: { minHeight: 60, paddingLeft: 22, paddingRight: 9, paddingVertical: 8, borderRadius: 30, flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.primary },
  startText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  startDim: { backgroundColor: colors.sheetCard }, startTextDim: { color: colors.secondary }, playDim: { backgroundColor: colors.selection },
  playCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  sessionCard: { padding: 16, gap: 10, borderRadius: radius.card, backgroundColor: colors.surface, ...edge },
  startCopy: { flex: 1, minWidth: 0 },
  banner: { minHeight: 60, paddingLeft: 22, paddingRight: 9, paddingVertical: 8, borderRadius: 30, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: colors.primary },
  bannerCopy: { flex: 1, minWidth: 0, gap: 1 },
  bannerLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  barTitle: { flexShrink: 1, color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  barTime: { color: colors.primaryText, opacity: 0.68, fontSize: 14, lineHeight: 20, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bannerCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(0,20,13,0.12)" },
  progressFill: { height: 4, backgroundColor: "rgba(0,20,13,0.7)" },
});
