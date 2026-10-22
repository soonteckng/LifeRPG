import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import { CircleButton } from "../../components/SectionHeader";
import { SquadSummary } from "../../components/SquadsSection";
import { SquadJoinSheet } from "../../components/SquadSheets";
import { useSquadDetail } from "../../components/SquadDetail";
import MoreMenu from "../../components/MoreMenu";
import { PinnedRoute } from "../../components/PinnedAction";
import { colors, edge, radius } from "../../constants/theme";
import { useSquads } from "../../hooks/useSquads";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { squadSelection } from "../../services/squadSelection";
import { squadTotal } from "../../utils/squads";
import { studyTime } from "../../utils/studyPlan";

/**
 * Squads. In one squad (most people's case), the tab is that squad in full:
 * your week together, the leaderboard and the invite. In two or more, one big
 * card for each; tap one and the whole squad rises from the bottom.
 */
export default function SquadsScreen() {
  // The invite button pins above the tab bar, like Start on Routines.
  return <PinnedRoute name="squads"><SquadsTab /></PinnedRoute>;
}
function SquadsTab() {
  const squads = useSquads(), router = useRouter();
  const bottomInset = useTabDockInset("squads");
  const [joining, setJoining] = useState(false);
  // Offline the saved squads stay readable; joining or starting needs the server.
  const [wasOnline, setWasOnline] = useState(squads.online);
  if (wasOnline !== squads.online) { setWasOnline(squads.online); if (!squads.online) setJoining(false); }
  const refresh = squads.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const leading = squads.squads.find(item => item.ownerIsYou)?.name ?? null;
  const open = (id: string) => { squadSelection.choose(id); router.navigate("/squad"); };
  const only = squads.squads.length === 1 ? squads.squads[0] : null;
  const detail = useSquadDetail(only, squads);
  if (only) return <View style={s.screen}>
    <PersonalPage title={only.name} subtitle="" compact bottomContentInset={bottomInset}
      action={squads.online ? <MoreMenu options={detail.options} label="Squad options" size={36} testID="squad-options" /> : undefined}>
      <ContentReveal><View style={s.stack} testID="squads-single">
        {detail.board}
        {squads.online && <Pressable onPress={detail.join} accessibilityRole="button" accessibilityLabel="Join or start another squad" style={s.another}>
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} /><Text style={s.anotherText}>Join or start another squad</Text>
        </Pressable>}
      </View></ContentReveal>
    </PersonalPage>
    {detail.sheets}
  </View>;
  return <View style={s.screen}>
    <PersonalPage title="Squads" subtitle="" compact bottomContentInset={bottomInset}
      action={squads.online && <CircleButton size={36} label="Join or start a squad" onPress={() => setJoining(true)} />}>
      <ContentReveal><View style={s.stack}>
        {!squads.online && <Text style={s.offline} testID="squads-offline">{squads.squads.length ? "Offline · showing your squads as last saved. Changes need internet." : "Offline · squads need internet."}</Text>}
        {squads.squads.length > 0 ? squads.squads.map(squad => <Pressable key={squad.id} onPress={() => open(squad.id)} accessibilityRole="button" testID="squad-card"
          accessibilityLabel={`${squad.name}, ${studyTime(squadTotal(squad))} together this week${squad.goalMinutes ? ` of ${squad.goalMinutes / 60} hours` : ""}. Open squad`} style={s.card}>
          <SquadSummary squad={squad} large />
        </Pressable>)
          : <View style={[s.card, s.empty]} testID="squads-empty">
            <View style={s.emptyIcon}><Ionicons name="people" size={26} color={colors.primary} /></View>
            <Text style={s.emptyTitle}>Focus with friends</Text>
            <Text style={s.emptyBody}>{squads.error && !squads.ready ? squads.error : "Start a squad, share its code and cheer each other on with a weekly leaderboard. Up to 8 people, and only members can see it."}</Text>
            <Pressable disabled={!squads.online} onPress={() => setJoining(true)} accessibilityRole="button" accessibilityState={{ disabled: !squads.online }} accessibilityLabel="Join or start a squad"
              style={[s.primary, !squads.online && s.dim]}><Text style={s.primaryText}>{squads.online ? "Join or start a squad" : "Needs internet"}</Text></Pressable>
          </View>}
      </View></ContentReveal>
      <SquadJoinSheet visible={squads.online && joining} online={squads.online} leading={leading} memberships={squads.squads.length}
        onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
    </PersonalPage>
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stack: { gap: 12 },
  card: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 20 },
  offline: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 }, dim: { opacity: 0.5 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginBottom: 4 },
  emptyTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  emptyBody: { color: colors.secondary, fontSize: 15, lineHeight: 21, textAlign: "center" },
  primary: { alignSelf: "stretch", minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginTop: 8 },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  another: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  anotherText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
