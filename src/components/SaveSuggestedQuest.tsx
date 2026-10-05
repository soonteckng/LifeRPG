import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { p } from "./PersonalUI";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { createTask } from "../services/taskService";
export default function SaveSuggestedQuest({ inSheet = false }: { inSheet?: boolean }) {
  const { profile } = useUser();
  const { sessionSummary, targetAttributeId } = useTimer();
  const { tasks, upsert, refresh } = useQuests();
  const focus = sessionSummary?.suggestion;
  const identity = profile.id && sessionSummary?.sessionId ? `liferpg:saved-suggestion:${profile.id}:${sessionSummary.sessionId}` : "";
  const [receipt, setReceipt] = useState<{ identity: string; saved: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const currentIdentity = useRef(identity);
  useEffect(() => { currentIdentity.current = identity; return () => { currentIdentity.current = ""; }; }, [identity]);
  const existing = focus && tasks.some(task => task.title === focus.title && task.subject_id === targetAttributeId && task.target_minutes === focus.seconds / 60 && !task.is_completed);
  useEffect(() => {
    let cancelled = false;
    if (identity) void AsyncStorage.getItem(identity).then(value => { if (!cancelled) setReceipt({ identity, saved: value === "saved" }); })
      .catch(() => { if (!cancelled) setReceipt({ identity, saved: false }); });
    return () => { cancelled = true; };
  }, [identity]);
  if (!focus || !identity) return null;
  const saved = existing || (receipt?.identity === identity && receipt.saved);
  const Button = inSheet ? SheetButton : Pressable;
  const save = async () => {
    if (lock.current || saved || receipt?.identity !== identity) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const task = await createTask({ title: focus.title, targetMinutes: focus.seconds / 60, subjectId: targetAttributeId, repeatRule: "once", difficulty: "easy" });
      if (currentIdentity.current !== identity) return;
      upsert(task); setReceipt({ identity, saved: true });
      await AsyncStorage.setItem(identity, "saved").catch(() => {});
    } catch {
      if (currentIdentity.current === identity) { setError("Couldn’t save this quest. Check your quests before retrying."); await refresh(); }
    } finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ gap: 8 }}>
    <Button accessibilityRole="button" accessibilityState={{ disabled: !!saved || busy || receipt?.identity !== identity, busy }} disabled={!!saved || busy || receipt?.identity !== identity} onPress={() => void save()} style={[p.button, p.secondaryButton]}><Text style={p.rowTitle}>{saved ? "Saved to your quests" : busy ? "Saving…" : "Save for later"}</Text></Button>
    {!saved && <Text style={p.caption}>Adds a one-time quest. You can choose a schedule in Quests later.</Text>}
    {!!error && !saved && <Text style={p.error} accessibilityRole="alert">{error}</Text>}
  </View>;
}
