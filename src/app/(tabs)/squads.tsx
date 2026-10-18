import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import { SquadJoinSheet } from "../../components/SquadSheets";
import { SquadSummary } from "../../components/SquadsSection";
import { colors, edge, radius } from "../../constants/theme";
import { useSquads } from "../../hooks/useSquads";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { SQUAD_LIMITS, squadTotal } from "../../utils/squads";
import { studyTime } from "../../utils/studyPlan";

/** Every squad you're in. Each one opens as its own page. */
export default function SquadsScreen() {
  const router = useRouter(), squads = useSquads();
  const bottomInset = useTabDockInset("squads");
  const [joining, setJoining] = useState(false);
  const refresh = squads.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const leading = squads.squads.find(squad => squad.ownerIsYou)?.name ?? null;
  return <PersonalPage title="Squads" subtitle="" compact bottomContentInset={bottomInset}
    action={<Pressable onPress={() => setJoining(true)} accessibilityRole="button" accessibilityLabel="Join or start a squad" hitSlop={8} style={s.add}><Ionicons name="add" size={20} color={colors.accent} /></Pressable>}>
    <ContentReveal><View style={s.stack}>
      {squads.squads.length ? <>
        <Text style={s.lead}>My Squads · this week</Text>
        {squads.squads.map(squad => <Pressable key={squad.id} onPress={() => router.push({ pathname: "/squad/[id]", params: { id: squad.id } })} accessibilityRole="button"
          accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Open squad`} style={s.card}>
          <SquadSummary squad={squad} />
        </Pressable>)}
        <Text style={s.hint}>All focus time counts, routines and study alike. You can lead {SQUAD_LIMITS.lead} squad and be in up to {SQUAD_LIMITS.member}.</Text>
      </> : <View style={[s.card, s.empty]} testID="squads-empty">
        <View style={s.emptyIcon}><Ionicons name="people" size={26} color={colors.accent} /></View>
        <Text style={s.emptyTitle}>Focus with friends</Text>
        <Text style={s.emptyBody}>{squads.error && !squads.ready ? squads.error : "Start a squad, share its code, and see each other’s focus time every week. Up to 8 people, and only members can see it."}</Text>
        <Pressable onPress={() => setJoining(true)} accessibilityRole="button" accessibilityLabel="Join or start a squad" style={s.primary}><Text style={s.primaryText}>Join or start a squad</Text></Pressable>
      </View>}
    </View></ContentReveal>
    <SquadJoinSheet visible={joining} online={squads.online} leading={leading} memberships={squads.squads.length}
      onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
  </PersonalPage>;
}
const s = StyleSheet.create({
  stack: { gap: 12 },
  lead: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", paddingHorizontal: 4 },
  add: { ...edge, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  card: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginTop: 4 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginBottom: 4 },
  emptyTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  emptyBody: { color: colors.secondary, fontSize: 15, lineHeight: 21, textAlign: "center" },
  primary: { alignSelf: "stretch", minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginTop: 8 },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
