import { useRef, useState } from "react";
import { Keyboard, StyleSheet, View, type TextInput } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import Segmented from "./Segmented";
import CharacterMark from "./CharacterMark";
import ProfilePicture from "./adventurer/ProfilePicture";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { studyTime } from "../utils/studyPlan";
import { cleanSquadCode, SQUAD_CODE_LENGTH, SQUAD_GOALS, SQUAD_LIMITS, validSquadName } from "../utils/squads";
import { normalizeLook } from "../utils/adventurerLook";
import { levelTierProgress } from "../utils/levelTiers";
import { rewardItem } from "../services/rewardCatalog";
import { usePlayerCard } from "../hooks/usePlayer";
import type { PlayerLook, Squad, SquadMember } from "../types/squads";
import SheetTextInput from "./SheetTextInput";

// Everyone appears with their own profile picture: you from your own saved
// look (the same as Home), others from the look their app last saved.
type Face = Pick<SquadMember, "focusingNow"> & { isYou?: boolean; level?: number; streak?: number; look?: PlayerLook | null };
export function SquadFace({ member, size = 36, ring = colors.surface }: { member: Face; size?: number; ring?: string }) {
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    {member.isYou ? <CharacterMark size={size} /> : <PlayerPicture member={member} size={size} />}
    {member.focusingNow && <View style={[s.live, { borderColor: ring }]} />}
  </View>;
}
function PlayerPicture({ member, size }: { member: Face; size: number }) {
  const look = member.look;
  return <ProfilePicture look={normalizeLook(look?.look as Parameters<typeof normalizeLook>[0])} equipped={look?.equipped ?? {}} level={member.level ?? 1} background={look?.background ?? "bg_dusk"}
    frame={look?.frame ?? null} streak={member.streak ?? 0} size={size} />;
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
 * A player card: tap anyone on the leaderboard. Their picture, name, badge
 * and level always show; their all-time focus stats show unless they keep
 * them to themselves. The leader can remove someone here, deliberately, with
 * two clear choices: a plain remove (they can rejoin with the code), or
 * remove and change the code, for when the code reached the wrong person.
 */
export function SquadMemberSheet({ member, place, leader, busy, onClose, onDismiss, onRemove }: {
  member: SquadMember | null; place: number | null; leader: boolean; busy: boolean;
  onClose: () => void; onDismiss?: () => void; onRemove: (member: SquadMember, newCode: boolean) => void;
}) {
  const canRemove = leader && !!member && !member.isYou;
  const { card, loading, failed } = usePlayerCard(member?.id ?? null);
  const look = card?.look ?? member?.look ?? null, title = look?.title ? rewardItem(look.title)?.name : undefined;
  const tier = member ? levelTierProgress(card?.level ?? member.level, 0).current : null;
  const stats = card?.stats, since = stats?.since ? new Date(stats.since) : null;
  return <AppSheet visible={!!member} onRequestClose={onClose} onDismiss={onDismiss} compact label="player card" motionMode="timed"
    header={member ? <SheetHeader title={member.isYou ? `${member.name} (you)` : member.name} subtitle={`${member.isOwner ? "Squad leader" : "Squad member"}${member.focusingNow ? " · Focusing now" : ""}`} onClose={onClose} /> : undefined}>
    {member && <BottomSheetScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={s.hero} testID="player-card">
        {member.isYou ? <CharacterMark size={124} /> : <PlayerPicture member={{ ...member, look }} size={124} />}
        <View style={s.heroText}>
          {!!title && <View style={s.badge}><Text style={s.badgeText} numberOfLines={1}>{title}</Text></View>}
          <Text style={[s.tier, { color: tier?.color }]}>{`Level ${card?.level ?? member.level} · ${tier?.title}`}</Text>
        </View>
      </View>
      <View style={s.facts}>
        <View style={s.fact}><Text style={s.factValue}>{place ? `#${place}` : "–"}</Text><Text style={s.factLabel}>{place ? "this week" : "not ranked yet"}</Text></View>
        <View style={s.fact}><Text style={s.factValue}>{studyTime(member.weekSeconds)}</Text><Text style={s.factLabel}>focused this week</Text></View>
        <View style={s.fact}><Text style={s.factValue}>{member.streak}</Text><Text style={s.factLabel}>day streak</Text></View>
      </View>
      {stats ? <>
        <Text style={s.label}>All time</Text>
        <View style={s.facts}>
          <View style={s.fact}><Text style={s.factValue}>{studyTime(stats.totalSeconds)}</Text><Text style={s.factLabel}>focused</Text></View>
          <View style={s.fact}><Text style={s.factValue}>{stats.sessions}</Text><Text style={s.factLabel}>{stats.sessions === 1 ? "session" : "sessions"}</Text></View>
          <View style={s.fact}><Text style={s.factValue}>{stats.collected}</Text><Text style={s.factLabel}>{stats.collected === 1 ? "find" : "finds"}</Text></View>
        </View>
        {since && <Text style={s.hint}>{`Focusing since ${since.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}</Text>}
        {member.isYou && card && !card.statsShared && <Text style={s.hint}>Only you see these. You can share them with your squads in Settings.</Text>}
      </> : card ? <Text style={s.hint}>{`${member.name} keeps their stats to themselves.`}</Text>
        : loading ? <Text style={s.hint}>Loading their stats…</Text>
        : failed ? <Text style={s.hint}>Couldn’t load their stats right now.</Text> : null}
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
  hero: { alignItems: "center", gap: 10, paddingTop: 4 },
  heroText: { alignItems: "center", gap: 6 },
  badge: { paddingHorizontal: 12, minHeight: 26, borderRadius: 13, justifyContent: "center", backgroundColor: "rgba(167,139,250,0.16)" },
  badgeText: { color: "#C4B5FD", fontSize: 13, fontWeight: "700" },
  tier: { fontSize: 15, fontWeight: "700" },
  facts: { flexDirection: "row", gap: 8 },
  fact: { ...edge, flex: 1, minHeight: 76, padding: 12, gap: 2, borderRadius: 16, backgroundColor: colors.sheetCard, justifyContent: "center" },
  factValue: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  factLabel: { color: colors.secondary, fontSize: 13, lineHeight: 17 },
  remove: { minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  removeText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
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
