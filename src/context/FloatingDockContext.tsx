import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Measurement = { key: string; height: number };
const FloatingDockContext = createContext<{
  measurement: Measurement | null;
  measure: (key: string, height: number) => void;
} | null>(null);

export function FloatingDockProvider({ children }: { children: ReactNode }) {
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const measure = useCallback((key: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setMeasurement(current => current?.key === key && current.height === height ? current : { key, height });
  }, []);
  const value = useMemo(() => ({ measurement, measure }), [measurement, measure]);
  return <FloatingDockContext.Provider value={value}>{children}</FloatingDockContext.Provider>;
}

// Measurements are specific to banner visibility, device width and text scale.
// A new configuration uses the estimate until native layout has reported its size.
export function floatingDockKey(bannerVisible: boolean, safeBottom: number, width: number, fontScale: number) {
  return `${bannerVisible}:${safeBottom}:${width}:${fontScale}`;
}
export function useFloatingDockHeight(key: string, fallback: number) {
  const context = useContext(FloatingDockContext);
  return context?.measurement?.key === key ? Math.max(fallback, context.measurement.height) : fallback;
}
export function useMeasureFloatingDock() {
  return useContext(FloatingDockContext)?.measure;
}
