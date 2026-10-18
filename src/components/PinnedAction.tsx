import { createContext, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

// Lets a screen's primary button render in a pinned slot (above the tab bar,
// or at the bottom of a page) without moving its handlers or state. The
// button keeps living inside its own component; only where it is drawn
// changes. Each tab keeps its own slot, so Routines and Study can both pin a
// Start button and the tab bar shows the one for the tab on screen. With no
// provider above it, the button renders in place.
type Listener = () => void;
type Store = { get(route: string): ReactNode; present(route: string): boolean; set(route: string, node: ReactNode): void; subscribe(listener: Listener): () => void };

function createStore(): Store {
  const nodes = new Map<string, ReactNode>();
  const listeners = new Set<Listener>();
  const shown = (node: ReactNode) => node !== null && node !== undefined && node !== false;
  return {
    get: route => nodes.get(route) ?? null,
    present: route => shown(nodes.get(route)),
    set: (route, next) => {
      if (nodes.get(route) === next || (!shown(next) && !nodes.has(route))) return;
      if (shown(next)) nodes.set(route, next); else nodes.delete(route);
      listeners.forEach(listener => listener());
    },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const PinnedActionContext = createContext<Store | null>(null);
// The tab a pinned button belongs to. Screens outside a tab use "index".
const PinnedRouteContext = createContext("index");
const noSubscribe = () => () => {};

export function PinnedActionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <PinnedActionContext.Provider value={store}>{children}</PinnedActionContext.Provider>;
}
export function PinnedRoute({ name, children }: { name: string; children: ReactNode }) {
  return <PinnedRouteContext.Provider value={name}>{children}</PinnedRouteContext.Provider>;
}

// Only re-renders when a pinned action appears or disappears, so a parent of
// the pinned button can read it without causing a render loop.
export function usePinnedActionPresent(route?: string) {
  const store = useContext(PinnedActionContext), own = useContext(PinnedRouteContext), key = route ?? own;
  const present = useCallback(() => store?.present(key) ?? false, [store, key]);
  return useSyncExternalStore(store?.subscribe ?? noSubscribe, present, present);
}

export function PinnedActionHost({ route, style }: { route?: string; style?: StyleProp<ViewStyle> }) {
  const store = useContext(PinnedActionContext), own = useContext(PinnedRouteContext), key = route ?? own;
  const read = useCallback(() => store?.get(key) ?? null, [store, key]);
  const node = useSyncExternalStore(store?.subscribe ?? noSubscribe, read, read);
  if (node === null || node === undefined || node === false) return null;
  return <View style={style}>{node}</View>;
}

export function PinnedAction({ children }: { children: ReactNode }) {
  const store = useContext(PinnedActionContext), route = useContext(PinnedRouteContext);
  useLayoutEffect(() => { store?.set(route, children); });
  useLayoutEffect(() => () => { store?.set(route, null); }, [store, route]);
  return store ? null : <>{children}</>;
}
