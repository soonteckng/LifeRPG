package expo.modules.sessioncountdown

/** Single-process presentation policy. All starts remain in the JS session controller. */
internal object RoutineWidgetPolicy {
  data class Decision(val accepted: Boolean, val state: RoutineWidgetState)
  fun activate(old: RoutineWidgetState, lease: String, scope: CountdownScope): Decision {
    CountdownParser.lease(lease)
    if (lease in old.retiredLeases || (old.leaseId == lease && old.cleared)) return Decision(false, old)
    if (old.leaseId == lease) return Decision(old.scope == scope, old)
    val sameOwner = old.scope == scope && !old.cleared
    return Decision(true, old.copy(leaseId = lease, scope = scope, cleared = false,
      retiredLeases = (old.retiredLeases + listOfNotNull(old.leaseId)).distinct().takeLast(32),
      routines = if (sameOwner) old.routines else emptyList(), pins = if (sameOwner) old.pins else emptyList(),
      bindings = if (sameOwner) old.bindings else old.bindings.map { RoutineWidgetBinding(it.widgetId) }))
  }
  fun publish(old: RoutineWidgetState, lease: String, routines: List<WidgetRoutine>): Decision {
    if (old.leaseId != lease || old.cleared) return Decision(false, old)
    return Decision(true, old.copy(routines = routines,
      bindings = old.bindings.map { if (routines.any { routine -> routine.id == it.routineId }) it else it.copy(nonce = null) },
      pins = old.pins.filter { pin -> routines.any { it.id == pin.routineId } }))
  }
  fun clear(old: RoutineWidgetState, lease: String): Decision {
    if (old.leaseId != lease) return Decision(false, old)
    return Decision(true, old.copy(cleared = true, routines = emptyList(), pins = emptyList(),
      bindings = old.bindings.map { RoutineWidgetBinding(it.widgetId) },
      retiredLeases = (old.retiredLeases + lease).distinct().takeLast(32)))
  }
  fun widgets(old: RoutineWidgetState, widgetIds: List<Int>, nonce: () -> String): RoutineWidgetState {
    val ids = widgetIds.filter { it > 0 }.distinct().take(MAX_WIDGETS)
    val bindings = ids.map { id ->
      val existing = old.bindings.firstOrNull { it.widgetId == id } ?: RoutineWidgetBinding(id)
      val routineId = existing.routineId ?: old.routines.firstOrNull()?.id
      val allowed = !old.cleared && old.scope != null && old.routines.any { it.id == routineId }
      existing.copy(routineId = routineId, nonce = if (allowed) existing.nonce ?: fresh(old, nonce) else null)
    }
    require(bindings.mapNotNull { it.nonce }.distinct().size == bindings.count { it.nonce != null })
    return old.copy(bindings = bindings)
  }
  fun preparePin(old: RoutineWidgetState, lease: String, routineId: String, nonce: () -> String): Pair<RoutineWidgetState, String?> {
    if (old.leaseId != lease || old.cleared || old.routines.none { it.id == routineId }) return old to null
    // A denied pin has no system callback. Bound pending requests so repeated
    // dismissals never fill storage or permanently prevent a later request.
    val token = fresh(old, nonce); return old.copy(pins = old.pins.takeLast(15) + RoutineWidgetPin(token, routineId)) to token
  }
  fun cancelPin(old: RoutineWidgetState, nonce: String) = old.copy(pins = old.pins.filterNot { it.nonce == nonce })
  fun bindPin(old: RoutineWidgetState, nonce: String, widgetId: Int, token: () -> String): Pair<RoutineWidgetState, Boolean> {
    if (old.cleared || widgetId <= 0 || (old.bindings.none { it.widgetId == widgetId } && old.bindings.size >= MAX_WIDGETS)) return old to false
    val pin = old.pins.firstOrNull { it.nonce == nonce } ?: return old to false
    if (old.routines.none { it.id == pin.routineId }) return old to false
    val binding = RoutineWidgetBinding(widgetId, pin.routineId, fresh(old, token))
    return old.copy(pins = old.pins.filterNot { it.nonce == nonce }, bindings = old.bindings.filterNot { it.widgetId == widgetId } + binding) to true
  }
  fun delete(old: RoutineWidgetState, ids: List<Int>) = old.copy(bindings = old.bindings.filterNot { it.widgetId in ids })
  fun consume(old: RoutineWidgetState, scope: CountdownScope, nonce: String, token: () -> String): Pair<RoutineWidgetState, RoutineWidgetLaunch?> {
    if (old.cleared || old.scope != scope) return old to null
    val binding = old.bindings.firstOrNull { it.nonce == nonce } ?: return old to null
    val id = binding.routineId ?: return old to null
    if (old.routines.none { it.id == id }) return old to null
    // Persist the replacement before JS receives the launch. Reopened old URIs
    // cannot issue a second start even across process death or a new same-owner lease.
    val updated = binding.copy(nonce = fresh(old, token))
    return old.copy(bindings = old.bindings.map { if (it.widgetId == binding.widgetId) updated else it }) to RoutineWidgetLaunch(id, scope)
  }
  private fun fresh(old: RoutineWidgetState, token: () -> String): String {
    val value = CountdownParser.lease(token())
    require(old.bindings.none { it.nonce == value } && old.pins.none { it.nonce == value }) { "Duplicate widget launch token" }
    return value
  }
}
