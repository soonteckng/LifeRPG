import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export function useHomeLifecycle(refresh: () => Promise<void>) {
  const [hour, setHour] = useState(() => new Date().getHours());
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setHour(new Date().getHours());
    void refresh();
    return () => { focused.current = false; };
  }, [refresh]));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (focused.current) setHour(new Date().getHours());
      timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    };
    timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) {
        setHour(new Date().getHours());
        void refresh();
      }
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [refresh]);
  return hour;
}
