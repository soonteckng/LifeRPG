import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "../AppSheet";
import SheetHeader from "../SheetHeader";
import Pressable from "../MotionPressable";
import { Text } from "../AppText";
import ItemArt from "../adventurer/ItemArt";
import { colors, edge, radius } from "../../constants/theme";
import { REWARD_ITEMS } from "../../services/rewardCatalog";
import { RARITY_COLOR, RARITY_NAME } from "./rarity";

const DECORATIONS = REWARD_ITEMS.filter(item => item.kind === "decor");

interface Props {
  visible: boolean;
  onClose: () => void;
  owned: readonly string[];
  ready: boolean;
  loading: boolean;
  error: string | null;
  online: boolean;
  onRetry: () => void;
  checking: boolean;
  retryDisabled: boolean;
}

/** Existing inventory only. Camp keepsakes have no outfit or purchase action. */
export default function RewardCollectionSheet(props: Props) {
  const insets = useSafeAreaInsets();
  // Let AppSheet retain its real content until dismissal finishes. Its native
  // shell never mounts the art while closed, and reopening keeps one animation.
  return <AppSheet visible={props.visible} onRequestClose={props.onClose} expanded motionMode="timed" label="collection"
    header={<SheetHeader title="Collection" subtitle="Camp keepsakes, yours to keep." />}
    footer={<View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      <Pressable testID="collection-done" onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close collection" style={s.done}>
        <Text style={s.doneText}>Done</Text>
      </Pressable>
    </View>}>
    <CollectionContents {...props} />
  </AppSheet>;
}

function CollectionContents({ owned, ready, loading, error, online, onRetry, checking, retryDisabled }: Props) {
  const { width, fontScale = 1 } = useWindowDimensions();
  const oneColumn = width < 380 || fontScale > 1.2;
  const ids = new Set(owned);
  // The catalogue defines order and uniqueness. Unknown ids and wearables
  // cannot turn into imaginary decorations or inflate the owned count.
  const collected = ready ? DECORATIONS.filter(item => ids.has(item.id)) : [];
  const needsStatus = !ready || !!error || !online;
  const status = !ready
    ? loading || checking ? "Loading your collection…" : online ? "Your collection is unavailable right now." : "Connect to load your collection."
    : !online ? "Showing the collection saved on this phone." : "Showing your saved collection. Try again to check for new finds.";
  return <BottomSheetScrollView testID="collection-scroll" enableFooterMarginAdjustment showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
    {needsStatus && <View style={s.status} testID="collection-status">
      <Text accessibilityLiveRegion="polite" style={s.note}>{status}</Text>
      {online && (!ready || !!error) && <Pressable testID="collection-retry" onPress={onRetry} disabled={retryDisabled || loading || checking}
        accessibilityRole="button" accessibilityLabel="Retry loading your collection" accessibilityState={{ disabled: retryDisabled || loading || checking, busy: checking || loading }} style={s.retry}>
        <Text style={[s.retryText, (retryDisabled || loading || checking) && s.disabled]}>{checking || loading ? "Checking…" : "Try again"}</Text>
      </Pressable>}
    </View>}
    {ready && <>
      <View style={s.heading} testID="collection-count" accessible accessibilityLabel={`${collected.length} of ${DECORATIONS.length} camp decorations owned`}>
        <Text style={s.sectionTitle} accessibilityRole="header">Camp decorations</Text>
        <Text style={s.note}>{`${collected.length} of ${DECORATIONS.length} collected`}</Text>
      </View>
      {collected.length === 0 ? <View style={s.empty} testID="collection-empty">
        <Text style={s.emptyTitle}>Your first keepsake is ahead</Text>
        <Text style={s.note}>Decorations from your finds and supply packs will appear here.</Text>
      </View> : <View style={s.grid} testID="collection-grid">
        {collected.map(item => <View key={item.id} testID={`collection-item-${item.id}`} accessible accessibilityLabel={`${item.name}, ${RARITY_NAME[item.rarity]}, owned`}
          style={[s.tile, oneColumn ? s.fullTile : s.halfTile]}>
          <View style={[s.art, { backgroundColor: `${RARITY_COLOR[item.rarity]}14` }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <ItemArt id={item.id} size={64} />
          </View>
          <View style={s.copy}>
            <Text style={s.itemName}>{item.name}</Text>
            <Text style={[s.rarity, { color: RARITY_COLOR[item.rarity] }]}>{RARITY_NAME[item.rarity]}</Text>
            <Text style={s.owned}>Owned</Text>
          </View>
        </View>)}
      </View>}
    </>}
  </BottomSheetScrollView>;
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 16 },
  heading: { gap: 4 },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  note: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  status: { ...edge, borderRadius: radius.row, padding: 16, gap: 8, backgroundColor: colors.sheetCard },
  retry: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  retryText: { color: colors.neutral, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  disabled: { opacity: 0.55 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { ...edge, borderRadius: radius.tile, backgroundColor: colors.sheetCard, padding: 16, gap: 12 },
  halfTile: { width: "48%" },
  fullTile: { width: "100%", flexDirection: "row", alignItems: "center" },
  art: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  copy: { flexShrink: 1, minWidth: 0, gap: 4 },
  itemName: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "700" },
  rarity: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  owned: { color: colors.success, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  empty: { ...edge, borderRadius: radius.tile, padding: 20, gap: 8, backgroundColor: colors.sheetCard },
  emptyTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "600" },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surfaceRaised },
  done: { minHeight: 56, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  doneText: { color: colors.primaryText, fontSize: 17, lineHeight: 23, fontWeight: "600" },
});
