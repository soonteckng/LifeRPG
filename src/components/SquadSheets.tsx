import { useRef, useState } from "react";
import { Keyboard, Share, StyleSheet, View, type TextInput } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import SheetConfirmation from "./SheetConfirmation";
import Segmented from "./Segmented";
import CharacterPortrait from "./CharacterPortrait";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { cleanSquadCode, focusingCount, goalProgress, leaveOutcome, ranked, SQUAD_CODE_LENGTH, SQUAD_GOALS, SQUAD_LIMITS, squadTotal, validSquadName } from "../utils/squads";
import { studyTime } from "../utils/studyPlan";
import type { Squad, SquadMember } from "../types/squads";

export function SquadFace({ member, size = 36, ring = colors.surface }: { member: Pick<SquadMember, "avatar" | "focusingNow">; size?: number; ring?: string }) {
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <View style={[s.face, { width: size, height: size, borderRadius: size / 2 }]}><CharacterPortrait avatar={member.avatar || "🌱"} size={size} animate={false} interactive={false} /></View>
    {member.focusingNow && <View style={[s.live, { borderColor: ring }]} />}
  </View>;
}

/** This week in one squad: who focused most, who is focusing now, and the invite. */
export function SquadSheet({ squad, visible, onClose, onLeave, onRemove, onUpdate }: {
  squad: Squad | null; visible: boolean; onClose: () => void; onLeave: (id: string) => Promise<string | null>; onRemove: (id: string, member: string) => Promise<string | null>;
  onUpdate: (id: string, change: { name: string; goalMinutes: number | null } | "code") => Promise<string | null>;
}) {
  const [confirm, setConfirm] = useState<{ kind: "leave" } | { kind: "code" } | { kind: "remove"; member: SquadMember } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ name: string; goalMinutes: number | null } | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) { setWasVisible(visible); if (visible) { setConfirm(null); setError(""); setBusy(false); setEditing(null); } }
  if (!squad) return null;
  // Only the leader edits; if leadership moves on, the editor closes.
  if (editing && !squad.ownerIsYou) setEditing(null);
  const members = ranked(squad), top = Math.max(1, members[0]?.weekSeconds ?? 0), live = focusingCount(squad);
  const run = async (work: () => Promise<string | null>, after?: () => void) => {
    if (busy) return; setBusy(true);
    try { const failed = await work(); setConfirm(null); if (failed) setError(failed); else after?.(); } finally { setBusy(false); }
  };
  const share = () => { void Share.share({ message: `Join my squad "${squad.name}" with the code ${squad.code}.` }).catch(() => {}); };
  const goal = squad.goalMinutes ? squad.goalMinutes * 60 : 0, total = squadTotal(squad), progress = goalProgress(squad);
  const edit = () => { setError(""); setEditing({ name: squad.name, goalMinutes: squad.goalMinutes }); };
  const saveEdit = () => { if (!editing) return; const name = editing.name.trim(); if (!validSquadName(name)) { setError("Give your squad a name, up to 40 characters."); return; }
    Keyboard.dismiss(); void run(() => onUpdate(squad.id, { name, goalMinutes: editing.goalMinutes }), () => setEditing(null)); };
  return <AppSheet visible={visible} onRequestClose={() => { if (editing) setEditing(null); else onClose(); }} floating compact maxHeightRatio={0.9} label="squad" motionMode="timed"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan"
    header={<SheetHeader title={editing ? "Edit squad" : squad.name} subtitle={editing ? "Only you, the leader, can change these." : `${squad.members.length} ${squad.members.length === 1 ? "member" : "members"}${squad.ownerIsYou ? " · you lead this squad" : ""}${live ? ` · ${live} focusing now` : ""}`} onClose={() => { if (editing) setEditing(null); else onClose(); }} closeLabel={editing ? "Stop editing" : "Close squad"} />}
    overlay={confirm && <SheetConfirmation title={confirm.kind === "leave" ? `Leave ${squad.name}?` : confirm.kind === "code" ? "Get a new invite code?" : `Remove ${confirm.member.name}?`}
      message={confirm.kind === "leave" ? leaveOutcome(squad)
        : confirm.kind === "code" ? "The old code stops working. Everyone already in the squad stays." : "They can join again with the code."}
      confirmLabel={confirm.kind === "leave" ? squad.members.length <= 1 ? "Leave and close" : "Leave squad" : confirm.kind === "code" ? "New code" : "Remove"} cancelLabel={confirm.kind === "code" ? "Keep this code" : "Stay"} onCancel={() => setConfirm(null)}
      onConfirm={() => void (confirm.kind === "leave" ? run(() => onLeave(squad.id), onClose) : confirm.kind === "code" ? run(() => onUpdate(squad.id, "code")) : run(() => onRemove(squad.id, confirm.member.id)))} />}>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      {editing ? <>
        <BottomSheetTextInput value={editing.name} maxLength={40} editable={!busy} accessibilityLabel="Squad name" returnKeyType="done" style={s.input}
          onChangeText={name => { setEditing(current => current && { ...current, name }); setError(""); }} />
        <Text style={s.label}>Weekly goal together</Text>
        <View style={s.chips}>{[null, ...SQUAD_GOALS].map(minutes => {
          const selected = editing.goalMinutes === minutes;
          return <Pressable key={minutes ?? "none"} disabled={busy} onPress={() => setEditing(current => current && { ...current, goalMinutes: minutes })} accessibilityRole="radio"
            accessibilityState={{ checked: selected }} accessibilityLabel={minutes ? `${minutes / 60} hours a week` : "No goal"} style={[s.chip, selected && s.chipOn]}>
            <Text style={[s.chipText, selected && s.chipTextOn]}>{minutes ? `${minutes / 60}h` : "No goal"}</Text></Pressable>;
        })}</View>
        <Pressable disabled={busy} onPress={() => setConfirm({ kind: "code" })} accessibilityRole="button" style={s.codeRow}>
          <View style={s.flex}><Text style={s.rowTitle}>Invite code · {squad.code}</Text><Text style={s.note}>Get a new one if the old code was shared too widely.</Text></View>
          <Text style={s.link}>New code</Text>
        </Pressable>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Pressable disabled={busy} onPress={saveEdit} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{busy ? "Saving…" : "Save"}</Text></Pressable>
      </> : <>
      <View style={s.total} accessible accessibilityLabel={`Together this week, ${studyTime(total)}${goal ? ` of a ${squad.goalMinutes! / 60} hour goal` : ""}`}>
        <Text style={s.label}>Together this week</Text>
        <View style={s.bigRow}><Text style={s.big}>{studyTime(total)}</Text>{goal > 0 && <Text style={s.of}>of {squad.goalMinutes! / 60}h goal</Text>}</View>
        {progress !== null ? <>
          <View style={s.goalTrack}><View style={[s.goalFill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>
          <Text style={s.note}>{progress >= 1 ? "Goal reached. Nice work, everyone." : `${studyTime(goal - total)} to go · resets Monday`}</Text>
        </> : squad.ownerIsYou ? <Pressable disabled={busy} onPress={edit} accessibilityRole="button" accessibilityLabel="Set a weekly goal" hitSlop={8}><Text style={s.link}>Set a weekly goal</Text></Pressable>
          : <Text style={s.note}>Resets every Monday.</Text>}
      </View>
      <View style={s.list}>{members.map((member, index) => {
        const row = <>
          <Text style={[s.rank, index === 0 && member.weekSeconds > 0 && { color: colors.level }]}>{index + 1}</Text>
          <SquadFace member={member} ring={colors.sheetCard} />
          <View style={s.flex}>
            <View style={s.nameRow}><Text style={s.name} numberOfLines={1}>{member.name}{member.isYou ? <Text style={s.you}> (you)</Text> : null}</Text><Text style={s.time}>{studyTime(member.weekSeconds)}</Text></View>
            <View style={s.nameRow}><View style={s.track}><View style={[s.fill, { width: `${Math.round(100 * member.weekSeconds / top)}%` }]} /></View><Text style={s.meta}>Lv {member.level}</Text></View>
          </View>
        </>;
        const label = `${index + 1}. ${member.name}${member.isYou ? ", you" : ""}, ${studyTime(member.weekSeconds)} this week, level ${member.level}${member.focusingNow ? ", focusing now" : ""}`;
        return squad.ownerIsYou && !member.isYou
          ? <Pressable key={member.id} disabled={busy} onPress={() => setConfirm({ kind: "remove", member })} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Remove from squad" style={[s.row, index > 0 && s.line]}>{row}</Pressable>
          : <View key={member.id} accessible accessibilityLabel={label} style={[s.row, index > 0 && s.line]}>{row}</View>;
      })}</View>
      {squad.ownerIsYou && squad.members.length > 1 && <Text style={s.hint}>Tap someone to remove them from the squad.</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <View style={s.actions}>
        <View style={s.flex}><View style={s.code} accessible accessibilityLabel={`Invite code ${squad.code.split("").join(" ")}`}><Text style={s.codeLabel}>Invite code</Text><Text style={s.codeText}>{squad.code}</Text></View></View>
        <View style={s.flex}><Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share invite" style={s.primary}><Text style={s.primaryText}>Share invite</Text></Pressable></View>
      </View>
      <Text style={s.hint}>Everyone’s focus time counts, routines and study alike.</Text>
      <View style={s.list}>
        {squad.ownerIsYou && <Pressable disabled={busy} onPress={edit} accessibilityRole="button" accessibilityLabel="Edit name and goal" style={s.action}>
          <View style={[s.actionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="create-outline" size={17} color={colors.accent} /></View>
          <Text style={[s.rowTitle, s.flex]}>Edit name and goal</Text><Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
        </Pressable>}
        <Pressable disabled={busy} onPress={() => setConfirm({ kind: "leave" })} accessibilityRole="button" accessibilityLabel="Leave squad" style={[s.action, squad.ownerIsYou && s.line]}>
          <View style={[s.actionIcon, { backgroundColor: "rgba(255,105,97,0.14)" }]}><Ionicons name="exit-outline" size={17} color={colors.danger} /></View>
          <Text style={[s.rowTitle, s.flex, { color: colors.danger }]}>Leave squad</Text><Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
        </Pressable>
      </View>
      </>}
    </BottomSheetScrollView>
  </AppSheet>;
}

/** Join with a friend's code, or start a squad with a name. */
export function SquadJoinSheet({ visible, online, leading = null, memberships = 0, onClose, onJoin, onCreate }: {
  visible: boolean; online: boolean; leading?: string | null; memberships?: number; onClose: () => void; onJoin: (code: string) => Promise<string | null>; onCreate: (name: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"join" | "create">("join"), [code, setCode] = useState(""), [name, setName] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) { setWasVisible(visible); if (visible) { setMode("join"); setCode(""); setName(""); setError(""); setBusy(false); } }
  const input = useRef<TextInput>(null);
  // Join and Create stay tappable; a missing code or name is explained instead of greying the button out.
  const full = memberships >= SQUAD_LIMITS.member, blocked = mode === "create" ? !!leading || full : full;
  const ready = online && !busy && !blocked;
  const submit = async () => {
    if (!ready) return;
    if (mode === "join" && code.length !== SQUAD_CODE_LENGTH) { setError(`Enter all ${SQUAD_CODE_LENGTH} characters of the code.`); return; }
    if (mode === "create" && !validSquadName(name.trim())) { setError("Give your squad a name first."); return; }
    Keyboard.dismiss(); setBusy(true); setError("");
    try { const failed = mode === "join" ? await onJoin(code) : await onCreate(name.trim()); if (failed) setError(failed); else onClose(); }
    finally { setBusy(false); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) { Keyboard.dismiss(); onClose(); } }} floating compact label="join squad" motionMode="timed"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan"
    header={<SheetHeader title="Focus with friends" subtitle="See each other's focus time each week, study and routines." onClose={onClose} />}>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Segmented Touchable={Pressable as never} value={mode} disabled={busy} onChange={value => { setMode(value); setError(""); }}
        options={[{ value: "join", label: "Join" }, { value: "create", label: "Create" }]} />
      {mode === "join" ? <View>
        <View style={s.boxes} pointerEvents="none">{Array.from({ length: SQUAD_CODE_LENGTH }, (_, index) =>
          <View key={index} style={[s.box, index === Math.min(code.length, SQUAD_CODE_LENGTH - 1) && s.boxActive]}><Text style={s.boxText}>{code[index] ?? ""}</Text></View>)}</View>
        <BottomSheetTextInput ref={input as never} value={code} onChangeText={value => { setCode(cleanSquadCode(value)); setError(""); }} maxLength={SQUAD_CODE_LENGTH + 2}
          autoCapitalize="characters" autoCorrect={false} autoComplete="off" accessibilityLabel="Squad code" returnKeyType="join" onSubmitEditing={() => void submit()} style={s.hiddenInput} caretHidden />
      </View> : <BottomSheetTextInput value={name} onChangeText={value => { setName(value); setError(""); }} maxLength={40} placeholder="For example, Calc crew" placeholderTextColor={colors.secondary}
        accessibilityLabel="Squad name" returnKeyType="done" onSubmitEditing={() => void submit()} style={s.input} />}
      <Text style={s.hint}>{!online ? "Connect to the internet to join or create a squad."
        : full ? `You're in ${SQUAD_LIMITS.member} squads, the most for now. Leave one to join or start another.`
        : mode === "join" ? "Ask a friend for their squad's 6-character code. Squads hold up to 8 people, and only members see each other's focus time."
        : leading ? `You already lead ${leading}. You can lead one squad at a time, so leave it before starting another.`
        : "You'll lead this squad and get a code to share. You can lead one squad and be in up to three."}</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable disabled={!ready} onPress={() => void submit()} accessibilityRole="button" accessibilityState={{ disabled: !ready, busy }} style={[s.primary, !ready && s.disabled]}>
        <Text style={s.primaryText}>{busy ? "Please wait…" : mode === "join" ? "Join squad" : "Create squad"}</Text></Pressable>
    </BottomSheetScrollView>
  </AppSheet>;
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 }, flex: { flex: 1, minWidth: 0 },
  face: { overflow: "hidden", backgroundColor: colors.selection, alignItems: "center", justifyContent: "center" },
  live: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: colors.success },
  total: { ...edge, gap: 8, borderRadius: 22, backgroundColor: colors.sheetCard, paddingHorizontal: 16, paddingVertical: 14 },
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 8 }, of: { color: colors.secondary, fontSize: 15 },
  goalTrack: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden" }, goalFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  action: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  actionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: colors.sheetCard },
  chipOn: { backgroundColor: colors.accentSoft }, chipText: { color: colors.text, fontSize: 15, fontWeight: "600" }, chipTextOn: { color: colors.accent },
  codeRow: { ...edge, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.sheetCard },
  rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  note: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  label: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  big: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  list: { ...edge, borderRadius: 22, backgroundColor: colors.sheetCard, overflow: "hidden" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rank: { width: 18, textAlign: "center", color: colors.secondary, fontSize: 15, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }, you: { color: colors.secondary, fontWeight: "500" },
  time: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" }, fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  meta: { color: colors.secondary, fontSize: 13, minWidth: 40, textAlign: "right" },
  hint: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  actions: { flexDirection: "row", gap: 10 },
  code: { minHeight: 54, borderRadius: 27, backgroundColor: colors.sheetCard, alignItems: "center", justifyContent: "center" },
  codeLabel: { color: colors.secondary, fontSize: 12, lineHeight: 15 }, codeText: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: 2 },
  primary: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" }, disabled: { opacity: 0.45 },
  boxes: { flexDirection: "row", gap: 8 },
  box: { flex: 1, height: 56, borderRadius: 14, backgroundColor: colors.sheetCard, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  boxActive: { borderColor: colors.accent }, boxText: { color: colors.text, fontSize: 24, fontWeight: "800" },
  hiddenInput: { position: "absolute", left: 0, right: 0, top: 0, height: 56, opacity: 0.02, color: "transparent" },
  input: { ...edge, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 17, borderRadius: 16, backgroundColor: colors.sheetCard },
});
