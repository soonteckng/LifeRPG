import type { JournalScope } from "../types/sessionJournal";

const sameScope = (a: JournalScope | null, b: JournalScope) =>
  !!a && a.ownerId === b.ownerId && a.backendId === b.backendId;

/** Share a fresh cloud owner check only within one serialized controller operation.
 * Every use remains scoped to the current owner and admission epoch. There is no
 * cross-operation time cache; transport dispatch/response fences remain in place.
 */
export function createSessionOwnerVerification(options: {
  scope: JournalScope;
  currentScope(): JournalScope | null;
  currentEpoch(): number;
  verify(): Promise<JournalScope | null>;
}) {
  let operation = 0, active = false, operationEpoch: number | null = null;
  let proof: { epoch: number; scope: JournalScope } | null = null;
  let pending: { operation: number; epoch: number; request: Promise<JournalScope | null> } | null = null;
  const current = (epoch: number) => sameScope(options.currentScope(), options.scope) && options.currentEpoch() === epoch;
  const clear = () => { operation++; active = false; operationEpoch = null; proof = null; pending = null; };
  return {
    beginOperation() { clear(); operationEpoch = options.currentEpoch(); active = true; },
    endOperation: clear,
    async verify(): Promise<JournalScope | null> {
      const epoch = options.currentEpoch();
      if (!current(epoch)) return null;
      if (active && epoch !== operationEpoch) return null;
      if (!active) {
        const verified = await options.verify();
        return current(epoch) && sameScope(verified, options.scope) ? { ...verified! } : null;
      }
      if (proof?.epoch === epoch && current(epoch)) return { ...proof.scope };
      if (pending?.operation === operation && pending.epoch === epoch) return pending.request;
      const ticket = operation;
      const request = Promise.resolve().then(options.verify).then(verified => {
        if (!active || ticket !== operation || !current(epoch) || !sameScope(verified, options.scope)) return null;
        proof = { epoch, scope: { ...verified! } };
        return { ...proof.scope };
      }).finally(() => {
        if (pending?.operation === ticket && pending.request === request) pending = null;
      });
      pending = { operation: ticket, epoch, request };
      return request;
    },
  };
}
