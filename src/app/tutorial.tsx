import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text } from "../components/AppText";
import OnboardingFrame, { useOnboardingTransition } from "../components/OnboardingFrame";
import OnboardingFinish from "../components/OnboardingFinish";
import { useUser } from "../context/UserContext";
import { finishOnboarding } from "../services/onboardingService";
import { colors } from "../constants/theme";
import type { PersonalIcon } from "../components/PersonalUI";
export const INTRO_PAGES: { icon: PersonalIcon; title: string; body: string; detail: string }[] = [
  { icon: "timer-outline", title: "Start with one small block.", body: "Follow your suggested focus, choose another, or focus your own way. Start once, then stay with your work.", detail: "Personal quests sit alongside suggestions. Save a useful block for later, or create your own." },
  { icon: "person-outline", title: "Your effort takes shape.", body: "Completed focus time grows your character and the Life area you choose. Levels reflect the effort you’ve logged.", detail: "Every completed second counts toward your daily goal. Each 60 seconds earns 1 XP; leftover seconds carry forward." },
  { icon: "leaf-outline", title: "A rhythm, at your pace.", body: "Any completed session makes a Focus day. Consecutive Focus days build your Focus streak. Your daily goal is a separate milestone.", detail: "Earned growth and achievements stay with you. Replay this introduction, or change suggestions, anytime in Settings." },
];
export default function TutorialScreen() {
  const router = useRouter();
  const { profile, reloadProfile } = useUser();
  const [replay] = useState(() => !!profile.onboarding_completed);
  const transition = useOnboardingTransition();
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const lock = useRef(false), saved = useRef(false), alive = useRef(true), completing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const complete = useCallback(() => {
    if (!alive.current || completing.current) return;
    completing.current = true;
    void (async () => {
      try {
        if (!(await reloadProfile())) throw new Error("Profile refresh failed");
        if (alive.current) router.replace("/");
      } catch {
        if (alive.current) { setCelebrating(false); setError("Couldn’t finish setup. Your choices are saved—please try again."); setBusy(false); lock.current = false; }
      } finally { completing.current = false; }
    })();
  }, [reloadProfile, router]);
  const finish = async () => {
    if (lock.current || transition.moving) return;
    if (replay) { if (router.canGoBack()) router.back(); else router.replace("/"); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      if (!saved.current) { await finishOnboarding(); saved.current = true; }
      if (alive.current) setCelebrating(true);
    } catch { if (alive.current) { setError("Couldn’t finish setup. Please check your connection and try again."); setBusy(false); lock.current = false; } }
  };
  if (celebrating) return <OnboardingFinish onDone={complete} />;
  const item = INTRO_PAGES[page], last = page === INTRO_PAGES.length - 1;
  return <OnboardingFrame step={replay ? page + 1 : page + 5} total={replay ? 3 : 7} title={item.title} subtitle={item.body} opacity={transition.opacity}
    busy={busy || transition.moving} primary={busy ? "Finishing setup…" : last ? replay ? "Done" : "Start my journey" : "Continue"}
    onNext={() => { if (last) void finish(); else transition.change(() => setPage(page + 1)); }}
    onBack={page > 0 ? () => transition.change(() => setPage(page - 1)) : replay ? () => { if (router.canGoBack()) router.back(); else router.replace("/"); } : undefined}
    secondary={!last ? "Skip introduction" : undefined} onSecondary={!last ? () => void finish() : undefined} error={error}>
    <View style={s.illustration}><View style={s.orbit}><View style={s.symbol}><Ionicons name={item.icon} size={48} color={colors.accent} /></View></View></View>
    <View style={s.note}><Text style={s.detail}>{item.detail}</Text></View>
  </OnboardingFrame>;
}
const s = StyleSheet.create({ illustration: { alignItems: "center", paddingVertical: 12 }, orbit: { width: 152, height: 152, borderRadius: 76, borderWidth: 1, borderColor: colors.line, justifyContent: "center", alignItems: "center" }, symbol: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.accentSoft, justifyContent: "center", alignItems: "center" }, note: { backgroundColor: colors.surface, padding: 20, borderRadius: 20 }, detail: { fontSize: 16, lineHeight: 24, color: colors.secondary } });
