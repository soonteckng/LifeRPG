import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Text } from "./AppText";
import { p } from "./PersonalUI";

/** Local identity only. It never checks for updates or reads account data. */
export default function AppBuildInfo() {
  const version = Constants.expoConfig?.version ?? "1.1.0";
  const release = Updates.runtimeVersion?.slice(0, 8);
  const update = Updates.isEmbeddedLaunch ? "Included update" : Updates.updateId ? `Update ${Updates.updateId.slice(0, 8)}` : "Development";
  return <Text style={p.caption} selectable accessibilityLabel="App version and update">
    {`Version ${version}${release ? ` · release ${release}` : ""}\n${update}${Updates.isEmergencyLaunch ? " · recovery launch" : ""}`}
  </Text>;
}
