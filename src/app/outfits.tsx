import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Pressable from "../components/MotionPressable";
import { Text } from "../components/AppText";
import { PersonalButton, PersonalPage, p } from "../components/PersonalUI";
import Segmented from "../components/Segmented";
import SheetConfirmation from "../components/SheetConfirmation";
import Adventurer from "../components/adventurer/Adventurer";
import ItemArt, { StardustArt } from "../components/adventurer/ItemArt";
import ProfilePicture from "../components/adventurer/ProfilePicture";
import Svg, { Defs, Ellipse, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors, edge, radius } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useRewards } from "../hooks/useRewards";
import { REWARD_ITEMS, SETS, rewardItem, setPieces, type RewardItem, type WearSlot } from "../services/rewardCatalog";
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type AdventurerLook } from "../utils/adventurerLook";

type Tab = "look" | "clothes" | "gear" | "pets" | "picture";
const CLOTHES: WearSlot[] = ["head", "top", "neck", "back", "shoes"], GEAR: WearSlot[] = ["bag", "held"];
const RARITY_COLOR: Record<string, string> = { common: "#C2C8D8", uncommon: "#2DD4A7", rare: "#60A5FA", epic: "#A78BFA", legendary: "#FBBF24" };
const RARITY_NAME: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const BG: Record<string, [string, string]> = {
  bg_dusk: ["#4A3366", "#B86A6A"], bg_forest: ["#24493F", "#3E6B4F"], bg_meadow: ["#6C9CC6", "#A8CC92"],
  bg_night: ["#141B3A", "#4A5AA0"], bg_library: ["#6B4A30", "#3A2416"], bg_sunset: ["#F59E6B", "#B4532A"],
};
const STAGE_HEIGHT = 240;
interface Draft { look: AdventurerLook; equipped: Partial<Record<string, string>>; background: string; frame: string | null; title: string | null }

/** Camp › Outfits: your look, clothes, gear, pet and profile picture, saved to your account. */
export default function OutfitsScreen() {
  const { profile } = useUser();
  const router = useRouter();
  const rewards = useRewards();
  const saved: Draft = useMemo(() => ({ look: rewards.look, equipped: rewards.equipped, background: rewards.background, frame: rewards.frame, title: rewards.title }),
    [rewards.look, rewards.equipped, rewards.background, rewards.frame, rewards.title]);
  // Until you change something, the page simply shows your saved look.
  const [edit, setEdit] = useState<Draft | null>(null);
  const draft = edit ?? saved;
  const [tab, setTab] = useState<Tab>("look");
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState<RewardItem | null>(null);
  const [message, setMessage] = useState("");
  const [stageWidth, setStageWidth] = useState(350);
  const owned = useMemo(() => new Set(rewards.owned), [rewards.owned]);
  const dirty = !!edit && JSON.stringify(edit) !== JSON.stringify(saved);
  const change = (next: Partial<Draft>) => { setEdit(d => ({ ...(d ?? saved), ...next })); setMessage(""); };
  const setLook = (next: Partial<AdventurerLook>) => change({ look: { ...draft.look, ...next } });
  const has = (item: RewardItem) => !!item.free || owned.has(item.id);

  // Anything can be tried on to preview it; only what you own can be saved.
  const tapItem = (item: RewardItem) => {
    setSelected(item.id); setMessage("");
    if (item.kind === "background") return change({ background: item.id });
    if (item.kind === "frame") return change({ frame: draft.frame === item.id ? null : item.id });
    if (item.kind === "title") return change({ title: draft.title === item.id ? null : item.id });
    const slot = item.slot!;
    const equipped = { ...draft.equipped };
    if (equipped[slot] === item.id) delete equipped[slot]; else equipped[slot] = item.id;
    change({ equipped });
  };
  const tryingOn = [...Object.values(draft.equipped), draft.frame, draft.title, draft.background]
    .map(id => id ? rewardItem(id) : undefined).filter((item): item is RewardItem => !!item && !has(item));
  const save = async () => {
    if (tryingOn.length) return;
    const result = await rewards.saveAvatar(draft);
    // Saved: back to Profile, which already shows the new look.
    if (result.ok) { setEdit(null); router.back(); } else setMessage(result.message);
  };
  const buy = async () => {
    const item = buying; setBuying(null);
    if (!item) return;
    const result = await rewards.buy(item.id);
    setMessage(result.ok ? `${item.name} is yours.` : result.message);
  };

  const worn = (item: RewardItem) => item.kind === "background" ? draft.background === item.id : item.kind === "frame" ? draft.frame === item.id
    : item.kind === "title" ? draft.title === item.id : draft.equipped[item.slot!] === item.id;
  const list = tab === "clothes" ? REWARD_ITEMS.filter(i => i.kind === "wearable" && CLOTHES.includes(i.slot!) && !i.free)
    : tab === "gear" ? REWARD_ITEMS.filter(i => i.kind === "wearable" && GEAR.includes(i.slot!))
    : tab === "pets" ? REWARD_ITEMS.filter(i => i.kind === "pet")
    : tab === "picture" ? REWARD_ITEMS.filter(i => i.kind === "background" || i.kind === "frame" || i.kind === "title") : [];
  const focus = selected ? rewardItem(selected) : null;
  const topSet = draft.equipped.top ? rewardItem(draft.equipped.top)?.set : undefined;
  const setInfo = topSet ? { name: SETS[topSet].name, have: setPieces(topSet).filter(has).length, of: setPieces(topSet).length } : null;
  const [a, b] = BG[draft.background] ?? BG.bg_dusk;

  const footer = <View style={s.footer}>
    {tryingOn.length > 0 ? <Text style={s.preview} accessibilityLiveRegion="polite">{`Trying on ${tryingOn.map(i => i.name).join(", ")}. Take ${tryingOn.length > 1 ? "them" : "it"} off or get ${tryingOn.length > 1 ? "them" : "it"} to save.`}</Text>
      : !rewards.online ? <Text style={p.caption}>Needs internet to save or buy.</Text> : null}
    <View style={s.actions}>
      <View style={{ flex: 1 }}><PersonalButton title="Reset" secondary disabled={!dirty || rewards.busy} onPress={() => { setEdit(null); setMessage(""); }} /></View>
      <View style={{ flex: 1.4 }}><PersonalButton title={rewards.busy ? "Saving…" : "Save look"} disabled={!dirty || rewards.busy || !rewards.online || tryingOn.length > 0} onPress={() => void save()} /></View>
    </View>
  </View>;
  return <PersonalPage title="Outfits" subtitle="" compact back animateTransition fallback="/profile" footer={footer}>
    <View style={s.stack}>
      <View style={s.stage} testID="outfits-preview" onLayout={e => setStageWidth(e.nativeEvent.layout.width)}>
        {/* The stage is your chosen picture background, top to bottom. */}
        <Svg width={stageWidth} height={STAGE_HEIGHT} style={s.stageArt}>
          <Defs><LinearGradient id="stage-bg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={stageWidth} height={STAGE_HEIGHT} fill="url(#stage-bg)" />
          <Ellipse cx={stageWidth / 2} cy={STAGE_HEIGHT - 14} rx={70} ry={10} fill="#000000" opacity={0.18} />
        </Svg>
        <View style={s.chips}>
          <View style={s.chip} accessible accessibilityLabel={`${rewards.stardust} Stardust`}><StardustArt size={14} /><Text style={s.chipText}>{rewards.stardust}</Text></View>
          {setInfo && <View style={s.chip}><Text style={s.chipText}>{setInfo.name} set · {setInfo.have} of {setInfo.of}</Text></View>}
        </View>
        {tab === "picture"
          ? <View style={s.picture}><ProfilePicture look={draft.look} equipped={draft.equipped} level={profile.level} background={draft.background} frame={draft.frame} streak={profile.streak_count ?? 0} size={150} />
            {!!draft.title && <View style={s.titleChip}><Text style={s.titleText}>{rewardItem(draft.title)?.name}</Text></View>}</View>
          : <Adventurer look={draft.look} equipped={draft.equipped} size={132} lanternLevel={profile.level} />}
      </View>

      <Segmented<Tab> value={tab} onChange={next => { setTab(next); setSelected(null); }} track={colors.surface}
        options={[{ value: "look", label: "Look" }, { value: "clothes", label: "Clothes" }, { value: "gear", label: "Gear" }, { value: "pets", label: "Pets" }, { value: "picture", label: "Picture" }]} />

      {tab === "look" ? <View style={s.card}>
        <Text style={p.rowTitle}>Skin</Text>
        <View style={s.swatches}>{SKIN_TONES.map((tone, i) => {
          const on = draft.look.skin === String(i + 1);
          return <Pressable key={tone} onPress={() => setLook({ skin: String(i + 1) })} accessibilityRole="radio" accessibilityLabel={`Skin tone ${i + 1}`} accessibilityState={{ checked: on }}
            style={[s.swatch, { backgroundColor: tone }, on && s.swatchOn]} />;
        })}</View>
        <Text style={p.rowTitle}>Hair</Text>
        <View style={s.pills}>{HAIR_STYLES.map(h => <Pill key={h.id} label={h.name} on={draft.look.hair === h.id} onPress={() => setLook({ hair: h.id })} />)}</View>
        <Text style={p.rowTitle}>Hair colour</Text>
        <View style={s.swatches}>{HAIR_COLORS.map(h => {
          const on = draft.look.hairColor === h.id;
          return <Pressable key={h.id} onPress={() => setLook({ hairColor: h.id })} accessibilityRole="radio" accessibilityLabel={h.name} accessibilityState={{ checked: on }}
            style={[s.swatch, { backgroundColor: h.color }, on && s.swatchOn]} />;
        })}</View>
        <View style={s.pills}><Pill label={draft.look.glasses ? "Glasses on" : "Glasses off"} on={draft.look.glasses} onPress={() => setLook({ glasses: !draft.look.glasses })} /></View>
        <Text style={p.caption}>Everything here is free for everyone.</Text>
      </View> : <View style={s.grid}>{list.map(item => {
        const mine = has(item), on = worn(item);
        return <Pressable key={item.id} onPress={() => tapItem(item)} accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${RARITY_NAME[item.rarity]}${on ? ", wearing" : mine ? ", owned" : ", not found yet"}`}
          style={[s.tile, on && s.tileOn, selected === item.id && s.tileFocus]}>
          <View style={[s.rarity, { backgroundColor: RARITY_COLOR[item.rarity] }]} />
          {on && <Ionicons name="checkmark-circle" size={18} color={colors.progress} style={s.corner} />}
          {!mine && <Ionicons name="lock-closed" size={14} color={colors.tertiary} style={s.corner} />}
          <ItemArt id={item.id} size={46} locked={!mine} />
          <Text style={[s.tileText, !mine && { color: colors.muted }]} numberOfLines={2}>{item.name}</Text>
        </Pressable>;
      })}</View>}

      {tab !== "look" && <View style={s.card} accessibilityLiveRegion="polite">
        {focus ? <>
          <Text style={p.rowTitle}>{focus.name}</Text>
          <Text style={p.caption}>{RARITY_NAME[focus.rarity]}{focus.set ? ` · ${SETS[focus.set].name} set` : ""}. {has(focus) ? "Tap again to take it off." : `Previewing. ${focus.hint}.`}</Text>
          {!has(focus) && !!focus.price && rewards.online && <PersonalButton title={`Get it for ${focus.price} Stardust`} secondary onPress={() => setBuying(focus)} />}
        </> : <Text style={p.caption}>{tab === "picture" ? "Your frame grows with your level on its own. Streak frames, titles and backgrounds you earn show here." : "Tap something you own to wear it. Locked items say how to get them."}</Text>}
      </View>}

      {!!message && <Text style={message.endsWith("is yours.") ? s.ok : p.error} accessibilityRole="alert">{message}</Text>}
    </View>
    {buying && <SheetConfirmation elevated title={`Get ${buying.name}?`} message={`It costs ${buying.price} Stardust. You have ${rewards.stardust}.`}
      confirmLabel={rewards.stardust >= (buying.price ?? 0) ? `Buy for ${buying.price}` : "Not enough Stardust"} cancelLabel="Not now"
      onCancel={() => setBuying(null)} onConfirm={() => { if (rewards.stardust >= (buying.price ?? 0)) void buy(); else setBuying(null); }} />}
  </PersonalPage>;
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: on }} style={[s.pill, on && s.pillOn]}>
    <Text style={[s.pillText, on && s.pillTextOn]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  stack: { gap: 16 },
  stage: { ...edge, height: 240, borderRadius: radius.card, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 },
  stageArt: { position: "absolute", left: 0, top: 0 },
  picture: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 20 },
  titleChip: { paddingHorizontal: 12, minHeight: 28, borderRadius: 14, justifyContent: "center", backgroundColor: "rgba(9,12,20,0.55)" },
  titleText: { color: "#C4B5FD", fontSize: 13, fontWeight: "700" },
  chips: { position: "absolute", left: 12, top: 12, gap: 6 },
  chip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, minHeight: 28, borderRadius: 14, backgroundColor: "rgba(9,12,20,0.55)" },
  chipText: { color: colors.neutral, fontSize: 13, fontWeight: "700" },
  card: { ...edge, gap: 10, padding: 14, borderRadius: radius.tile, backgroundColor: colors.surface },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: "transparent" },
  swatchOn: { borderColor: colors.text },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  pillOn: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: { color: colors.neutral, fontSize: 14, fontWeight: "600" }, pillTextOn: { color: colors.background },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // Three square tiles a row, big enough for the art and a two-line name.
  tile: { ...edge, width: "31.5%", aspectRatio: 1, borderRadius: radius.row, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 6, backgroundColor: colors.surface },
  tileOn: { backgroundColor: "rgba(45,212,167,0.10)", borderColor: "rgba(45,212,167,0.6)" },
  tileFocus: { borderColor: colors.text },
  tileText: { color: colors.neutral, fontSize: 12, lineHeight: 15, fontWeight: "600", textAlign: "center", maxWidth: "100%" },
  rarity: { position: "absolute", left: 8, top: 8, width: 7, height: 7, borderRadius: 4 },
  corner: { position: "absolute", right: 6, top: 6 },
  ok: { color: colors.progress, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 10 },
  footer: { gap: 8 },
  preview: { color: colors.level, fontSize: 13, lineHeight: 18 },
});
