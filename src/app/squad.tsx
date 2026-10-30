import { useCallback, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import MoreMenu from "../components/MoreMenu";
import { PinnedActionHost, PinnedActionProvider, PinnedRoute } from "../components/PinnedAction";
import SlideUpPage from "../components/SlideUpPage";
import { useSquadDetail } from "../components/SquadDetail";
import { useSquads } from "../hooks/useSquads";
import { squadSelection } from "../services/squadSelection";

/**
 * One squad, in full: its week together, its members and the invite. It
 * rises from the bottom over Squads or Home, and slides down to close.
 */
export default function SquadScreen() {
  // The invite pins to the bottom of this page, however long the board is.
  return <PinnedActionProvider><PinnedRoute name="squad"><SquadPage /></PinnedRoute></PinnedActionProvider>;
}
function SquadPage() {
  const squads = useSquads();
  const chosen = useSyncExternalStore(squadSelection.subscribe, squadSelection.get, squadSelection.get);
  const refresh = squads.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  // The page stays on the squad it opened with, even if the selection changes underneath.
  const [shownId, setShownId] = useState<string | null>(chosen);
  const squad = squads.squads.find(item => item.id === shownId) ?? (shownId ? null : squads.squads[0] ?? null);
  if (squad && squad.id !== shownId) setShownId(squad.id);
  // Leaving this squad (or being removed from it) leaves nothing to show: slide away.
  const gone = squads.ready && !squad;
  const detail = useSquadDetail(squad, squads);
  return <View style={s.screen}>
    <SlideUpPage title="My Squad" fallback="/squads" gone={gone} footer={squad ? <PinnedActionHost /> : undefined}
      action={squads.online && squad ? <MoreMenu options={detail.options} label="Squad options" size={36} testID="squad-options" /> : undefined}>
      {detail.board}
    </SlideUpPage>
    {detail.sheets}
  </View>;
}
const s = StyleSheet.create({
  screen: { flex: 1 },
});
