import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, AppState, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { useDailyAchievementClaim } from "../hooks/useDailyEffortCelebration";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { dailyAchievementQueue } from "../services/dailyAchievementQueue";
import { dailyGoalEvidence, firstDailyEffortEvidence, type DailyAchievementDisplay } from "../services/dailyEffortCelebrationService";
import { registerSheetActivity, useActiveSheetCount } from "../utils/sheetActivity";
import { colors } from "../constants/theme";
import DailyEffortCelebration from "./DailyEffortCelebration";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";

export function DailyAchievementMoment({visible, preparing = false, achievements, onClose, activityId, presentationId}: {
  visible: boolean; preparing?: boolean; achievements: DailyAchievementDisplay; onClose: () => void; activityId: symbol; presentationId?: number;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [opacity] = useState(() => new Animated.Value(1));
  const [presentation, setPresentation] = useState({visible, id:presentationId, closing:false});
  const generation = useRef(0);
  const closed = useRef(false);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const finishClose = useRef<(() => void) | null>(null);
  const visibleRef = useRef(visible), release = useRef<(() => void) | null>(null);
  const releaseActivity = useCallback(() => { release.current?.(); release.current = null; }, []);
  if (presentation.visible !== visible || presentation.id !== presentationId) setPresentation({visible, id:presentationId, closing:false});
  if (visible && !mounted) setMounted(true);
  if (!visible && !preparing && mounted && Platform.OS !== "ios") setMounted(false);
  useLayoutEffect(() => {
    const token = generation.current + 1;
    generation.current = token;
    closed.current = false;
    finishClose.current = null;
    animation.current?.stop(); animation.current = null;
    opacity.setValue(1);
    return () => {
      generation.current = token + 1;
      finishClose.current = null;
      animation.current?.stop(); animation.current = null;
    };
  }, [visible, presentationId, opacity]);
  const close = useCallback(() => {
    if (!visibleRef.current || closed.current || finishClose.current) return;
    const token = generation.current;
    const finish = () => {
      if (generation.current !== token || !visibleRef.current || finishClose.current !== finish) return;
      closed.current = true;
      finishClose.current = null;
      const running = animation.current; animation.current = null; running?.stop();
      onClose();
    };
    finishClose.current = finish;
    setPresentation(current => ({...current, closing:true}));
    if (reducedMotion) { finish(); return; }
    const fade = Animated.timing(opacity, {toValue:0, duration:200, useNativeDriver:true});
    animation.current = fade;
    fade.start(({finished}) => {
      if (finished) { finish(); return; }
      if (generation.current !== token || finishClose.current !== finish) return;
      finishClose.current = null; animation.current = null;
      opacity.setValue(1);
      setPresentation(current => ({...current, closing:false}));
    });
  }, [onClose, opacity, reducedMotion]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      // The user has already chosen Continue. Do not strand a faded modal if
      // Android suspends its animation while the app enters the background.
      if (state !== "active") finishClose.current?.();
    });
    return () => listener.remove();
  }, []);
  useLayoutEffect(() => {
    visibleRef.current = visible;
    // Reserve the moment before its asynchronous ledger claim, so an optional
    // permission invitation cannot take its place between saving and display.
    if ((mounted || preparing) && !release.current) release.current = registerSheetActivity(activityId);
    if (!visible && !preparing && (Platform.OS !== "ios" || !mounted)) releaseActivity();
  }, [visible, preparing, mounted, activityId, releaseActivity]);
  useLayoutEffect(() => () => { release.current?.(); release.current = null; }, []);
  return <Modal testID="daily-achievement-moment" visible={visible} transparent animationType="none"
    statusBarTranslucent onRequestClose={close} onDismiss={() => {
      if (Platform.OS === "ios" && !visibleRef.current) { releaseActivity(); setMounted(false); }
    }}>
    {mounted && <Animated.View style={[s.page, {opacity, paddingTop:insets.top + 12, paddingBottom:Math.max(insets.bottom, 16)}]}
      pointerEvents={presentation.closing ? "none" : "auto"} accessibilityViewIsModal onAccessibilityEscape={close}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <DailyEffortCelebration {...achievements} />
      </ScrollView>
      <View style={s.actions}><Pressable accessibilityRole="button" accessibilityLabel="Continue from celebration"
        disabled={presentation.closing} onPress={close} style={s.continue}><Text style={s.continueText}>Continue</Text></Pressable></View>
    </Animated.View>}
  </Modal>;
}

/** Lives outside SessionScreen, so closing its route cannot erase the moment. */
export default function PostSessionCelebration({insideSession}: {insideSession: boolean}) {
  const {profile} = useUser();
  const request = useSyncExternalStore(dailyAchievementQueue.subscribe, dailyAchievementQueue.snapshot, dailyAchievementQueue.snapshot);
  const [activityId] = useState(() => Symbol("daily-achievement-moment"));
  const otherSheets = useActiveSheetCount(activityId);
  const [active, setActive] = useState(!AppState.currentState || AppState.currentState === "active");
  const [lastShown, setLastShown] = useState<{id: number; owner: string; achievements: DailyAchievementDisplay} | null>(null);
  const latest = useRef(request);
  useLayoutEffect(() => { latest.current = request; }, [request]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => { listener.remove(); if (latest.current) dailyAchievementQueue.dismiss(latest.current.id); };
  }, []);
  const matchingOwner = !!request && !!profile?.id && request.evidence.ownerId === profile.id;
  const alreadyShown = request?.id === lastShown?.id && lastShown?.owner === profile?.id;
  const today = !!request && (firstDailyEffortEvidence(request.evidence) || dailyGoalEvidence(request.evidence));
  const canPresent = matchingOwner && today && !insideSession && otherSheets === 0 && (active || alreadyShown);
  const achievements = useDailyAchievementClaim(request ? {...request.evidence, visible:canPresent && !alreadyShown}
    : {visible:false, pending:true, recovered:false});
  const displayed = alreadyShown ? lastShown!.achievements : achievements;
  const visible = canPresent && (alreadyShown || achievements.ready) && (displayed.firstSession || displayed.dailyGoal);
  if (visible && !alreadyShown && request) setLastShown({id:request.id, owner:profile.id,
    achievements:{firstSession:achievements.firstSession, dailyGoal:achievements.dailyGoal}});
  useEffect(() => {
    if (request && (!matchingOwner || !today || (canPresent && achievements.ready && !visible && !alreadyShown))) dailyAchievementQueue.dismiss(request.id);
  }, [request, matchingOwner, today, canPresent, achievements.ready, visible, alreadyShown]);
  const retained = lastShown?.owner === profile?.id ? lastShown.achievements : {firstSession:false, dailyGoal:false};
  return <DailyAchievementMoment visible={visible} preparing={canPresent && !alreadyShown && !achievements.ready} activityId={activityId}
    presentationId={request?.id ?? lastShown?.id}
    achievements={visible ? displayed : retained}
    onClose={() => { const id = request?.id ?? lastShown?.id; if (id !== undefined) dailyAchievementQueue.dismiss(id); }} />;
}

const s = StyleSheet.create({
  page:{flex:1, backgroundColor:colors.background}, scroll:{flex:1},
  content:{flexGrow:1, justifyContent:"center", paddingHorizontal:24, paddingVertical:24},
  actions:{paddingHorizontal:24, paddingTop:16},
  continue:{minHeight:56, paddingVertical:16, paddingHorizontal:20, borderRadius:18, backgroundColor:colors.primary, alignItems:"center", justifyContent:"center"},
  continueText:{color:colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight:"500"},
});
