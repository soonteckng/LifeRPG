import { useCallback, useEffect, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ExpeditionReveal } from "../rewards/RevealScreens";
import { useRewards } from "../../hooks/useRewards";
import { useUser } from "../../context/UserContext";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { Reveal } from "../../services/rewardsStore";

/**
 * What the walk brought, shown on the session screen itself once its result
 * card is closed: the finds card (if anything was found), then today's trail.
 * It is part of the session screen, not a pop-up, so nothing else can take its
 * turn or hide it. "See it in Outfits" opens Outfits on top and comes back here.
 */
export default function SessionReveal({ reveal, onClose }: { reveal: Extract<Reveal, { kind: "expedition" }>; onClose: () => void }) {
  const rewards = useRewards({ load: false });
  const { profile } = useUser();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const contentReady = useCallback(() => setReady(true), []);
  const [enter] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { enter.setValue(1); return; }
    if (!ready) return;
    const fade = Animated.timing(enter, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [enter, ready, reduced]);
  const player = { look: rewards.look, equipped: rewards.equipped, level: profile?.level ?? 1, background: rewards.background, frame: rewards.frame,
    today: rewards.today, nextFindSeconds: rewards.nextFindSeconds, trail: rewards.trail };
  return <Animated.View testID="session-reveal" style={[StyleSheet.absoluteFill, s.page, { opacity: enter }]} accessibilityViewIsModal>
    <ExpeditionReveal key={reveal.id} reveal={reveal} player={player} onClose={onClose} onReady={contentReady}
      onOutfits={show => router.push({ pathname: "/outfits", params: { show } })} />
  </Animated.View>;
}

const s = StyleSheet.create({ page: { backgroundColor: "#0B0F1A", zIndex: 20, elevation: 20 } });
