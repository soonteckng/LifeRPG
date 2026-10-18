import { Platform, View } from "react-native";
import { useRouter } from "expo-router";
import { PersonalPage } from "../components/PersonalUI";
import FocusLengthControl from "../components/FocusLengthControl";
import { SettingsGroup, SettingsRow } from "../components/SettingsList";
import { useUser } from "../context/UserContext";
import { useFocusDurationPreference } from "../hooks/useFocusDurationPreference";
import { durationLabel } from "../utils/sessionSetup";

/** Settings › Sessions: the length new sessions start with, and app protection. */
export default function SessionSettingsScreen() {
  const router = useRouter(), { profile } = useUser();
  const duration = useFocusDurationPreference(profile.id);
  return <PersonalPage title="Sessions" subtitle="" back animateTransition fallback="/settings">
    <SettingsGroup title="Starting length" footer="Quick focus and Study start with this length. You can still change it for any one session.">
      <View style={{ padding: 14 }}>
        <FocusLengthControl showLabel={false} seconds={duration.selectedSeconds} customSeconds={duration.value.customSeconds} disabled={!duration.ready}
          onChange={seconds => void duration.choose(seconds)} onCustomSave={seconds => void duration.choose(seconds, true)} />
      </View>
      <SettingsRow icon="time-outline" title="Now" value={durationLabel(duration.selectedSeconds)} />
    </SettingsGroup>
    {Platform.OS === "android" && <SettingsGroup title="Protection" footer="Choose which apps stay available while a session runs.">
      <SettingsRow first icon="shield-checkmark-outline" title="Session protection" onPress={() => router.navigate("/protection")} />
    </SettingsGroup>}
  </PersonalPage>;
}
