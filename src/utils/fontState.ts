// Whether the bundled fonts are ready. Text falls back to the phone's own font
// (keeping its weight) until they are, or if they ever fail to load.
let ready = false;
export const fontState = {
  ready: () => ready,
  markReady: () => { ready = true; },
};
