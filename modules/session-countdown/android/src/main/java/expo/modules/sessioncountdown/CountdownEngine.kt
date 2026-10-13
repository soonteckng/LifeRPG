package expo.modules.sessioncountdown

/** Presentation state only: never read or mutate the journal, credentials, cloud state or rewards. */
internal object CountdownEngine {
  data class Decision(val accepted: Boolean, val state: CountdownState)

  fun activate(current: CountdownState, leaseId: String, scope: CountdownScope): Decision {
    CountdownParser.lease(leaseId)
    if (leaseId in current.retiredLeases || (current.leaseId == leaseId && current.cleared)) return Decision(false, current)
    if (current.leaseId == leaseId) return Decision(current.scope == scope, current)
    val retired = (current.retiredLeases + listOfNotNull(current.leaseId)).distinct().takeLast(32)
    return Decision(true, CountdownState(leaseId = leaseId, scope = scope, cleared = false,
      retiredLeases = retired, delivered = current.delivered))
  }

  fun publish(current: CountdownState, leaseId: String, projection: CountdownProjection,
    preferences: CountdownPreferences, wallMs: Long, elapsedMs: Long, bootId: String,
    operationId: () -> String): Decision {
    if (current.leaseId != leaseId || current.cleared || current.scope != projection.identity.scope) return Decision(false, current)
    val previous = current.projection
    if (previous != null && (projection.identity.journalRevision <= previous.identity.journalRevision
      || projection.identity.admissionEpoch < previous.identity.admissionEpoch
      || (projection.identity.clientSessionId == previous.identity.clientSessionId
        && projection.identity.recordRevision < previous.identity.recordRevision))) return Decision(false, current)
    val anchor = if (projection.phase == "running") {
      val remaining = (projection.deadlineMs!! - wallMs).coerceIn(0, projection.targetMs)
      CountdownAnchor(wallMs, elapsedMs, bootId, elapsedMs + remaining)
    } else null
    val actions = if (projection.showOngoing) projection.actions.map {
      CountdownAction(CountdownParser.lease(operationId()), projection.identity, it)
    } else emptyList()
    return Decision(true, current.copy(projection = projection, preferences = preferences, anchor = anchor, actions = actions))
  }

  fun clear(current: CountdownState, leaseId: String): Decision {
    if (current.leaseId != leaseId) return Decision(false, current)
    if (current.cleared) return Decision(true, current)
    return Decision(true, current.copy(cleared = true, projection = null, anchor = null, actions = emptyList(),
      retiredLeases = (current.retiredLeases + leaseId).distinct().takeLast(32)))
  }

  fun remaining(current: CountdownState, wallMs: Long, elapsedMs: Long, bootId: String): Long {
    val projection = current.projection ?: return 0
    if (current.cleared) return 0
    if (projection.phase != "running") return projection.remainingMs
    val anchor = current.anchor
    val duration = if (anchor != null && anchor.bootId == bootId && elapsedMs >= anchor.elapsedMs)
      anchor.deadlineElapsedMs - elapsedMs else projection.deadlineMs!! - wallMs
    return duration.coerceIn(0, projection.targetMs)
  }

  // Android's chronometer displays a whole second before the app's ceil-based
  // numeral unless its DISPLAY base is shifted. Never shift the alarm anchor,
  // timeout, stored deadline, elapsed time or completion eligibility.
  fun chronometerWhen(wallMs: Long, remainingMs: Long): Long = wallMs + remainingMs + 999

  fun repairAnchor(current: CountdownState, wallMs: Long, elapsedMs: Long, bootId: String): CountdownState {
    val projection = current.projection ?: return current
    if (current.cleared || projection.phase != "running") return current
    val old = current.anchor
    if (old != null && old.bootId == bootId && elapsedMs >= old.elapsedMs) return current
    return current.copy(anchor = CountdownAnchor(wallMs, elapsedMs, bootId,
      elapsedMs + remaining(current, wallMs, elapsedMs, bootId)))
  }

  fun alarmMatches(current: CountdownState, leaseId: String?, clientId: String?, journalRevision: Long,
    recordRevision: Long, epoch: Long): Boolean {
    val projection = current.projection ?: return false
    val identity = projection.identity
    return !current.cleared && current.leaseId == leaseId && projection.phase == "running"
      && projection.scheduleFinishAlert && identity.clientSessionId == clientId
      && identity.journalRevision == journalRevision && identity.recordRevision == recordRevision
      && identity.admissionEpoch == epoch
  }

  fun expire(current: CountdownState, wallMs: Long, elapsedMs: Long, bootId: String): Decision {
    val projection = current.projection ?: return Decision(false, current)
    if (current.cleared || projection.phase != "running" || !projection.scheduleFinishAlert
      || remaining(current, wallMs, elapsedMs, bootId) > 0) return Decision(false, current)
    val key = projection.identity.finishKey()
    if (key in current.delivered) return Decision(false, current)
    // Persist before the OS post. A process death here can suppress one alert;
    // it cannot replay it or turn alert delivery into a credit claim.
    return Decision(true, current.copy(delivered = (current.delivered + key).takeLast(32), actions = emptyList()))
  }

  fun consume(current: CountdownState, leaseId: String, nonce: String): Pair<CountdownState, CountdownAction?> {
    if (current.cleared || current.leaseId != leaseId) return current to null
    val projection = current.projection ?: return current to null
    val token = current.actions.firstOrNull { it.operationId == nonce } ?: return current to null
    if (token.identity != projection.identity || token.kind !in projection.actions || !projection.showOngoing)
      return current to null
    return current.copy(actions = current.actions.filterNot { it.operationId == nonce }) to token
  }
}
