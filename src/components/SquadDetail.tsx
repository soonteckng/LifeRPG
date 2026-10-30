import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Share, StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { type MoreOption } from "./MoreMenu";
import SquadBoard from "./SquadBoard";
import SheetConfirmation from "./SheetConfirmation";
import { SquadEditSheet, SquadJoinSheet } from "./SquadSheets";
import { colors } from "../constants/theme";
import type { useSquads } from "../hooks/useSquads";
import { leaveOutcome } from "../utils/squads";
import type { Squad, SquadMember } from "../types/squads";

type Confirm = { kind: "leave" } | { kind: "code" } | { kind: "remove"; member: SquadMember; newCode: boolean } | null;

/**
 * Everything one squad needs, wherever it is shown: its board, the options
 * menu, and the sheets for joining, editing and confirming. The full squad
 * page and the Squads tab (when you're in one squad) both use it.
 */
export function useSquadDetail(squad: Squad | null, squads: ReturnType<typeof useSquads>, onJoin?: () => void): { options: MoreOption[]; board: ReactNode; sheets: ReactNode; join: () => void } {
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
  const leading = squads.squads.find(item => item.ownerIsYou)?.name ?? null;
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
  const board = <View style={s.stack}>
    {!squads.online && <Text style={s.offline} testID="squads-offline">Offline · showing your squad as last saved. Changes need internet.</Text>}
    {squad && <SquadBoard squad={squad} busy={busy} onSetGoal={() => setEditing(true)} onRemove={(member, newCode) => { if (squads.online) setConfirm({ kind: "remove", member, newCode }); }} onInvite={share} onJoin={onJoin} />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
  const sheets = <>
    <SquadJoinSheet visible={squads.online && joining} online={squads.online} leading={leading} memberships={squads.squads.length} leadCount={squads.squads.filter(item => item.ownerIsYou).length} limits={squads.limits}
      onClose={() => setJoining(false)} onJoin={squads.join} onCreate={squads.create} />
    <SquadEditSheet squad={squad} visible={squads.online && editing} onClose={() => setEditing(false)} onSave={squads.update} />
    {confirm && squad && <SheetConfirmation elevated destructive={confirm.kind !== "code"}
      title={confirm.kind === "leave" ? `Leave ${squad.name}?` : confirm.kind === "code" ? "Get a new invite code?" : `Remove ${confirm.member.name}?`}
      message={confirm.kind === "leave" ? leaveOutcome(squad) : confirm.kind === "code" ? "The old code stops working. Everyone already in the squad stays." : confirm.newCode ? "They leave the squad and the old code stops working, so only people you share the new code with can join." : "They leave the squad. They can join again with the code."}
      confirmLabel={confirm.kind === "leave" ? squad.members.length <= 1 ? "Leave and close" : "Leave squad" : confirm.kind === "code" ? "New code" : confirm.newCode ? "Remove and change code" : "Remove"}
      cancelLabel={confirm.kind === "code" ? "Keep this code" : "Cancel"} onCancel={() => setConfirm(null)}
      onConfirm={() => void (confirm.kind === "leave" ? run(() => squads.leave(squad.id)) : confirm.kind === "code" ? run(() => squads.update(squad.id, "code")) : run(async () => {
        // Removing first, then the new code: if removing fails, the code stays as it was.
        const failed = await squads.remove(squad.id, confirm.member.id);
        return failed || !confirm.newCode ? failed : squads.update(squad.id, "code");
      }))} />}
  </>;
  return { options, board, sheets, join: () => { if (squads.online) setJoining(true); } };
}

const s = StyleSheet.create({
  stack: { gap: 14 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  offline: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
});
