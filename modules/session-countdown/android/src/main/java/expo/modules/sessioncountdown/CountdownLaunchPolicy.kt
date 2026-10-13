package expo.modules.sessioncountdown

/**
 * One foreground launch notice, not a session command. Keep the native-issued
 * proof after consume so either JS event order can suppress that one incidental
 * foreground reconciliation. It is process-local: a cold launch cannot use it.
 */
internal class CountdownLaunchPolicy {
  private data class Notice(val lease: String, val identity: CountdownIdentity, val nonce: String)
  private var notice: Notice? = null

  fun capture(state: CountdownState, nonce: String): Boolean {
    val lease = state.leaseId ?: return false
    val token = CountdownEngine.consume(state, lease, nonce).second ?: return false
    notice = Notice(lease, token.identity, token.operationId)
    return true
  }

  fun retain(state: CountdownState) {
    val old = notice ?: return
    val identity = state.projection?.identity
    if (state.cleared || state.leaseId != old.lease || identity == null
      || !sameSession(identity, old.identity)) notice = null
  }

  fun take(state: CountdownState, lease: String): String? {
    // An outgoing caller cannot drain a successor's notice.
    if (state.leaseId != lease) return null
    retain(state)
    val current = notice ?: return null
    if (current.lease != lease) return null
    notice = null
    return current.nonce
  }

  private fun sameSession(a: CountdownIdentity, b: CountdownIdentity) =
    a.scope == b.scope && a.admissionEpoch == b.admissionEpoch
      && a.clientSessionId == b.clientSessionId && a.serverSessionId == b.serverSessionId
}
