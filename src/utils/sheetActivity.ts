import { useSyncExternalStore } from "react";

const sheets = new Set<symbol>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
export function registerSheetActivity(id: symbol): () => void {
  sheets.add(id); notify();
  return () => { if (sheets.delete(id)) notify(); };
}
export function activeSheetCount(except?: symbol): number {
  return sheets.size - (except && sheets.has(except) ? 1 : 0);
}
export function useActiveSheetCount(except?: symbol): number {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    () => activeSheetCount(except), () => 0);
}
