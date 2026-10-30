import { memo, useRef, useState } from "react";
import { Keyboard, StyleSheet, View, type TextInput } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Segmented from "./Segmented";
import InitialsAvatar from "./InitialsAvatar";
import { useUser } from "../context/UserContext";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { studyTime } from "../utils/studyPlan";
import { cleanSquadCode, SQUAD_CODE_LENGTH, SQUAD_GOALS, SQUAD_LIMITS, validSquadName } from "../utils/squads";
import { usePlayerCard } from "../hooks/usePlayer";
import { Ionicons } from "@expo/vector-icons";
import type { Squad, SquadMember } from "../types/squads";
import SheetTextInput from "./SheetTextInput";

// Everyone appears as their initials; a small dot shows who's focusing now.
type Face = Pick<SquadMember, "id" | "name" | "focusingNow"> & { isYou?: boolean };
export const SquadFace = memo(function SquadFace({ member, size = 48, ring = colors.surface }: { member: Face; size?: number; ring?: string }) {
  return <View style={{ width: size }} importantForAccessibility="no-hide-descendants">
    {member.isYou ? <YourInitials fallback={member.name} id={member.id} size={size} /> : <InitialsAvatar name={member.name} id={member.id} size={size} />}
    {member.focusingNow && <View style={[s.live, { top: size - 11, borderColor: ring }]} />}
  </View>;
}, (previous, next) => previous.size === next.size && previous.ring === next.ring
  && previous.member.isYou === next.member.isYou && previous.member.id === next.member.id
  && previous.member.name === next.member.name && previous.member.focusingNow === next.member.focusingNow);

// Only your own face follows your profile, so a rename doesn't redraw everyone else.
function YourInitials({ fallback, id, size }: { fallback: string; id: string; size: number }) {
  const { profile } = useUser();
  return <InitialsAvatar name={profile.username || fallback} id={profile.id ?? id} size={size} />;
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

const DAY = ["S", "M", "T", "W", "T", "F", "S"];
/** One number on the card. The layout is the same before and after loading, so the sheet never jumps. */
function Stat({ icon, tint, value, label }: { icon: React.ComponentProps<typeof Ionicons>["name"]; tint: string; value: string; label: string }) {
  return <View style={s.stat} accessible accessibilityLabel={`${value} ${label}`}>
    <View style={[s.statIcon, { backgroundColor: tint + "22" }]}><Ionicons name={icon} size={15} color={tint} /></View>
    <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
    <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
  </View>;
}

/**
 * A player card: tap anyone in the squad. Their initials; this week;
 * the last seven days as bars; and all-time focus. Squad mates see each
 * other's stats. The
 * leader can remove someone here, deliberately, with two clear choices: a
 * plain remove (they can rejoin with the code), or remove and change the
 * code, for when the code reached the wrong person.
 */
export function SquadMemberSheet({ member, leader, busy, onClose, onDismiss, onRemove }: {
  member: SquadMember | null; leader: boolean; busy: boolean;
  onClose: () => void; onDismiss?: () => void; onRemove: (member: SquadMember, newCode: boolean) => void;
}) {
  const canRemove = leader && !!member && !member.isYou;
  const { card, failed } = usePlayerCard(member?.id ?? null);
  const { profile } = useUser();
  const stats = card?.stats ?? null, since = stats?.since ? new Date(stats.since) : null;
  const top = Math.max(1, ...(stats?.last7 ?? [0]));
  const today = new Date().getDay();
  const dash = "–";
  return <AppSheet visible={!!member} onRequestClose={onClose} onDismiss={onDismiss} compact label="player card" motionMode="timed"
    header={member ? <SheetHeader title={member.isYou ? `${member.name} (you)` : member.name} subtitle={member.isOwner ? "Squad leader" : "Squad member"} onClose={onClose} /> : undefined}>
    {member && <BottomSheetScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={s.hero} testID="player-card">
        <InitialsAvatar name={member.isYou ? profile.username || member.name : member.name} id={member.isYou ? profile.id ?? member.id : member.id} size={88} />
        {member.focusingNow && <View style={s.focusing}><View style={s.focusDot} /><Text style={s.focusText}>Focusing now</Text></View>}
      </View>

      <Text style={s.label}>This week</Text>
      <View style={s.facts}>
        <Stat icon="time" tint={colors.progress} value={studyTime(member.weekSeconds)} label="focused" />
        <Stat icon="flame" tint={colors.streak} value={String(stats?.streak ?? member.streak)} label="day streak" />
      </View>

      <View style={s.chart} accessible accessibilityLabel={stats ? `Last 7 days: ${stats.last7.map(v => studyTime(v)).join(", ")}` : "Last 7 days, loading"}>
        <Text style={s.chartTitle}>Last 7 days</Text>
        <View style={s.bars}>{(stats?.last7 ?? [0, 0, 0, 0, 0, 0, 0]).map((v, i) => {
          const isToday = i === 6;
          return <View key={i} style={s.barCol}>
            <View style={s.barTrack}><View style={[s.bar, { height: `${v > 0 ? Math.max(8, Math.round(100 * v / top)) : 0}%`, backgroundColor: isToday ? colors.progress : colors.accent + "AA" }]} /></View>
            <Text style={[s.day, isToday && { color: colors.text, fontWeight: "800" }]}>{DAY[(today + i + 1) % 7]}</Text>
          </View>;
        })}</View>
      </View>

      <Text style={s.label}>All time</Text>
      <View style={s.grid}>
        <Stat icon="hourglass" tint={colors.progress} value={stats ? studyTime(stats.totalSeconds) : dash} label="focused" />
        <Stat icon="checkmark-done" tint={colors.progress} value={stats ? String(stats.sessions) : dash} label={stats?.sessions === 1 ? "session" : "sessions"} />
      </View>
      <View style={s.grid}>
        <Stat icon="stopwatch" tint={colors.progress} value={stats ? studyTime(stats.longestSeconds) : dash} label="longest session" />
        <Stat icon="calendar" tint={colors.progress} value={stats ? String(stats.daysFocused) : dash} label={stats?.daysFocused === 1 ? "day focused" : "days focused"} />
      </View>

      {!stats && failed && <Text style={s.hint}>Couldn’t load their stats right now.</Text>}
      <Text style={s.since}>{since ? `Focusing since ${since.toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : " "}</Text>

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
  hero: { ...edge, alignItems: "center", gap: 8, paddingTop: 18, paddingBottom: 16, borderRadius: 24, overflow: "hidden", backgroundColor: colors.sheetCard },
  focusing: { flexDirection: "row", alignItems: "center", gap: 6 }, focusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  focusText: { color: colors.success, fontSize: 13, fontWeight: "700" },
  stat: { ...edge, flex: 1, minHeight: 86, padding: 11, gap: 3, borderRadius: 16, backgroundColor: colors.sheetCard },
  statIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statValue: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16 },
  grid: { flexDirection: "row", gap: 8 },
  chart: { ...edge, gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.sheetCard },
  chartTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  bars: { flexDirection: "row", gap: 8, height: 92 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { flex: 1, width: "100%", maxWidth: 22, justifyContent: "flex-end", borderRadius: 6, backgroundColor: colors.track, overflow: "hidden" },
  bar: { width: "100%", borderRadius: 6 },
  day: { color: colors.secondary, fontSize: 12, fontWeight: "600" },
  since: { color: colors.secondary, fontSize: 13, lineHeight: 18, textAlign: "center", minHeight: 18 },
  facts: { flexDirection: "row", gap: 8 },
  fact: { ...edge, flex: 1, minHeight: 76, padding: 12, gap: 2, borderRadius: 16, backgroundColor: colors.sheetCard, justifyContent: "center" },
  factValue: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  factLabel: { color: colors.secondary, fontSize: 13, lineHeight: 17 },
  remove: { minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerSoft },
  removeText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
  live: { position: "absolute", right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: colors.success },
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
