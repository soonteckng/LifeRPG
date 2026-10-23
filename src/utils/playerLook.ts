import { rewardItem } from "../services/rewardCatalog";
import type { PlayerLook } from "../types/squads";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A look from the server, kept only if it makes sense; items the app doesn't know are dropped. */
export function parsePlayerLook(value: unknown): PlayerLook | null {
  if (!isObj(value) || !isObj(value.look)) return null;
  const equipped = isObj(value.equipped) ? Object.fromEntries(Object.entries(value.equipped).filter(([slot, id]) => typeof id === "string" && rewardItem(id)?.slot === slot)) as Record<string, string> : {};
  const known = (id: unknown, kind: string) => typeof id === "string" && rewardItem(id)?.kind === kind ? id : null;
  return {
    look: value.look,
    equipped,
    background: known(value.background, "background") ?? "bg_dusk",
    frame: known(value.frame, "frame"),
    title: known(value.title, "title"),
  };
}

