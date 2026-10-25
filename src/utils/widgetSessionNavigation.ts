type WidgetRoute = { key: string; name: string };

/**
 * POP_TO keeps everything below Session. A consumed widget launcher retained
 * there would become a permanent spinner when Session closes. Only repair
 * that shape; preserve the live Session's key and all history below it.
 */
export function staleWidgetLauncherReset<State extends { key: string; index: number; routes: readonly WidgetRoute[] }>(state: State) {
  if (state.routes[state.index]?.name !== "routine-start") return null;
  const sessionIndex = state.routes.findIndex(route => route.name === "session");
  if (sessionIndex < 0 || !state.routes.slice(0, sessionIndex).some(route => route.name === "routine-start")) return null;
  const routes = state.routes.slice(0, sessionIndex + 1).filter(route => route.name !== "routine-start");
  return { type: "RESET" as const, target: state.key, payload: { ...state, routes, index: routes.length - 1 } };
}
