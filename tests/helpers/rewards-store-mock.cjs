// The rewards store as the session screen sees it. By default nothing is
// waiting (no return or pack screens, not claiming); tests can `set` what is.
const listeners = new Set();
let current = { reveals: [], moments: [], busy: false };
const rewardsStore = { snapshot: () => current, subscribe: (_owner, listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
function set(next) { current = { ...current, ...next }; for (const listener of [...listeners]) listener(); }
function reset() { current = { reveals: [], moments: [], busy: false }; }
module.exports = { rewardsStore, set, reset, useRewards: () => ({ look: {}, equipped: {}, today: { seconds: 0, finds: 0 } }) };
