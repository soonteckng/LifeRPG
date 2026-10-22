import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { SQUAD_LIMITS } from "../utils/squads";

/**
 * How many squads this account may lead and be in. The server decides; most
 * people get the defaults, and a few accounts (the developer's) get more.
 * Until the server answers, or if it can't, the defaults apply.
 */
export type SquadLimits = { lead: number; member: number };
const defaults: SquadLimits = { lead: SQUAD_LIMITS.lead, member: SQUAD_LIMITS.member };
let known: { owner: string; limits: SquadLimits } | null = null;
let request: Promise<SquadLimits> | null = null;

const valid = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20;

export async function loadSquadLimits(owner: string): Promise<SquadLimits> {
  if (!owner) return defaults;
  if (known?.owner === owner) return known.limits;
  if (request) return request;
  request = (async () => {
    try {
      const { data, error } = await supabase.rpc("squad_limits_v1");
      const body = data as { lead?: unknown; member?: unknown } | null;
      if (error || !body || !valid(body.lead) || !valid(body.member)) return defaults;
      known = { owner, limits: { lead: body.lead, member: body.member } };
      return known.limits;
    } catch { return defaults; }
    finally { request = null; }
  })();
  return request;
}

export function useSquadLimits(owner: string, online: boolean): SquadLimits {
  const [limits, setLimits] = useState<SquadLimits>(() => known?.owner === owner ? known.limits : defaults);
  useEffect(() => {
    if (!online || !owner) return;
    let live = true;
    void loadSquadLimits(owner).then(next => { if (live) setLimits(next); });
    return () => { live = false; };
  }, [owner, online]);
  return known?.owner === owner ? known.limits : limits;
}
