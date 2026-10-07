import { durationLabel } from "../utils/sessionSetup";
import { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import AppSheet from "./AppSheet";
import ContentReveal from "./ContentReveal";
import SlidingSelection from "./SlidingSelection";
import { TourAnchor } from "./FeatureTour";
import { colors } from "../constants/theme";
import { STARTER_QUESTS, suggestedFocus, readSuggestedFocus, type SuggestedFocus } from "../constants/guidedQuests";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { useTimer } from "../context/TimerContext";
import type { Subject } from "../services/taskService";
export default function GuidedFocusCard({ owner, subjects, activeTitle, disabled, onStarted, onFree, onPreferences }: {
  owner: string; subjects: Subject[]; activeTitle?: string; disabled: boolean; onStarted: () => void; onFree: () => void; onPreferences: () => void;
}) {
  const preference = useGuidedPreference(owner);
  const timer = useTimer();
  const insets = useSafeAreaInsets();
  const [picker, setPicker] = useState(false);
  const [selection, setSelection] = useState<{ defaults: typeof preference.value; id: string; smaller: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [failed, setFailed] = useState<{ focus: SuggestedFocus; areaId: number | null; areaTitle: string } | null>(null);
  const lock = useRef(false);
  const localChoice = selection?.defaults === preference.value ? selection : null;
  const focus = failed?.focus ?? suggestedFocus(localChoice?.id ?? preference.value.templateId, localChoice?.smaller ?? false)!;
  const area = subjects.find(item => item.title.trim().toLowerCase() === "knowledge") ?? subjects.find(item => item.title.trim().toLowerCase() === "general");
  const areaId = failed ? failed.areaId : area?.id ?? null;
  const areaTitle = failed?.areaTitle ?? area?.title ?? "General";
  const locked = disabled || busy || preference.busy;
  const choose = (id: string, smaller: boolean) => {
    if (lock.current || locked) return;
    const next = suggestedFocus(id, smaller);
    if (!next) return;
    setSelection({ defaults: preference.value, id: next.templateId, smaller });
    setFailed(null); setPicker(false);
  };
  const start = async () => {
    if (lock.current || locked) return;
    if (timer.hasOpenSession) { onStarted(); return; }
    lock.current = true; setBusy(true);
    try { if (await timer.startSuggestedTimer(focus, areaId)) { if (alive.current) { setFailed(null); onStarted(); } } else setFailed({ focus, areaId, areaTitle }); }
    catch { setFailed({ focus, areaId, areaTitle }); }
    finally { lock.current = false; setBusy(false); }
  };
  const active = timer.hasOpenSession;
  const activeSuggestion = active ? readSuggestedFocus(timer.notes) : null;
  const activeArea = subjects.find(item => item.id === timer.targetAttributeId);
  return <View style={s.card} testID="guided-focus-card">
    <View style={s.heading}><Text style={s.label}>{active ? timer.isRunning ? "In focus" : "Paused" : "Suggested focus"}</Text><Pressable disabled={locked || active} onPress={onPreferences} accessibilityRole="button" accessibilityLabel="Change suggestion preferences" accessibilityState={{ disabled: locked || active }} style={s.icon}><Ionicons name="options-outline" size={20} color={colors.accent} /></Pressable></View>
    <ContentReveal key={focus.templateId + String(focus.smaller)}>
      <Text style={s.title} accessibilityRole="header">{active ? activeSuggestion?.title ?? activeTitle ?? "Free session" : focus.title}</Text>
      {active ? activeSuggestion && <Text style={s.instruction}>{activeSuggestion.instruction}</Text> : <Text style={s.instruction}>{focus.instruction}</Text>}
      <Text style={s.meta}>{active ? `${durationLabel(timer.timeLeft)} remaining · ${activeArea?.title ?? "General"}` : `${focus.seconds / 60} min · ${areaTitle}`}</Text>
    </ContentReveal>
    {!active && <View style={s.durationRow}>
      <Text style={s.durationLabel}>Focus length</Text>
      <View style={[s.durationControl, locked && s.disabled]}>
        <View pointerEvents="none" style={s.durationTrack}><SlidingSelection index={focus.smaller ? 1 : 0} settling="quick" style={s.durationSelection} /></View>
        {[false, true].map(smaller => <Pressable key={String(smaller)} disabled={locked}
          onPress={() => choose(focus.templateId, smaller)} accessibilityRole="button"
          accessibilityLabel={smaller ? "Try 10 minutes" : "Use 30 minutes"}
          accessibilityState={{ selected: focus.smaller === smaller, disabled: locked }}
          style={s.durationOption}>
          <Text style={[s.durationText, focus.smaller === smaller && s.durationSelectedText]}>{smaller ? "10 min" : "30 min"}</Text>
        </Pressable>)}
      </View>
    </View>}
    <TourAnchor id="home-focus"><Pressable testID="guided-start" disabled={locked} onPress={() => void start()} accessibilityRole="button" accessibilityState={{ busy, disabled: locked }} style={[s.primary, locked && s.disabled]}><Ionicons name="play-outline" size={20} color="#171827" /><Text style={s.primaryText}>{busy ? "Starting…" : active ? "Continue session" : failed ? "Retry start" : "Start focusing"}</Text></Pressable></TourAnchor>
    {!active && <View style={s.actions}>
      <Pressable disabled={locked} onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel="Choose another" accessibilityState={{ disabled: locked }} style={[s.action, locked && s.disabled]}>
        <Ionicons name="shuffle-outline" size={18} color={colors.accent} /><Text style={s.actionText}>Choose another</Text>
      </Pressable>
      <Pressable disabled={locked} onPress={onFree} accessibilityRole="button" accessibilityLabel="Free focus" accessibilityState={{ disabled: locked }} style={[s.action, locked && s.disabled]}>
        <Ionicons name="timer-outline" size={18} color={colors.accent} /><Text style={s.actionText}>Free focus</Text>
      </Pressable>
    </View>}
    {!active && failed && <Text style={s.error} accessibilityRole="alert">{timer.actionError ?? "Couldn’t start. Your suggestion is kept for retry."}</Text>}
    {preference.error && <Text style={s.error} accessibilityRole="alert">Couldn’t load your preferences. Try again in Settings.</Text>}
    <AppSheet visible={picker} onRequestClose={() => setPicker(false)} label="starter suggestions" compact maxHeightRatio={0.82} motionMode="timed"
      header={<Text style={[s.title, { paddingHorizontal: 20, paddingBottom: 12 }]}>Choose a focus block</Text>}>
      <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}>
        <Text style={s.label}>For this session only. Your default stays in Settings.</Text>
        <View style={{ gap: 10 }}>{STARTER_QUESTS.map(item => <SheetButton key={item.id} disabled={locked} accessibilityRole="button" accessibilityState={{ selected: focus.templateId === item.id }} onPress={() => choose(item.id, false)} style={s.option}>
          <View style={{ flex: 1, gap: 4 }}><Text style={s.optionTitle}>{item.title}</Text><Text style={s.meta}>{item.seconds / 60} minutes · One uninterrupted block</Text></View><Ionicons name={focus.templateId === item.id ? "checkmark-circle" : "chevron-forward"} size={20} color={colors.accent} />
        </SheetButton>)}</View>
        {preference.error && <Text style={s.error} accessibilityRole="alert">Couldn’t load your preferences. Try again in Settings.</Text>}
      </BottomSheetScrollView>
    </AppSheet>
  </View>;
}
const s = StyleSheet.create({
  card: { width: "100%", padding: 18, borderRadius: 24, gap: 16, backgroundColor: "#171E2B", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.16)" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500", flexShrink: 1 },
  icon: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.5 },
  instruction: { color: colors.secondary, fontSize: 16, lineHeight: 23, marginTop: 8 },
  meta: { color: colors.secondary, fontSize: 14, lineHeight: 20, marginTop: 10 },
  durationRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  durationLabel: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  durationControl: { position: "relative", flexDirection: "row", flexGrow: 1, flexBasis: 176, padding: 3, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)" },
  durationTrack: { position: "absolute", top: 3, bottom: 3, left: 3, right: 3, borderRadius: 11, overflow: "hidden" },
  durationSelection: { position: "absolute", top: 0, bottom: 0, width: "50%", borderRadius: 11, backgroundColor: "#354467" },
  durationOption: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 10, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  durationText: { color: colors.secondary, fontSize: 16, lineHeight: 22, fontWeight: "500", textAlign: "center" },
  durationSelectedText: { color: colors.text },
  primary: { minHeight: 52, borderRadius: 16, backgroundColor: "#E5E4FF", padding: 14, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#171827", fontSize: 17, lineHeight: 23, fontWeight: "500", flexShrink: 1, textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", columnGap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 },
  action: { flexGrow: 1, flexBasis: 140, minHeight: 48, paddingHorizontal: 4, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "500", flexShrink: 1 },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  option: { minHeight: 64, padding: 14, borderRadius: 16, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12 },
  optionTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "500" },
});
