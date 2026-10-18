import { useSyncExternalStore } from "react";
import { setupMode, type SetupMode } from "../services/setupMode";

/** Which kind of session is being set up: a routine or study. Each tab sets it before opening the session. */
export function useSetupMode(): SetupMode {
  return useSyncExternalStore(setupMode.subscribe, setupMode.get, setupMode.get);
}
