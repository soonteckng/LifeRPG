import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getSessionProtectionModule } from "./nativeFocusProtection";
import { readProtectionSelection } from "./sessionProtection";
/** No network mutations: protection readiness is checked before creating a session. */
export async function prepareProtectedSession(ownerKey: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const native = await getSessionProtectionModule();
  if (!native || native.formatVersion < 3) throw Error("Protected sessions need the updated Android build. Open protection settings for details.");
  const caps = await native.capabilities();
  if (!caps.supported || !caps.usage || !caps.overlay || !caps.notifications) throw Error("Set up session protection before starting. Allow Usage Access, Display over other apps and notifications.");
  const key = "liferpg:session-protection:choice:v2:" + ownerKey;
  const raw = await AsyncStorage.getItem(key);
  const choice = readProtectionSelection(raw ? JSON.parse(raw) : null);
  if (choice.mode === "normal") await AsyncStorage.setItem(key, JSON.stringify({ mode: "essentials", allowed: [] }));
  return true;
}
