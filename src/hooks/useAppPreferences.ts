import { useEffect, useSyncExternalStore } from "react";
import { appPreferences } from "../services/appPreferences";

export function useAppPreferences() {
  const value = useSyncExternalStore(appPreferences.subscribe, appPreferences.get, appPreferences.get);
  useEffect(() => { void appPreferences.load(); }, []);
  return value;
}
