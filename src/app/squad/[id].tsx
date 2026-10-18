import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Animated, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import SheetConfirmation from "../../components/SheetConfirmation";
import { SquadEditSheet, SquadFace } from "../../components/SquadSheets";
import { daysLeftInWeek } from "../../components/SquadsSection";
import { colors, edge, radius } from "../../constants/theme";
import { useSquads } from "../../hooks/useSquads";
import { focusingCount, goalProgress, leaveOutcome, ranked, squadTotal } from "../../utils/squads";
import { studyTime } from "../../utils/studyPlan";
import type { SquadMember } from "../../types/squads";

type Confirm = { kind: "leave" } | { kind: "code" } | { kind: "remove"; member: SquadMember } | null;

/** One squad, full screen: this week's goal, the table, and the invite. */
export default function SquadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter(), squads = useSquads();
  const squad = squads.squads.find(item => item.id === id) ?? null;
  const [menu, setMenu] = useState(false), [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const refresh = squads.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const run = async (work: () => Promise<string | null>, after?: () => void) => {
    if (busy) return; setBusy(true); setError("");
    try { const failed = await work(); setConfirm(null); if (failed) setError(failed); else after?.(); } finally { setBusy(false); }
  };
  const back = () => { if (router.canGoBack()) router.back(); else router.replace("/squads"); };
  const action = squad && <Pressable onPress={() => setMenu(open => !open)} accessibilityRole="button" accessibilityLabel="Squad options" accessibilityState={{ expanded: menu }} hitSlop={8} style={s.more}>
    <Ionicons name="ellipsis-horizontal" size={20} color={colors.accent} /></Pressable>;
  if (!squad) return <PersonalPage title="Squad" subtitle="" back animateTransition fallback="/squads">
    <View style={[s.card, s.gone]}><Text style={s.title}>{squads.ready ? "This squad isn’t here anymore" : "Loading your squad…"}</Text>
      {squads.ready && <Text style={s.caption}>You may have left it, or it closed when its last member left.</Text>}</View>
  </PersonalPage>;
  const total = squadTotal(squad), progress = goalProgress(squad), goal = squad.goalMinutes ? squad.goalMinutes * 60 : 0, live = focusingCount(squad);
  const members = ranked(squad), top = Math.max(1, members[0]?.weekSeconds ?? 0), left = daysLeftInWeek();
  const share = () => { void Share.share({ message: `Join my squad "${squad.name}" with the code ${squad.code}.` }).catch(() => {}); };
  const options = [
    ...(squad.ownerIsYou ? [{ label: "Edit name and goal", icon: "create-outline" as const, onPress: () => setEditing(true) },
      { label: "New invite code", icon: "refresh" as const, onPress: () => setConfirm({ kind: "code" }) }] : []),
    { label: "Share invite", icon: "share-outline" as const, onPress: share },
    { label: "Leave squad", icon: "exit-outline" as const, danger: true, onPress: () => setConfirm({ kind: "leave" }) },
  ];
  return <View style={s.screen}>
    <PersonalPage title={squad.name} subtitle="" back animateTransition fallback="/squads" action={action}>
      <View style={s.hero}>
        <View style={s.faces}>{squad.members.slice(0, 5).map((member, i) => <View key={member.id} style={[s.faceSlot, i > 0 && { marginLeft: -12 }]}><SquadFace member={member} size={40} ring={colors.background} /></View>)}</View>
        <Text style={s.caption}>{squad.members.length} {squad.members.length === 1 ? "member" : "members"}{squad.ownerIsYou ? " · you lead this squad" : ""}{live ? ` · ${live} focusing now` : ""}</Text>
      </View>
      <View style={s.card} accessible accessibilityLabel={`Together this week, ${studyTime(total)}${goal ? ` of a ${squad.goalMinutes! / 60} hour goal` : ""}`}>
        <Text style={s.label}>Together this week</Text>
        <View style={s.bigRow}><Text style={s.big}>{studyTime(total)}</Text>{goal > 0 && <Text style={s.of}>of {squad.goalMinutes! / 60}h goal</Text>}</View>
        {progress !== null && <View style={s.track}><View style={[s.fill, { width: `${Math.max(progress > 0 ? 3 : 0, Math.round(progress * 100))}%` }, progress >= 1 && { backgroundColor: colors.success }]} /></View>}
        <Text style={s.caption}>{progress !== null && progress >= 1 ? "Goal reached. Nice work, everyone." : goal ? `${studyTime(goal - total)} to go · ${left} ${left === 1 ? "day" : "days"} left` : `Resets on Monday · ${left} ${left === 1 ? "day" : "days"} left`}</Text>
        {squad.ownerIsYou && !goal && <Pressable onPress={() => setEditing(true)} accessibilityRole="button" hitSlop={8}><Text style={s.link}>Set a weekly goal</Text></Pressable>}
      </View>
      <Text style={s.section} accessibilityRole="header">This week</Text>
      <View style={s.list}>{members.map((member, index) => {
        const label = `${index + 1}. ${member.name}${member.isYou ? ", you" : ""}, ${studyTime(member.weekSeconds)} this week, level ${member.level}${member.focusingNow ? ", focusing now" : ""}`;
        const row = <>
          <Text style={[s.rank, index === 0 && member.weekSeconds > 0 && { color: colors.level }]}>{index + 1}</Text>
          <SquadFace member={member} ring={colors.surface} />
          <View style={s.flex}>
            <View style={s.nameRow}><Text style={s.name} numberOfLines={1}>{member.name}{member.isYou ? <Text style={s.you}> (you)</Text> : null}</Text><Text style={s.time}>{studyTime(member.weekSeconds)}</Text></View>
            <View style={s.nameRow}><View style={s.thin}><View style={[s.thinFill, { width: `${Math.round(100 * member.weekSeconds / top)}%` }]} /></View><Text style={s.meta}>Lv {member.level}</Text></View>
          </View>
        </>;
        return squad.ownerIsYou && !member.isYou
          ? <Pressable key={member.id} disabled={busy} onLongPress={() => setConfirm({ kind: "remove", member })} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Hold to remove from the squad" style={[s.row, index > 0 && s.line]}>{row}</Pressable>
          : <View key={member.id} accessible accessibilityLabel={label} style={[s.row, index > 0 && s.line]}>{row}</View>;
      })}</View>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <View style={s.invite}>
        <View style={s.code} accessible accessibilityLabel={`Invite code ${squad.code.split("").join(" ")}`}><Text style={s.codeLabel}>Invite code</Text><Text style={s.codeText}>{squad.code}</Text></View>
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Invite friends" style={s.primary}><Ionicons name="share-outline" size={17} color={colors.primaryText} /><Text style={s.primaryText}>Invite friends</Text></Pressable>
      </View>
      <Text style={s.hint}>{squad.ownerIsYou && squad.members.length > 1 ? "Hold someone to remove them. " : ""}Only members see each other’s time. All focus counts, routines and study alike.</Text>
    </PersonalPage>
    {menu && <View style={StyleSheet.absoluteFill} testID="squad-menu">
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityRole="button" accessibilityLabel="Close squad options" haptic={false} />
      <Popover>{options.map((option, index) => <Pressable key={option.label} onPress={() => { setMenu(false); option.onPress(); }} accessibilityRole="menuitem" accessibilityLabel={option.label} style={[s.option, index > 0 && s.optionLine]}>
        <Text style={[s.optionText, option.danger && { color: colors.danger }]}>{option.label}</Text>
        <Ionicons name={option.icon} size={18} color={option.danger ? colors.danger : colors.text} />
      </Pressable>)}</Popover>
    </View>}
    <SquadEditSheet squad={squad} visible={editing} onClose={() => setEditing(false)} onSave={squads.update} />
    {confirm && <SheetConfirmation destructive={confirm.kind !== "code"}
      title={confirm.kind === "leave" ? `Leave ${squad.name}?` : confirm.kind === "code" ? "Get a new invite code?" : `Remove ${confirm.member.name}?`}
      message={confirm.kind === "leave" ? leaveOutcome(squad) : confirm.kind === "code" ? "The old code stops working. Everyone already in the squad stays." : "They can join again with the code."}
      confirmLabel={confirm.kind === "leave" ? squad.members.length <= 1 ? "Leave and close" : "Leave squad" : confirm.kind === "code" ? "New code" : "Remove"}
      cancelLabel={confirm.kind === "code" ? "Keep this code" : "Cancel"} onCancel={() => setConfirm(null)}
      onConfirm={() => void (confirm.kind === "leave" ? run(() => squads.leave(squad.id), back) : confirm.kind === "code" ? run(() => squads.update(squad.id, "code")) : run(() => squads.remove(squad.id, confirm.member.id)))} />}
  </View>;
}
// The menu grows from the ••• button, like an iOS context menu. It sits just
// under the 64pt header, wherever the status bar ends on this phone.
function Popover({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion(), top = useSafeAreaInsets().top + 56;
  const [shown] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => { if (!reduced) Animated.spring(shown, { toValue: 1, damping: 22, stiffness: 320, mass: 0.8, useNativeDriver: true }).start(); }, [reduced, shown]);
  return <Animated.View style={[s.popover, { top, opacity: shown, transformOrigin: "top right", transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>{children}</Animated.View>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1, minWidth: 0 },
  more: { ...edge, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  hero: { gap: 10, paddingHorizontal: 4, marginBottom: 4 },
  faces: { flexDirection: "row", alignItems: "center" }, faceSlot: { borderRadius: 22, borderWidth: 2, borderColor: colors.background },
  card: { ...edge, gap: 8, borderRadius: radius.card, backgroundColor: colors.surface, padding: 16 },
  gone: { gap: 6 }, title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
  bigRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  big: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800", fontVariant: ["tabular-nums"] }, of: { color: colors.secondary, fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.selection, overflow: "hidden", marginTop: 2 }, fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 }, link: { color: colors.accent, fontSize: 15, fontWeight: "600", marginTop: 2 },
  section: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700", letterSpacing: -0.3, paddingHorizontal: 4, marginTop: 10 },
  list: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rank: { width: 18, textAlign: "center", color: colors.secondary, fontSize: 15, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" }, you: { color: colors.secondary, fontWeight: "500" },
  time: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  thin: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" }, thinFill: { height: 5, borderRadius: 3, backgroundColor: colors.accent },
  meta: { color: colors.secondary, fontSize: 13, minWidth: 40, textAlign: "right" },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  invite: { flexDirection: "row", gap: 10, marginTop: 6 },
  code: { ...edge, flex: 1, minHeight: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  codeLabel: { color: colors.secondary, fontSize: 12, lineHeight: 15 }, codeText: { color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: 2 },
  primary: { flex: 1, minHeight: 54, borderRadius: 27, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  hint: { color: colors.tertiary, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  popover: { ...edge, position: "absolute", right: 20, width: 236, borderRadius: 16, backgroundColor: colors.sheetCard, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  option: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  optionLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  optionText: { color: colors.text, fontSize: 16 },
});
