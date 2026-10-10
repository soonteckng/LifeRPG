export interface SessionBackendIdentity { backendId: string; baseUrl: string; authStorageKey: string }

/** Scope IDs are journal-safe; issuer checks retain the separate exact base URL. */
export function sessionBackendIdentity(url: string | undefined): SessionBackendIdentity | null {
  try {
    const parsed = new URL(url ?? "");
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    const baseUrl = `${parsed.origin}${path}`;
    // Root HTTPS deployments use their host. Other URLs include the complete
    // identity in hex, avoiding path, protocol, port and IPv6 collisions.
    let backendId = parsed.hostname;
    if (parsed.protocol !== "https:" || parsed.port || path || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(backendId)) {
      backendId = `url_${Array.from(baseUrl, character => character.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`;
    }
    if (backendId.length > 128 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(backendId)) return null;
    return { backendId, baseUrl, authStorageKey: `sb-${parsed.hostname.split(".")[0]}-auth-token` };
  } catch { return null; }
}
