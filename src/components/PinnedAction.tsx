import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

// Lets a screen's primary button render in a pinned slot (above the tab bar,
// or at the bottom of a page) without moving its handlers or state. The
// button keeps living inside its own component; only where it is drawn
// changes. With no provider above it, the button renders in place.
type Listener = () => void;
type Store = { get(): ReactNode; present(): boolean; set(node: ReactNode): void; subscribe(listener: Listener): () => void };

function createStore(): Store {
  let node: ReactNode = null;
  const listeners = new Set<Listener>();
  return {
    get: () => node,
    present: () => node !== null && node !== undefined && node !== false,
    set: next => { if (next === node) return; node = next; listeners.forEach(listener => listener()); },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const PinnedActionContext = createContext<Store | null>(null);
const noSubscribe = () => () => {};
const noNode = () => null;
const notPresent = () => false;

export function PinnedActionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <PinnedActionContext.Provider value={store}>{children}</PinnedActionContext.Provider>;
}

// Only re-renders when a pinned action appears or disappears, so a parent of
// the pinned button can read it without causing a render loop.
export function usePinnedActionPresent() {
  const store = useContext(PinnedActionContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.present ?? notPresent, store?.present ?? notPresent);
}

export function PinnedActionHost({ style }: { style?: StyleProp<ViewStyle> }) {
  const store = useContext(PinnedActionContext);
  const node = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.get ?? noNode, store?.get ?? noNode);
  if (node === null || node === undefined || node === false) return null;
  return <View style={style}>{node}</View>;
}

export function PinnedAction({ children }: { children: ReactNode }) {
  const store = useContext(PinnedActionContext);
  useLayoutEffect(() => { store?.set(children); });
  useLayoutEffect(() => () => { store?.set(null); }, [store]);
  return store ? null : <>{children}</>;
}
