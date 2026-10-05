// Small, interruptible interactions; route exits retain their completion guards.
export const motion = {
  press: { damping: 24, stiffness: 420, mass: 0.7, overshootClamping: true },
  selection: { damping: 28, stiffness: 300, mass: 0.8, overshootClamping: true },
  sheet: { damping: 38, stiffness: 380, mass: 0.9, overshootClamping: true, restDisplacementThreshold: 0.1, restSpeedThreshold: 0.1 },
} as const;
