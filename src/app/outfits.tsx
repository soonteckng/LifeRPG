import { memo, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { REWARD_ITEMS, SETS, STREAK_FRAMES, rewardItem, setPieces, type RewardItem, type WearSlot } from "../services/rewardCatalog";
import { HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type AdventurerLook } from "../utils/adventurerLook";

type Tab = "look" | "clothes" | "gear" | "pets" | "picture";
type PicturePart = "frames" | "badges" | "background";
// Each tab is split into parts. In a clothes or gear part you wear one thing at a time.
const PARTS: Record<"clothes" | "gear", { slot: WearSlot; label: string }[]> = {
  clothes: [{ slot: "head", label: "Hats" }, { slot: "top", label: "Tops" }, { slot: "neck", label: "Neck" }, { slot: "back", label: "Cloaks" }, { slot: "shoes", label: "Shoes" }],
  gear: [{ slot: "bag", label: "Bags" }, { slot: "held", label: "In hand" }],
};
const PICTURE_PARTS: { value: PicturePart; label: string }[] = [{ value: "frames", label: "Frames" }, { value: "badges", label: "Badges" }, { value: "background", label: "Background" }];
const RARITY_COLOR: Record<string, string> = { common: "#C2C8D8", uncommon: "#2DD4A7", rare: "#60A5FA", epic: "#A78BFA", legendary: "#FBBF24" };
const RARITY_NAME: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const BG: Record<string, [string, string]> = {
  bg_dusk: ["#4A3366", "#B86A6A"], bg_forest: ["#24493F", "#3E6B4F"], bg_meadow: ["#6C9CC6", "#A8CC92"],
  bg_night: ["#141B3A", "#4A5AA0"], bg_library: ["#6B4A30", "#3A2416"], bg_sunset: ["#F59E6B", "#B4532A"],
};
interface Draft { look: AdventurerLook; equipped: Partial<Record<string, string>>; background: string; title: string | null }
// The frame samples have no outfit. A new `{}` on every tap defeats the
// portrait's memo and rebuilds every sample's SVG when only the preview changed.
const FRAME_EQUIPMENT = {};

/** Where Outfits opens to show one item: its tab and part, and what to put on. */
export function outfitsOpening(id: string | undefined) {
  const item = id ? rewardItem(id) : undefined;
  if (!item) return null;
  if (item.kind === "wearable" && item.slot && item.slot !== "face") {
    const tab = PARTS.clothes.some(p => p.slot === item.slot) ? "clothes" as const : "gear" as const;
    return { tab, slot: item.slot, item: item.id, wear: item };
  }
  if (item.kind === "pet") return { tab: "pets" as const, item: item.id, wear: item };
  if (item.kind === "background") return { tab: "picture" as const, part: "background" as const, item: item.id, wear: item };
  if (item.kind === "title") return { tab: "picture" as const, part: "badges" as const, item: item.id, wear: item };
  if (item.kind === "frame") return { tab: "picture" as const, part: "frames" as const, item: item.id, frame: item.id };
  return null;
}
function wearing(saved: Draft, item: RewardItem): Draft | null {
  if (item.kind === "background") return saved.background === item.id ? null : { ...saved, background: item.id };
  if (item.kind === "title") return saved.title === item.id ? null : { ...saved, title: item.id };
  if (!item.slot || saved.equipped[item.slot] === item.id) return null;
  return { ...saved, equipped: { ...saved.equipped, [item.slot]: item.id } };
}

/**
 * Camp › Outfits: your look, clothes, gear, pet and profile picture, saved to
 * your account. Frames aren't chosen: your picture always shows the highest
 * streak frame you've earned, so the Frames part only previews them.
 */
export default function OutfitsScreen() {
  const { profile } = useUser();
  const router = useRouter();
  const rewards = useRewards();
  const saved: Draft = useMemo(() => ({ look: rewards.look, equipped: rewards.equipped, background: rewards.background, title: rewards.title }),
    [rewards.look, rewards.equipped, rewards.background, rewards.title]);
  // Opened from a reward ("See it in Outfits"): start on its category, wearing it to try.
  const params = useLocalSearchParams<{ show?: string; from?: string }>();
  const [opening] = useState(() => outfitsOpening(typeof params.show === "string" ? params.show : undefined));
  // Until you change something, the page simply shows your saved look.
  const [edit, setEdit] = useState<Draft | null>(() => opening?.wear ? wearing(saved, opening.wear) : null);
  const draft = edit ?? saved;
  const [tab, setTab] = useState<Tab>(opening?.tab ?? "look");
  const [slot, setSlot] = useState<WearSlot>(opening?.slot ?? "head");
  const [picturePart, setPicturePart] = useState<PicturePart>(opening?.part ?? "frames");
  // A frame you tap is only shown here; your real frame follows your streak.
  const [framePreview, setFramePreview] = useState<string | null | undefined>(opening?.frame);
  const [selected, setSelected] = useState<string | null>(opening?.item ?? null);
  const [buying, setBuying] = useState<RewardItem | null>(null);
  const [message, setMessage] = useState("");
  // A shorter stage on smaller phones, so the choices below keep enough room.
  const { height: screenHeight } = useWindowDimensions();
  const STAGE_HEIGHT = screenHeight < 760 ? 210 : 240, roomy = STAGE_HEIGHT >= 240;
  const owned = useMemo(() => new Set(rewards.owned), [rewards.owned]);
  const dirty = !!edit && JSON.stringify(edit) !== JSON.stringify(saved);
  const change = (next: Partial<Draft>) => { setEdit(d => ({ ...(d ?? saved), ...next })); setMessage(""); };
  const setLook = (next: Partial<AdventurerLook>) => change({ look: { ...draft.look, ...next } });
  const has = (item: RewardItem) => !!item.free || owned.has(item.id);

  // Anything can be tried on to preview it; only what you own can be saved.
  const tapItem = (item: RewardItem) => {
    setSelected(item.id); setMessage("");
    if (item.kind === "background") return change({ background: item.id });
    if (item.kind === "title") return change({ title: draft.title === item.id ? null : item.id });
    const slot = item.slot!;
    const equipped = { ...draft.equipped };
    if (equipped[slot] === item.id) delete equipped[slot]; else equipped[slot] = item.id;
    change({ equipped });
  };
  const tryingOn = [...Object.values(draft.equipped), draft.title, draft.background]
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

  const worn = (item: RewardItem) => item.kind === "background" ? draft.background === item.id
    : item.kind === "title" ? draft.title === item.id : draft.equipped[item.slot!] === item.id;
  const parts = tab === "clothes" || tab === "gear" ? PARTS[tab] : null;
  const list = parts ? REWARD_ITEMS.filter(i => i.kind === "wearable" && i.slot === slot && !i.free)
    : tab === "pets" ? REWARD_ITEMS.filter(i => i.kind === "pet")
    : tab === "picture" && picturePart === "badges" ? REWARD_ITEMS.filter(i => i.kind === "title")
    : tab === "picture" && picturePart === "background" ? REWARD_ITEMS.filter(i => i.kind === "background") : [];
  const earned = new Set(rewards.earned);
  const streak = profile.streak_count ?? 0;
  const shownFrame = framePreview === undefined ? rewards.frame : framePreview;
  const openTab = (next: Tab) => {
    setTab(next); setSelected(null); setFramePreview(undefined);
    if (next === "clothes" || next === "gear") setSlot(PARTS[next][0].slot);
  };
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
  // The character and the tabs stay in view while the choices scroll under them.
  const pinned = <>
      <OutfitsPreview height={STAGE_HEIGHT} roomy={roomy} a={a} b={b} stardust={rewards.stardust}
        setName={setInfo?.name} setHave={setInfo?.have} setTotal={setInfo?.of}
        previewingFrame={framePreview !== undefined && framePreview !== rewards.frame}
        picture={tab === "picture"} look={draft.look} equipped={draft.equipped} level={profile.level}
        background={draft.background} frame={shownFrame} streak={streak} title={draft.title} />

      <Segmented<Tab> value={tab} onChange={openTab} track={colors.surface}
        options={[{ value: "look", label: "Look" }, { value: "clothes", label: "Clothes" }, { value: "gear", label: "Gear" }, { value: "pets", label: "Pets" }, { value: "picture", label: "Picture" }]} />
  </>;
  const fromHome = params.from === "home";
  return <PersonalPage title="Outfits" subtitle="" compact back animateTransition expandFromIcon={fromHome} fallback={fromHome ? "/" : "/profile"} footer={footer} pinned={pinned}>
    <View style={s.stack}>
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
      </View> : <>
      {parts && <View style={s.parts} accessibilityRole="radiogroup">{parts.map(part => <Pill key={part.slot} label={part.label} on={slot === part.slot}
        dot={!!draft.equipped[part.slot]} onPress={() => { setSlot(part.slot); setSelected(null); }} />)}</View>}
      {tab === "picture" && <View style={s.parts} accessibilityRole="radiogroup">{PICTURE_PARTS.map(part => <Pill key={part.value} label={part.label} on={picturePart === part.value}
        onPress={() => { setPicturePart(part.value); setSelected(null); setFramePreview(undefined); }} />)}</View>}
      {tab === "picture" && picturePart === "frames" ? <View style={s.frames}>
        {[{ id: null, days: 0 }, ...STREAK_FRAMES].map(f => {
          const showing = (rewards.frame ?? null) === f.id, got = f.id === null || earned.has(f.id), looking = shownFrame === f.id;
          const name = f.id === null ? "Level frame" : `${f.days} days in a row`;
          const status = showing ? "Showing" : got ? "Earned" : `${f.days - Math.min(streak, f.days)} days to go`;
          return <FrameRow key={f.id ?? "level"} id={f.id} name={name} status={status} looking={looking}
            showing={showing} got={got} select={setFramePreview} look={draft.look} level={profile.level} background={draft.background} />;
        })}
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
      </>}

      {/* Only a locked piece needs a word: how to get it. */}
      {focus && !has(focus) && focus.kind !== "frame" && <View style={s.card} accessibilityLiveRegion="polite">
        <Text style={p.rowTitle}>{focus.name}</Text>
        <Text style={p.caption}>{RARITY_NAME[focus.rarity]}{focus.set ? ` · ${SETS[focus.set].name} set` : ""}. {focus.hint}.</Text>
        {!!focus.price && rewards.online && <PersonalButton title={`Get it for ${focus.price} Stardust`} secondary onPress={() => setBuying(focus)} />}
      </View>}

      {!!message && <Text style={message.endsWith("is yours.") ? s.ok : p.error} accessibilityRole="alert">{message}</Text>}
    </View>
    {buying && <SheetConfirmation elevated title={`Get ${buying.name}?`} message={`It costs ${buying.price} Stardust. You have ${rewards.stardust}.`}
      confirmLabel={rewards.stardust >= (buying.price ?? 0) ? `Buy for ${buying.price}` : "Not enough Stardust"} cancelLabel="Not now"
      onCancel={() => setBuying(null)} onConfirm={() => { if (rewards.stardust >= (buying.price ?? 0)) void buy(); else setBuying(null); }} />}
  </PersonalPage>;
}

// Tab selections and fetch/busy messages do not change the illustration. Keep
// those commits away from the SVG tree and its breathing/blink animations.
const OutfitsPreview = memo(function OutfitsPreview({ height, roomy, a, b, stardust, setName, setHave, setTotal,
  previewingFrame, picture, look, equipped, level, background, frame, streak, title }: {
  height: number; roomy: boolean; a: string; b: string; stardust: number; setName?: string; setHave?: number; setTotal?: number;
  previewingFrame: boolean; picture: boolean; look: AdventurerLook; equipped: Draft["equipped"]; level: number;
  background: string; frame: string | null; streak: number; title: string | null;
}) {
  const [stageWidth, setStageWidth] = useState(350);
  return <View style={[s.stage, { height }]} testID="outfits-preview" onLayout={e => setStageWidth(e.nativeEvent.layout.width)}>
    {/* The stage is your chosen picture background, top to bottom. */}
    <Svg width={stageWidth} height={height} style={s.stageArt}>
      <Defs><LinearGradient id="stage-bg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient></Defs>
      <Rect x={0} y={0} width={stageWidth} height={height} fill="url(#stage-bg)" />
      <Ellipse cx={stageWidth / 2} cy={height - 14} rx={70} ry={10} fill="#000000" opacity={0.18} />
    </Svg>
    <View style={s.chips}>
      <View style={s.chip} accessible accessibilityLabel={`${stardust} Stardust`}><StardustArt size={14} /><Text style={s.chipText}>{stardust}</Text></View>
      {setName && <View style={s.chip}><Text style={s.chipText}>{setName} set · {setHave} of {setTotal}</Text></View>}
      {previewingFrame && <View style={s.chip}><Text style={s.chipText}>Preview</Text></View>}
    </View>
    {picture
      ? <View style={s.picture}><ProfilePicture look={look} equipped={equipped} level={level} background={background} frame={frame} streak={streak} size={roomy ? 164 : 146} />
        {!!title && <View style={s.titleChip}><Text style={s.titleText}>{rewardItem(title)?.name}</Text></View>}</View>
      : <Adventurer look={look} equipped={equipped} size={roomy ? 132 : 122} lanternLevel={level} />}
  </View>;
});

const FrameRow = memo(function FrameRow({ id, name, status, looking, showing, got, select, look, level, background }: {
  id: string | null; name: string; status: string; looking: boolean; showing: boolean; got: boolean;
  select: (frame: string | null) => void; look: AdventurerLook; level: number; background: string;
}) {
  return <Pressable onPress={() => select(id)} accessibilityRole="button" accessibilityLabel={`${name}, ${status}`}
    accessibilityState={{ selected: looking }} style={[s.frameRow, looking && s.tileFocus]}>
    <ProfilePicture look={look} equipped={FRAME_EQUIPMENT} level={level} background={background} frame={id} size={52} />
    <Text style={[s.frameName, !got && { color: colors.muted }]} numberOfLines={1}>{name}</Text>
    {showing ? <View style={s.showing}><Text style={s.showingText}>{status}</Text></View>
      : got ? <Ionicons name="checkmark-circle" size={20} color={colors.progress} />
      : <Text style={s.toGo}>{status}</Text>}
  </Pressable>;
});

function Pill({ label, on, onPress, dot = false }: { label: string; on: boolean; onPress: () => void; dot?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: on }} style={[s.pill, on && s.pillOn]}>
    <Text style={[s.pillText, on && s.pillTextOn]}>{label}</Text>
    {dot && <View style={[s.dot, on && { backgroundColor: colors.background }]} />}
  </Pressable>;
}

const s = StyleSheet.create({
  stack: { gap: 16 },
  stage: { ...edge, borderRadius: radius.card, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 },
  stageArt: { position: "absolute", left: 0, top: 0 },
  picture: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 12 },
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
  pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  pillOn: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: { color: colors.neutral, fontSize: 14, fontWeight: "600" }, pillTextOn: { color: colors.background },
  parts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.progress },
  frames: { gap: 8 },
  frameRow: { ...edge, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.row, backgroundColor: colors.surface },
  frameName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "700" },
  showing: { paddingHorizontal: 10, minHeight: 26, borderRadius: 13, justifyContent: "center", backgroundColor: "rgba(45,212,167,0.16)" },
  showingText: { color: colors.progress, fontSize: 12, fontWeight: "800" },
  toGo: { color: colors.tertiary, fontSize: 13, fontWeight: "600" },
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
