import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { PinnedRoute } from "../../components/PinnedAction";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import MoreMenu, { type MoreOption } from "../../components/MoreMenu";
import { CircleButton } from "../../components/SectionHeader";
import SquadBoard from "../../components/SquadBoard";
import SheetConfirmation from "../../components/SheetConfirmation";
import { SquadEditSheet, SquadJoinSheet } from "../../components/SquadSheets";
import { colors, edge, radius } from "../../constants/theme";
import { useSquads } from "../../hooks/useSquads";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { squadSelection } from "../../services/squadSelection";
import { leaveOutcome } from "../../utils/squads";
import type { SquadMember } from "../../types/squads";

type Confirm = { kind: "leave" } | { kind: "code" } | { kind: "remove"; member: SquadMember } | null;

/** My Squads, in full: the squad you pick, its week together and its leaderboard. */
export default function SquadsScreen() {
  // The invite pins above the tab bar, so it shows however long the board is.
  return <PinnedRoute name="squads"><Squads /></PinnedRoute>;
}
function Squads() {
  const squads = useSquads();
  const bottomInset = useTabDockInset("squads");
  const chosen = useSyncExternalStore(squadSelection.subscribe, squadSelection.get, squadSelection.get);
  const [joining, setJoining] = useState(false), [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  // Native sheet portals sit above the retained online page. Cloud-only
  // editors close before the offline surface paints, and stay closed on return.
  const [onlineView, setOnlineView] = useState({ online: squads.online });
  if (onlineView.online !== squads.online) {
    setOnlineView({ online: squads.online });
    if (!squads.online) { setJoining(false); setEditing(false); }
  }
  const currentView = useRef<typeof onlineView | null>(onlineView);
  useLayoutEffect(() => {
    currentView.current = onlineView;
    return () => { currentView.current = null; };
  }, [onlineView]);
  const refresh = squads.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const squad = squads.squads.find(item => item.id === chosen) ?? squads.squads[0] ?? null;
  const leading = squads.squads.find(item => item.ownerIsYou)?.name ?? null;
  const run = async (work: () => Promise<string | null>) => {
    if (busy) return; setBusy(true); setError("");
    try { const failed = await work(); setConfirm(null); if (failed) setError(failed); } finally { setBusy(false); }
  };
  const share = () => { if (squad) void Share.share({ message: `Join my squad "${squad.name}" with the code ${squad.code}.` }).catch(() => {}); };
  const pick = (id: string) => { setError(""); squadSelection.choose(id); };
  const options: MoreOption[] = squad ? ([
    ...(squad.ownerIsYou ? [{ label: "Edit name and goal", icon: "create-outline" as const, onPress: () => setEditing(true) },
      { label: "New invite code", icon: "refresh" as const, onPress: () => setConfirm({ kind: "code" }) }] : []),
    { label: "Share invite", icon: "share-outline" as const, onPress: share },
    { label: "Join or start a squad", icon: "add-circle-outline" as const, onPress: () => setJoining(true) },
    { label: "Leave squad", icon: "exit-outline" as const, danger: true, onPress: () => setConfirm({ kind: "leave" }) },
  ] as MoreOption[]).map(option => ({ ...option, onPress: () => {
    // MoreMenu dispatches after closing. An outgoing menu must not reopen a
    // cloud editor after disconnect, reconnect or unmount.
    if (onlineView.online && currentView.current === onlineView) option.onPress();
  } })) : [];
  return <View style={s.screen}>
    <PersonalPage title="Squads" subtitle="" compact bottomContentInset={bottomInset}
      action={squads.online && (squad ? <MoreMenu options={options} label="Squad options" size={36} testID="squad-options" />
        : <CircleButton size={36} label="Join or start a squad" onPress={() => setJoining(true)} />)}>
      <ContentReveal><View style={s.stack}>
        {!squads.online && <Text style={s.offline} testID="squads-offline">{squad ? "Offline · showing your squad as last saved. Changes need internet." : "Offline · squads need internet."}</Text>}
        {squads.squads.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.switcher} accessibilityRole="tablist">
          {squads.squads.map(item => {
            const selected = item.id === squad?.id;
            return <Pressable key={item.id} onPress={() => pick(item.id)} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.name}
              style={[s.tab, selected && s.tabOn]}><Text style={[s.tabText, selected && s.tabTextOn]} numberOfLines={1}>{item.name}</Text></Pressable>;
          })}
        </ScrollView>}
        {squad ? <SquadBoard squad={squad} busy={busy} onSetGoal={() => setEditing(true)} onRemove={member => { if (squads.online) setConfirm({ kind: "remove", member }); }} onInvite={share} />
          : <View style={[s.card, s.empty]} testID="squads-empty">
            <View style={s.emptyIcon}><Ionicons name="people" size={26} color={colors.accent} /></View>
            <Text style={s.emptyTitle}>Focus with friends</Text>
            <Text style={s.emptyBody}>{squads.error && !squads.ready ? squads.error : "Start a squad, share its code, and see each other’s focus time on a weekly leaderboard. Up to 8 people, and only members can see it."}</Text>
            <Pressable disabled={!squads.online} onPress={() => setJoining(true)} accessibilityRole="button" accessibilityState={{ disabled: !squads.online }} accessibilityLabel="Join or start a squad"
              style={[s.primary, !squads.online && s.dim]}><Text style={s.primaryText}>{squads.online ? "Join or start a squad" : "Needs internet"}</Text></Pressable>
          </View>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </View></ContentReveal>
      <SquadJoinSheet visible={squads.online && joining} online={squads.online} leading={leading} memberships={squads.squads.length}
        onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
      <SquadEditSheet squad={squad} visible={squads.online && editing} onClose={() => setEditing(false)} onSave={squads.update} />
    </PersonalPage>
    {confirm && squad && <SheetConfirmation destructive={confirm.kind !== "code"}
      title={confirm.kind === "leave" ? `Leave ${squad.name}?` : confirm.kind === "code" ? "Get a new invite code?" : `Remove ${confirm.member.name}?`}
      message={confirm.kind === "leave" ? leaveOutcome(squad) : confirm.kind === "code" ? "The old code stops working. Everyone already in the squad stays." : "They can join again with the code."}
      confirmLabel={confirm.kind === "leave" ? squad.members.length <= 1 ? "Leave and close" : "Leave squad" : confirm.kind === "code" ? "New code" : "Remove"}
      cancelLabel={confirm.kind === "code" ? "Keep this code" : "Cancel"} onCancel={() => setConfirm(null)}
      onConfirm={() => void (confirm.kind === "leave" ? run(() => squads.leave(squad.id)) : confirm.kind === "code" ? run(() => squads.update(squad.id, "code")) : run(() => squads.remove(squad.id, confirm.member.id)))} />}
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stack: { gap: 14 },
  switcher: { gap: 8, paddingRight: 8 },
  tab: { ...edge, minHeight: 36, maxWidth: 200, paddingHorizontal: 16, borderRadius: 18, justifyContent: "center", backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.accentSoft, borderColor: "rgba(99,230,190,0.4)" },
  tabText: { color: colors.secondary, fontSize: 15, fontWeight: "600" }, tabTextOn: { color: colors.accent },
  card: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  offline: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 }, dim: { opacity: 0.5 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, marginBottom: 4 },
  emptyTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  emptyBody: { color: colors.secondary, fontSize: 15, lineHeight: 21, textAlign: "center" },
  primary: { alignSelf: "stretch", minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, marginTop: 8 },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
