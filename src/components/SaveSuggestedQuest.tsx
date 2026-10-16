import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import RoutineEditorSheet from "./RoutineEditorSheet";
import { p } from "./PersonalUI";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useQuests } from "../context/QuestContext";
import { useSavedRoutines } from "../hooks/useSavedRoutines";
import { validSessionSeconds } from "../utils/sessionSetup";
import type { SuggestedFocus } from "../constants/guidedQuests";
export interface SuggestedQuestCompletion {
  ownerId: string;
  sessionId: string;
  suggestion: SuggestedFocus;
  durationSeconds: number;
  targetAttributeId: number | null;
}
export default function SaveSuggestedQuest({ inSheet = false, compact = false, completion, disabled = false }: {
  inSheet?: boolean; compact?: boolean; completion?: SuggestedQuestCompletion; disabled?: boolean;
}) {
  const { profile } = useUser();
  const { subjects } = useQuests();
  const routines = useSavedRoutines();
  const timer = useTimer();
  const sessionSummary = completion ?? timer.sessionSummary;
  const targetAttributeId = completion ? completion.targetAttributeId : timer.targetAttributeId;
  const ownerId = completion?.ownerId ?? profile.id;
  const focus = sessionSummary?.suggestion;
  const identity = routines.scope?.ownerId === ownerId && profile.id === ownerId && sessionSummary?.sessionId
    ? `liferpg:saved-suggestion-routine:v1:${JSON.stringify([routines.scope.backendId, ownerId, sessionSummary.sessionId])}` : "";
  const [receipt, setReceipt] = useState<{ identity: string; saved: boolean } | null>(null);
  const [editor, setEditor] = useState<{identity: string; name: string; seconds: number; areaId: number | null; visible: boolean} | null>(null);
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
  // Only this completion's explicit routine save is evidence of saving.
  // Old quest receipts and similarly named records are not routine receipts.
  const saved = receipt?.identity === identity && receipt.saved;
  const Button = inSheet ? SheetButton : Pressable;
  const openEditor = () => {
    if (disabled || !routines.ready || profile.id !== ownerId || editorLock.current || saved || receipt?.identity !== identity) return;
    const seconds = sessionSummary?.durationSeconds ?? focus.seconds;
    if (!validSessionSeconds(seconds)) return;
    editorLock.current = identity;
    setEditor({identity, name: focus.title, seconds, areaId: targetAttributeId, visible: true });
  };
  const closeEditor = () => {
    if (currentIdentity.current !== identity) return;
    setEditor(current => current?.identity === identity ? { ...current, visible: false } : current);
  };
  const dismissedEditor = () => {
    if (currentIdentity.current !== identity) return;
    editorLock.current = null; setEditor(null);
  };
  return <View style={{ gap: 8 }}>
    {saved ? <View style={{ minHeight:52, justifyContent:"center", alignItems:"center" }}>
      <Text style={p.rowTitle} accessibilityRole="text" accessibilityLiveRegion="polite">Saved to your routines ✓</Text>
    </View> : <Button accessibilityRole="button" accessibilityState={{disabled: disabled || !routines.ready || receipt?.identity !== identity}}
      disabled={disabled || !routines.ready || receipt?.identity !== identity} onPress={openEditor} style={[p.button, p.secondaryButton]}><Text style={p.rowTitle}>Save as routine</Text></Button>}
    {!saved && !compact && <Text style={p.caption}>Review its name, time and optional reminder before saving.</Text>}
    {editor?.identity === identity && <RoutineEditorSheet key={identity} visible={editor.visible} initialName={editor.name}
      initialSeconds={editor.seconds} initialAreaId={editor.areaId} subjects={subjects} onClose={closeEditor} onDismiss={dismissedEditor}
      onSaved={() => {
        if (currentIdentity.current !== identity) return;
        setReceipt({identity, saved: true});
        void AsyncStorage.setItem(identity, "saved").catch(() => {});
      }} />}
  </View>;
}
