import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import QuestSheet from "./QuestSheet";
import { p } from "./PersonalUI";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { makeQuestDraft, type QuestDraft } from "../utils/questDraft";
import { durationLabel, validSessionSeconds } from "../utils/sessionSetup";
export default function SaveSuggestedQuest({ inSheet = false, compact = false }: { inSheet?: boolean; compact?: boolean }) {
  const { profile } = useUser();
  const { sessionSummary, targetAttributeId } = useTimer();
  const focus = sessionSummary?.suggestion;
  const identity = profile.id && sessionSummary?.sessionId ? `liferpg:saved-suggestion:${profile.id}:${sessionSummary.sessionId}` : "";
  const [receipt, setReceipt] = useState<{ identity: string; saved: boolean } | null>(null);
  const [editor, setEditor] = useState<{identity: string; draft: QuestDraft; hint?: string} | null>(null);
  const editorLock = useRef<string | null>(null);
  const currentIdentity = useRef(identity);
  useLayoutEffect(() => {
    currentIdentity.current = identity;
    editorLock.current = null;
    return () => { currentIdentity.current = ""; editorLock.current = null; };
  }, [identity]);
  useEffect(() => {
    let cancelled = false;
    if (identity) void AsyncStorage.getItem(identity).then(value => { if (!cancelled) setReceipt({ identity, saved: value === "saved" }); })
      .catch(() => { if (!cancelled) setReceipt({ identity, saved: false }); });
    return () => { cancelled = true; };
  }, [identity]);
  if (!focus || !identity) return null;
  // Only this completion's explicitly created quest is evidence of saving.
  // A similarly named older quest must never turn this choice into a status.
  const saved = receipt?.identity === identity && receipt.saved;
  const Button = inSheet ? SheetButton : Pressable;
  const openEditor = () => {
    if (editorLock.current || saved || receipt?.identity !== identity) return;
    const seconds = sessionSummary?.durationSeconds ?? focus.seconds;
    if (!validSessionSeconds(seconds)) return;
    const draft = { ...makeQuestDraft(), title: focus.title, minutes: String(Math.ceil(seconds / 60)), subjectId: targetAttributeId };
    editorLock.current = identity;
    setEditor({identity, draft, hint: seconds % 60 === 0 ? undefined
      : `Your session was ${durationLabel(seconds)}. Choose a whole-minute duration for this quest.`});
  };
  const closeEditor = () => {
    if (currentIdentity.current !== identity) return;
    editorLock.current = null;
    setEditor(null);
  };
  return <View style={{ gap: 8 }}>
    {saved ? <View style={{ minHeight:52, justifyContent:"center", alignItems:"center" }}>
      <Text style={p.rowTitle} accessibilityRole="text" accessibilityLiveRegion="polite">Saved to your quests ✓</Text>
    </View> : <Button accessibilityRole="button" accessibilityState={{disabled: receipt?.identity !== identity}}
      disabled={receipt?.identity !== identity} onPress={openEditor} style={[p.button, p.secondaryButton]}><Text style={p.rowTitle}>Save as quest</Text></Button>}
    {!saved && !compact && <Text style={p.caption}>Review its name, duration and schedule before creating it.</Text>}
    {editor?.identity === identity && <QuestSheet key={identity} visible editorOnly initialDraft={editor.draft}
      durationHint={editor.hint} expectedOwnerId={profile.id} onClose={closeEditor}
      onCreated={() => {
        if (currentIdentity.current !== identity) return;
        setReceipt({identity, saved: true});
        void AsyncStorage.setItem(identity, "saved").catch(() => {});
      }} />}
  </View>;
}
