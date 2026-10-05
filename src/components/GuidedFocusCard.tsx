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
import { colors } from "../constants/theme";
import { STARTER_QUESTS, STUDY_NEEDS, suggestedFocus, readSuggestedFocus, type SuggestedFocus } from "../constants/guidedQuests";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { useTimer } from "../context/TimerContext";
import type { Subject, Task } from "../services/taskService";
export default function GuidedFocusCard({ owner, subjects, quest, activeTitle, disabled, onStarted, onQuest, onFree, onPreferences }: {
  owner: string; subjects: Subject[]; quest?: Task; activeTitle?: string; disabled: boolean; onStarted: () => void; onQuest: (quest: Task) => void; onFree: () => void; onPreferences: () => void;
}) {
  const preference = useGuidedPreference(owner);
  const timer = useTimer();
  const insets = useSafeAreaInsets();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [useStarter, setUseStarter] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [failed, setFailed] = useState<{ focus: SuggestedFocus; areaId: number | null; areaTitle: string } | null>(null);
  const lock = useRef(false);
  const focus = failed?.focus ?? suggestedFocus(preference.value.templateId, preference.value.smaller)!;
  const area = subjects.find(item => item.title.trim().toLowerCase() === "knowledge") ?? subjects.find(item => item.title.trim().toLowerCase() === "general");
  const areaId = failed ? failed.areaId : area?.id ?? null;
  const areaTitle = failed?.areaTitle ?? area?.title ?? "General";
  const locked = disabled || busy || preference.busy;
  const choose = async (id: string, smaller: boolean) => {
    if (lock.current || locked) return;
    const next = suggestedFocus(id, smaller)!;
    if (await preference.save({ ...preference.value, templateId: id, need: next.need, smaller })) { setFailed(null); setUseStarter(true); setPicker(false); }
  };
  const start = async () => {
    if (lock.current || locked) return;
    if (timer.hasOpenSession) { onStarted(); return; }
    if (quest && !failed && !useStarter) { onQuest(quest); return; }
    lock.current = true; setBusy(true);
    try { if (await timer.startSuggestedTimer(focus, areaId)) { if (alive.current) { setFailed(null); onStarted(); } } else setFailed({ focus, areaId, areaTitle }); }
    catch { setFailed({ focus, areaId, areaTitle }); }
    finally { lock.current = false; setBusy(false); }
  };
  const ownQuest = quest && !failed && !useStarter;
  const active = timer.hasOpenSession;
  const activeSuggestion = active ? readSuggestedFocus(timer.notes) : null;
  const activeArea = subjects.find(item => item.id === timer.targetAttributeId);
  return <View style={s.card} testID="guided-focus-card">
    <View style={s.heading}><Text style={s.label}>{active ? timer.isRunning ? "In focus" : "Paused" : ownQuest ? "Your next quest" : "A small start for today"}</Text><Pressable disabled={locked || active} onPress={onPreferences} accessibilityRole="button" accessibilityLabel="Change suggestion preferences" style={s.icon}><Ionicons name="options-outline" size={20} color={colors.accent} /></Pressable></View>
    <ContentReveal key={ownQuest ? quest.id : focus.templateId + String(focus.smaller)}>
      <Text style={s.title} accessibilityRole="header">{active ? activeSuggestion?.title ?? activeTitle ?? "Free session" : ownQuest ? quest.title : focus.title}</Text>
      {active ? activeSuggestion && <Text style={s.instruction}>{activeSuggestion.instruction}</Text> : !ownQuest && <Text style={s.instruction}>{focus.instruction}</Text>}
      <Text style={s.meta}>{active ? `${durationLabel(timer.timeLeft)} remaining · ${activeArea?.title ?? "General"}` : <>{ownQuest ? quest.target_minutes || 30 : focus.seconds / 60} min · {ownQuest ? subjects.find(item => item.id === quest.subject_id)?.title ?? "General" : areaTitle}</>}</Text>
    </ContentReveal>
    <Pressable testID="guided-start" disabled={locked} onPress={() => void start()} accessibilityRole="button" accessibilityState={{ busy, disabled: locked }} style={s.primary}><Ionicons name="play-outline" size={20} color="#171827" /><Text style={s.primaryText}>{busy ? "Starting…" : active ? "Continue session" : failed ? "Retry start" : ownQuest ? "Open quest" : "Start focusing"}</Text></Pressable>
    {!active && <View style={s.links}>
      {!ownQuest && <Pressable disabled={locked || focus.smaller} onPress={() => void choose(focus.templateId, true)} accessibilityRole="button" style={s.linkButton}><Text style={[s.link, focus.smaller && { color: colors.secondary }]}>{focus.smaller ? "A smaller step" : "Make it smaller"}</Text></Pressable>}
      <Pressable disabled={locked} onPress={() => setPicker(true)} accessibilityRole="button" style={s.linkButton}><Text style={s.link}>Choose another</Text></Pressable>
      <Pressable disabled={locked} onPress={onFree} accessibilityRole="button" style={s.linkButton}><Text style={s.link}>Free focus</Text></Pressable>
    </View>}
    {!active && failed && <Text style={s.error} accessibilityRole="alert">{timer.actionError ?? "Couldn’t start. Your suggestion is kept for retry."}</Text>}
    {preference.error && <Text style={s.error} accessibilityRole="alert">Couldn’t save your choice. Try again; your previous suggestion is unchanged.</Text>}
    <AppSheet visible={picker} onRequestClose={() => setPicker(false)} label="starter suggestions" compact maxHeightRatio={0.82}
      header={<Text style={[s.title, { paddingHorizontal: 20, paddingBottom: 12 }]}>Choose your next step</Text>}>
      <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}>
        {STUDY_NEEDS.map(need => <View key={need.id} style={{ gap: 10 }}><Text style={[s.label, { marginTop: 10 }]}>{need.title}</Text>
          {STARTER_QUESTS.filter(item => item.need === need.id).map(item => <SheetButton key={item.id} disabled={locked} accessibilityRole="button" accessibilityState={{ selected: focus.templateId === item.id }} onPress={() => void choose(item.id, false)} style={s.option}>
            <View style={{ flex: 1, gap: 4 }}><Text style={s.optionTitle}>{item.title}</Text><Text style={s.meta}>{item.seconds / 60} minutes</Text></View><Ionicons name={focus.templateId === item.id ? "checkmark-circle" : "chevron-forward"} size={20} color={colors.accent} />
          </SheetButton>)}
        </View>)}
        {preference.error && <Text style={s.error} accessibilityRole="alert">Couldn’t save your choice. Tap it again to retry.</Text>}
      </BottomSheetScrollView>
    </AppSheet>
  </View>;
}
const s = StyleSheet.create({ card: { width: "100%", padding: 18, borderRadius: 24, gap: 12, backgroundColor: "#171E2B", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(225,235,255,0.16)" }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500", flexShrink: 1 }, icon: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }, title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "500", letterSpacing: -0.5 }, instruction: { color: colors.secondary, fontSize: 16, lineHeight: 23, marginTop: 8 }, meta: { color: colors.secondary, fontSize: 14, lineHeight: 20, marginTop: 8 }, primary: { minHeight: 52, borderRadius: 16, backgroundColor: "#E5E4FF", padding: 12, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#171827", fontSize: 17, lineHeight: 23, fontWeight: "500" }, links: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, linkButton: { minHeight: 44, justifyContent: "center" }, link: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "500" }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 }, option: { minHeight: 64, padding: 14, borderRadius: 16, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12 }, optionTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "500" } });
