import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Share, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Text } from "../components/AppText";
import MoreMenu, { type MoreOption } from "../components/MoreMenu";
import { PinnedActionHost, PinnedActionProvider, PinnedRoute } from "../components/PinnedAction";
import SlideUpPage from "../components/SlideUpPage";
import SquadBoard from "../components/SquadBoard";
import SheetConfirmation from "../components/SheetConfirmation";
import { SquadEditSheet, SquadJoinSheet } from "../components/SquadSheets";
import { colors } from "../constants/theme";
import { useSquads } from "../hooks/useSquads";
import { squadSelection } from "../services/squadSelection";
import { leaveOutcome } from "../utils/squads";
import type { SquadMember } from "../types/squads";

type Confirm = { kind: "leave" } | { kind: "code" } | { kind: "remove"; member: SquadMember } | null;

/**
 * One squad, in full: its week together, the leaderboard and the invite. It
 * rises from the bottom over Squads or Home, and slides down to close.
 */
export default function SquadScreen() {
  // The invite pins to the bottom of this page, however long the board is.
  return <PinnedActionProvider><PinnedRoute name="squad"><SquadPage /></PinnedRoute></PinnedActionProvider>;
}
function SquadPage() {
  const squads = useSquads();
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
  // The page stays on the squad it opened with, even if the selection changes underneath.
  const [shownId, setShownId] = useState<string | null>(chosen);
  const squad = squads.squads.find(item => item.id === shownId) ?? (shownId ? null : squads.squads[0] ?? null);
  if (squad && squad.id !== shownId) setShownId(squad.id);
  const leading = squads.squads.find(item => item.ownerIsYou)?.name ?? null;
  // Leaving this squad (or being removed from it) leaves nothing to show: slide away.
  const gone = squads.ready && !squad;
  const run = async (work: () => Promise<string | null>) => {
    if (busy) return; setBusy(true); setError("");
    try { const failed = await work(); setConfirm(null); if (failed) setError(failed); } finally { setBusy(false); }
  };
  const share = () => { if (squad) void Share.share({ message: `Join my squad "${squad.name}" with the code ${squad.code}.` }).catch(() => {}); };
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
    <SlideUpPage title="My Squad" fallback="/squads" gone={gone} footer={squad ? <PinnedActionHost /> : undefined}
      action={squads.online && squad ? <MoreMenu options={options} label="Squad options" size={36} testID="squad-options" /> : undefined}>
      <View style={s.stack}>
        {!squads.online && <Text style={s.offline} testID="squads-offline">Offline · showing your squad as last saved. Changes need internet.</Text>}
        {squad && <SquadBoard squad={squad} busy={busy} onSetGoal={() => setEditing(true)} onRemove={member => { if (squads.online) setConfirm({ kind: "remove", member }); }} onInvite={share} />}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </View>
    </SlideUpPage>
    <SquadJoinSheet visible={squads.online && joining} online={squads.online} leading={leading} memberships={squads.squads.length}
      onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
    <SquadEditSheet squad={squad} visible={squads.online && editing} onClose={() => setEditing(false)} onSave={squads.update} />
    {confirm && squad && <SheetConfirmation elevated destructive={confirm.kind !== "code"}
      title={confirm.kind === "leave" ? `Leave ${squad.name}?` : confirm.kind === "code" ? "Get a new invite code?" : `Remove ${confirm.member.name}?`}
      message={confirm.kind === "leave" ? leaveOutcome(squad) : confirm.kind === "code" ? "The old code stops working. Everyone already in the squad stays." : "They can join again with the code."}
      confirmLabel={confirm.kind === "leave" ? squad.members.length <= 1 ? "Leave and close" : "Leave squad" : confirm.kind === "code" ? "New code" : "Remove"}
      cancelLabel={confirm.kind === "code" ? "Keep this code" : "Cancel"} onCancel={() => setConfirm(null)}
      onConfirm={() => void (confirm.kind === "leave" ? run(() => squads.leave(squad.id)) : confirm.kind === "code" ? run(() => squads.update(squad.id, "code")) : run(() => squads.remove(squad.id, confirm.member.id)))} />}
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  stack: { gap: 14 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  offline: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});
