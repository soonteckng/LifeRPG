import { InteractionManager } from "react-native";
// Keep data reads and their React updates off the entrance animation's path.
export function afterTransition(work: () => void): () => void {
  let cancelled = false;
  if (InteractionManager?.runAfterInteractions) {
    const task = InteractionManager.runAfterInteractions(() => { if (!cancelled) work(); });
    return () => { cancelled = true; task.cancel(); };
  }
  void Promise.resolve().then(() => { if (!cancelled) work(); });
  return () => { cancelled = true; };
}
