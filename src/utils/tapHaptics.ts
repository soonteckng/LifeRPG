// One light tick per tap, everywhere. Pressables call it after their handler,
// so a handler that asks for a stronger tick (or none) in the same tap wins.
// The native module loads on first use, keeping app start and tests light.
let enabled = true, pending = false;
let haptics: Promise<typeof import("expo-haptics")> | null = null;
export function setTapHapticsEnabled(value: boolean) { enabled = value; }
export function tapHapticsEnabled() { return enabled; }
export function tapHaptic(style: "selection" | "light" | "medium" | "success" = "selection") {
  if (pending) return;
  pending = true;
  queueMicrotask(() => { pending = false; });
  haptics ??= import("expo-haptics");
  void haptics.then(api => style === "selection" ? api.selectionAsync()
    : style === "success" ? api.notificationAsync(api.NotificationFeedbackType.Success)
    : api.impactAsync(style === "medium" ? api.ImpactFeedbackStyle.Medium : api.ImpactFeedbackStyle.Light)).catch(() => { haptics = null; });
}
