import { useRef, useState } from "react";
import { Keyboard, StyleSheet, View, type TextInput } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Segmented from "./Segmented";
import CharacterPortrait from "./CharacterPortrait";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { studyTime } from "../utils/studyPlan";
import { cleanSquadCode, SQUAD_CODE_LENGTH, SQUAD_GOALS, SQUAD_LIMITS, validSquadName } from "../utils/squads";
import type { Squad, SquadMember } from "../types/squads";
import SheetTextInput from "./SheetTextInput";

export function SquadFace({ member, size = 36, ring = colors.surface }: { member: Pick<SquadMember, "avatar" | "focusingNow">; size?: number; ring?: string }) {
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <View style={[s.face, { width: size, height: size, borderRadius: size / 2 }]}><CharacterPortrait avatar={member.avatar || "🌱"} size={size} animate={false} interactive={false} /></View>
    {member.focusingNow && <View style={[s.live, { borderColor: ring }]} />}
  </View>;
}

/** Rename a squad and set its weekly goal. Only the leader sees this. */
export function SquadEditSheet({ squad, visible, onClose, onSave }: {
  squad: Squad | null; visible: boolean; onClose: () => void;
  onSave: (id: string, change: { name: string; goalMinutes: number | null }) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState({ name: "", goalMinutes: null as number | null });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [wasVisible, setWasVisible] = useState(false);
  if (wasVisible !== visible) { setWasVisible(visible); if (visible && squad) { setDraft({ name: squad.name, goalMinutes: squad.goalMinutes }); setError(""); setBusy(false); } }
  if (!squad) return null;
  const save = async () => {
    const name = draft.name.trim();
    if (!validSquadName(name)) { setError("Give your squad a name, up to 40 characters."); return; }
    if (busy) return; Keyboard.dismiss(); setBusy(true);
    try { const failed = await onSave(squad.id, { name, goalMinutes: draft.goalMinutes }); if (failed) setError(failed); else onClose(); } finally { setBusy(false); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) onClose(); }} compact label="edit squad" motionMode="timed"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan"
    header={<SheetHeader title="Edit squad" subtitle="Everyone in the squad sees these." onClose={() => { if (!busy) onClose(); }} />}>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.label}>Name</Text>
      <SheetTextInput value={draft.name} maxLength={40} editable={!busy} accessibilityLabel="Squad name" returnKeyType="done" style={s.input}
        onChangeText={name => { setDraft(current => ({ ...current, name })); setError(""); }} />
      <Text style={s.label}>Weekly goal together</Text>
      <View style={s.chips}>{[null, ...SQUAD_GOALS].map(minutes => {
        const selected = draft.goalMinutes === minutes;
        return <Pressable key={minutes ?? "none"} disabled={busy} onPress={() => setDraft(current => ({ ...current, goalMinutes: minutes }))} accessibilityRole="radio"
          accessibilityState={{ checked: selected }} accessibilityLabel={minutes ? `${minutes / 60} hours a week` : "No goal"} style={[s.chip, selected && s.chipOn]}>
          <Text style={[s.chipText, selected && s.chipTextOn]}>{minutes ? `${minutes / 60}h` : "No goal"}</Text></Pressable>;
      })}</View>
      <Text style={s.hint}>The goal resets every Monday. All focus time counts, routines and study alike.</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable disabled={busy} onPress={() => void save()} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{busy ? "Saving…" : "Save"}</Text></Pressable>
    </BottomSheetScrollView>
  </AppSheet>;
}

/** Join with a friend's code, or start a squad with a name. */
export function SquadJoinSheet({ visible, online, leading = null, leadCount, memberships = 0, limits = SQUAD_LIMITS, onClose, onJoin, onCreate }: {
  visible: boolean; online: boolean; leading?: string | null; memberships?: number; onClose: () => void; onJoin: (code: string) => Promise<string | null>; onCreate: (name: string) => Promise<string | null>;
  /** How many squads you lead now, and your limits from the server. */
  leadCount?: number; limits?: { lead: number; member: number };
}) {
  const [mode, setMode] = useState<"join" | "create">("join"), [code, setCode] = useState(""), [name, setName] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) { setWasVisible(visible); if (visible) { setMode("join"); setCode(""); setName(""); setError(""); setBusy(false); } }
  const input = useRef<TextInput>(null);
  // Join and Create stay tappable; a missing code or name is explained instead of greying the button out.
  const led = leadCount ?? (leading ? 1 : 0), leadFull = led >= limits.lead;
  const full = memberships >= limits.member, blocked = mode === "create" ? leadFull || full : full;
  const ready = online && !busy && !blocked;
  const submit = async () => {
    if (!ready) return;
    if (mode === "join" && code.length !== SQUAD_CODE_LENGTH) { setError(`Enter all ${SQUAD_CODE_LENGTH} characters of the code.`); return; }
    if (mode === "create" && !validSquadName(name.trim())) { setError("Give your squad a name first."); return; }
    Keyboard.dismiss(); setBusy(true); setError("");
    try { const failed = mode === "join" ? await onJoin(code) : await onCreate(name.trim()); if (failed) setError(failed); else onClose(); }
    finally { setBusy(false); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (!busy) { Keyboard.dismiss(); onClose(); } }} compact label="join squad" motionMode="timed"
    keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan"
    header={<SheetHeader title="Join or start a squad" subtitle="See each other's focus time each week, study and routines." onClose={onClose} />}>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Segmented Touchable={Pressable as never} value={mode} disabled={busy} onChange={value => { setMode(value); setError(""); }}
        options={[{ value: "join", label: "Join" }, { value: "create", label: "Create" }]} />
      {mode === "join" ? <View>
        <View style={s.boxes} pointerEvents="none">{Array.from({ length: SQUAD_CODE_LENGTH }, (_, index) =>
          <View key={index} style={[s.box, index === Math.min(code.length, SQUAD_CODE_LENGTH - 1) && s.boxActive]}><Text style={s.boxText}>{code[index] ?? ""}</Text></View>)}</View>
        <SheetTextInput ref={input as never} value={code} onChangeText={value => { setCode(cleanSquadCode(value)); setError(""); }} maxLength={SQUAD_CODE_LENGTH + 2}
          autoCapitalize="characters" autoCorrect={false} autoComplete="off" accessibilityLabel="Squad code" returnKeyType="join" onSubmitEditing={() => void submit()} style={s.hiddenInput} caretHidden />
      </View> : <SheetTextInput value={name} onChangeText={value => { setName(value); setError(""); }} maxLength={40} placeholder="For example, Calc crew" placeholderTextColor={colors.secondary}
        accessibilityLabel="Squad name" returnKeyType="done" onSubmitEditing={() => void submit()} style={s.input} />}
      <Text style={s.hint}>{!online ? "Connect to the internet to join or create a squad."
        : full ? `You're in ${limits.member} squads, the most for now. Leave one to join or start another.`
        : mode === "join" ? "Ask a friend for their squad's 6-character code. Squads hold up to 8 people, and only members see each other's focus time."
        : leadFull ? limits.lead === 1 && leading ? `You already lead ${leading}. You can lead one squad at a time, so leave it before starting another.` : `You lead ${led} squads, the most for now. Leave one before starting another.`
        : limits.lead === 1 ? "You'll lead this squad and get a code to share. You can lead one squad and be in up to three." : `You'll lead this squad and get a code to share. You can lead up to ${limits.lead} squads and be in up to ${limits.member}.`}</Text>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable disabled={!ready} onPress={() => void submit()} accessibilityRole="button" accessibilityState={{ disabled: !ready, busy }} style={[s.primary, !ready && s.disabled]}>
        <Text style={s.primaryText}>{busy ? "Please wait…" : mode === "join" ? "Join squad" : "Create squad"}</Text></Pressable>
    </BottomSheetScrollView>
  </AppSheet>;
}

/**
 * One member, tapped on the leaderboard: their week at a glance. The leader
 * can remove them here, deliberately, with two clear choices: a plain remove
 * (they can rejoin with the code), or remove and change the code, for when
 * the code reached someone it shouldn't have.
 */
export function SquadMemberSheet({ member, place, leader, busy, onClose, onDismiss, onRemove }: {
  member: SquadMember | null; place: number | null; leader: boolean; busy: boolean;
  onClose: () => void; onDismiss?: () => void; onRemove: (member: SquadMember, newCode: boolean) => void;
}) {
  const canRemove = leader && !!member && !member.isYou;
  return <AppSheet visible={!!member} onRequestClose={onClose} onDismiss={onDismiss} compact label="squad member" motionMode="timed"
    header={member ? <SheetHeader title={member.isYou ? `${member.name} (you)` : member.name} subtitle={`Level ${member.level}${member.isOwner ? " · Squad leader" : ""}${member.focusingNow ? " · Focusing now" : ""}`} onClose={onClose} /> : undefined}>
    {member && <BottomSheetScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={s.facts}>
        <View style={s.fact}><Text style={s.factValue}>{place ? `#${place}` : "–"}</Text><Text style={s.factLabel}>{place ? "this week" : "not ranked yet"}</Text></View>
        <View style={s.fact}><Text style={s.factValue}>{studyTime(member.weekSeconds)}</Text><Text style={s.factLabel}>focused this week</Text></View>
        <View style={s.fact}><Text style={s.factValue}>{member.streak}</Text><Text style={s.factLabel}>day streak</Text></View>
      </View>
      {canRemove && <>
        <Pressable disabled={busy} onPress={() => onRemove(member, false)} accessibilityRole="button" accessibilityLabel={`Remove ${member.name}`} style={[s.remove, busy && s.disabled]}>
          <Text style={s.removeText}>Remove from squad</Text></Pressable>
        <Pressable disabled={busy} onPress={() => onRemove(member, true)} accessibilityRole="button" accessibilityLabel={`Remove ${member.name} and get a new code`} style={[s.remove, busy && s.disabled]}>
          <Text style={s.removeText}>Remove and get a new code</Text></Pressable>
        <Text style={s.hint}>Don’t know who this is? Get a new code too, so only people you invite can join.</Text>
      </>}
    </BottomSheetScrollView>}
  </AppSheet>;
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  facts: { flexDirection: "row", gap: 8 },
  fact: { ...edge, flex: 1, minHeight: 76, padding: 12, gap: 2, borderRadius: 16, backgroundColor: colors.sheetCard, justifyContent: "center" },
  factValue: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  factLabel: { color: colors.secondary, fontSize: 13, lineHeight: 17 },
  remove: { minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  removeText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
  face: { overflow: "hidden", backgroundColor: colors.selection, alignItems: "center", justifyContent: "center" },
  live: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: colors.success },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { ...edge, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center", backgroundColor: colors.sheetCard },
  chipOn: { backgroundColor: colors.accentSoft }, chipText: { color: colors.text, fontSize: 15, fontWeight: "600" }, chipTextOn: { color: colors.accent },
  label: { color: colors.secondary, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  hint: { color: colors.secondary, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  primary: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" }, disabled: { opacity: 0.45 },
  boxes: { flexDirection: "row", gap: 8 },
  box: { flex: 1, height: 56, borderRadius: 14, backgroundColor: colors.sheetCard, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  boxActive: { borderColor: colors.accent }, boxText: { color: colors.text, fontSize: 24, fontWeight: "800" },
  hiddenInput: { position: "absolute", left: 0, right: 0, top: 0, height: 56, opacity: 0.02, color: "transparent" },
  input: { ...edge, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, color: colors.text, fontSize: 17, borderRadius: 16, backgroundColor: colors.sheetCard },
});
