package expo.modules.focusprotection

/** The default-network state machine is independent of Android callback timing. */
class DefaultNetworkState<T : Any>(initial: T?, initialValidated: Boolean) {
  private var network = initial
  private var validated = initial != null && initialValidated
  private var sequence = 0L
  @Synchronized fun replace(current: T?, valid: Boolean) { network = current; validated = current != null && valid }
  @Synchronized fun available(current: T) { if (network != current) { network = current; validated = false } }
  @Synchronized fun capabilities(current: T, valid: Boolean): Boolean {
    if (network != current) return false
    validated = valid; return true
  }
  @Synchronized fun lost(current: T): Boolean {
    if (network != current) return false
    network = null; validated = false; return true
  }
  @Synchronized fun snapshot(now: Long): Map<String, Any> {
    sequence = maxOf(sequence + 1, now)
    return mapOf("connected" to (network != null), "validated" to validated, "sequence" to sequence)
  }
}
