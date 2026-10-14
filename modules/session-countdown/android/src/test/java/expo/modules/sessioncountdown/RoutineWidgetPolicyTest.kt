package expo.modules.sessioncountdown

import org.junit.Assert.*
import org.junit.Test

class RoutineWidgetPolicyTest {
  private val lease = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  private val nextLease = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  private val owner = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  private val otherOwner = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  private val routineId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
  private val secondId = "ffffffff-ffff-4fff-8fff-ffffffffffff"
  private val scope = CountdownScope("example-project", owner)
  private val routine = WidgetRoutine(routineId, "Review notes", 1500, "Learning", "#AAB3FF")
  private var serial = 1
  private fun token(): String = "00000000-0000-4000-8000-%012d".format(serial++)
  private fun active() = RoutineWidgetPolicy.publish(RoutineWidgetPolicy.activate(RoutineWidgetState(), lease, scope).state, lease, listOf(routine)).state
  private fun widget() = RoutineWidgetPolicy.widgets(active(), listOf(12), ::token)

  @Test fun unknownOwnerStartsEmptyAndSameOwnerNewLeasePreservesColdLaunch() {
    val current = widget(); val nonce = current.bindings.single().nonce!!
    val activated = RoutineWidgetPolicy.activate(current, nextLease, scope)
    assertTrue(activated.accepted)
    assertEquals(current.routines, activated.state.routines)
    assertEquals(nonce, activated.state.bindings.single().nonce)
    assertNotNull(RoutineWidgetPolicy.consume(activated.state, scope, nonce, ::token).second)
  }
  @Test fun activateCannotRepurposeCurrentLeaseOrResurrectRetiredLease() {
    val current = widget()
    assertFalse(RoutineWidgetPolicy.activate(current, lease, scope.copy(ownerId = otherOwner)).accepted)
    val successor = RoutineWidgetPolicy.activate(current, nextLease, scope).state
    assertFalse(RoutineWidgetPolicy.activate(successor, lease, scope).accepted)
    assertFalse(RoutineWidgetPolicy.publish(successor, lease, listOf(routine)).accepted)
    assertFalse(RoutineWidgetPolicy.clear(successor, lease).accepted)
    assertEquals(current.bindings, successor.bindings)
  }
  @Test fun consumeRotatesTokenBeforeReturnAndOldUriCannotReplayAfterRoundTrip() {
    val current = widget(); val nonce = current.bindings.single().nonce!!
    val (saved, launch) = RoutineWidgetPolicy.consume(current, scope, nonce, ::token)
    assertEquals(routineId, launch!!.routineId); assertEquals(scope, launch.scope)
    assertNotEquals(nonce, saved.bindings.single().nonce)
    val reopened = RoutineWidgetParser.state(saved.json().toString())
    assertNull(RoutineWidgetPolicy.consume(reopened, scope, nonce, ::token).second)
    assertNotNull(RoutineWidgetPolicy.consume(reopened, scope, reopened.bindings.single().nonce!!, ::token).second)
  }
  @Test fun inventedNonceWrongOwnerAndWrongBackendCannotConsumeOrRotate() {
    val current = widget(); val nonce = current.bindings.single().nonce!!
    for (attempt in listOf(scope.copy(ownerId = otherOwner), scope.copy(backendId = "elsewhere"))) {
      val (unchanged, launch) = RoutineWidgetPolicy.consume(current, attempt, nonce, ::token)
      assertNull(launch); assertEquals(current, unchanged)
    }
    assertNull(RoutineWidgetPolicy.consume(current, scope, token(), ::token).second)
  }
  @Test fun ownerOrBackendSwitchInvalidatesOldCatalogueTokensAndPinCallbacks() {
    val current = widget()
    val (pinned, pin) = RoutineWidgetPolicy.preparePin(current, lease, routineId, ::token)
    for (replacement in listOf(scope.copy(ownerId = otherOwner), scope.copy(backendId = "elsewhere"))) {
      val next = RoutineWidgetPolicy.activate(pinned, nextLease, replacement).state
      assertTrue(next.routines.isEmpty()); assertTrue(next.pins.isEmpty()); assertNull(next.bindings.single().nonce)
      assertNull(next.bindings.single().routineId)
      assertNull(RoutineWidgetPolicy.consume(next, scope, current.bindings.single().nonce!!, ::token).second)
      assertFalse(RoutineWidgetPolicy.bindPin(next, pin!!, 13, ::token).second)
    }
  }
  @Test fun clearIsIdempotentTombstoneAndDoesNotAcceptLatePublish() {
    val current = widget(); val cleared = RoutineWidgetPolicy.clear(current, lease)
    assertTrue(cleared.accepted); assertTrue(cleared.state.cleared)
    assertEquals(cleared.state, RoutineWidgetPolicy.clear(cleared.state, lease).state)
    assertTrue(cleared.state.routines.isEmpty()); assertNull(cleared.state.bindings.single().nonce)
    assertFalse(RoutineWidgetPolicy.activate(cleared.state, lease, scope).accepted)
    assertFalse(RoutineWidgetPolicy.publish(cleared.state, lease, listOf(routine)).accepted)
    assertNull(RoutineWidgetPolicy.consume(cleared.state, scope, current.bindings.single().nonce!!, ::token).second)
  }
  @Test fun pinCallbackBindsExactRequestedRoutineAndConsumesOnce() {
    val current = RoutineWidgetPolicy.publish(active(), lease, listOf(routine, routine.copy(id = secondId, name = "Project"))).state
    val (prepared, pin) = RoutineWidgetPolicy.preparePin(current, lease, secondId, ::token)
    val (bound, accepted) = RoutineWidgetPolicy.bindPin(prepared, pin!!, 42, ::token)
    assertTrue(accepted); assertEquals(secondId, bound.bindings.single().routineId)
    assertFalse(RoutineWidgetPolicy.bindPin(bound, pin, 42, ::token).second)
    assertEquals(secondId, RoutineWidgetPolicy.consume(bound, scope, bound.bindings.single().nonce!!, ::token).second!!.routineId)
  }
  @Test fun manualWidgetUsesFirstRoutineAndNeverReplacesPinnedRoutine() {
    val current = active(); val (prepared, pin) = RoutineWidgetPolicy.preparePin(current, lease, routineId, ::token)
    val pinned = RoutineWidgetPolicy.bindPin(prepared, pin!!, 12, ::token).first
    val published = RoutineWidgetPolicy.publish(pinned, lease, listOf(routine.copy(id = secondId), routine)).state
    val updated = RoutineWidgetPolicy.widgets(published, listOf(12, 13), ::token)
    assertEquals(routineId, updated.bindings.first { it.widgetId == 12 }.routineId)
    assertEquals(secondId, updated.bindings.first { it.widgetId == 13 }.routineId)
  }
  @Test fun deletedRoutineAndDeletedWidgetCannotKeepLaunchAuthority() {
    val current = widget(); val nonce = current.bindings.single().nonce!!
    val (prepared, pin) = RoutineWidgetPolicy.preparePin(current, lease, routineId, ::token)
    val removed = RoutineWidgetPolicy.publish(prepared, lease, emptyList()).state
    assertNull(removed.bindings.single().nonce); assertTrue(removed.pins.isEmpty())
    assertNull(RoutineWidgetPolicy.consume(removed, scope, nonce, ::token).second)
    assertFalse(RoutineWidgetPolicy.bindPin(removed, pin!!, 12, ::token).second)
    val updated = RoutineWidgetPolicy.widgets(RoutineWidgetPolicy.publish(removed, lease, listOf(routine.copy(id = secondId))).state, listOf(12), ::token)
    // Deleting a pinned routine must not silently start a different routine.
    assertEquals(routineId, updated.bindings.single().routineId); assertNull(updated.bindings.single().nonce)
    assertNull(RoutineWidgetPolicy.consume(RoutineWidgetPolicy.delete(current, listOf(12)), scope, nonce, ::token).second)
  }
  @Test fun deniedPinsStayBoundedAndDoNotBlockAnotherRequest() {
    var current = active(); var oldest: String? = null
    repeat(24) {
      val (prepared, pin) = RoutineWidgetPolicy.preparePin(current, lease, routineId, ::token)
      assertNotNull(pin); if (oldest == null) oldest = pin; current = prepared
    }
    assertEquals(16, current.pins.size)
    assertFalse(RoutineWidgetPolicy.bindPin(current, oldest!!, 12, ::token).second)
    assertTrue(RoutineWidgetPolicy.bindPin(current, current.pins.last().nonce, 12, ::token).second)
  }
  @Test fun noOpPublishRepairAndRebootRoundTripKeepCurrentTokens() {
    val current = widget()
    val published = RoutineWidgetPolicy.publish(current, lease, current.routines).state
    assertEquals(current, RoutineWidgetPolicy.widgets(published, listOf(12), ::token))
    assertEquals(current, RoutineWidgetParser.state(current.json().toString()))
  }
  @Test fun widgetBoundsAndDuplicateTokenFailClosed() {
    val current = active()
    val bounded = RoutineWidgetPolicy.widgets(current, (1..100).toList(), ::token)
    assertEquals(MAX_WIDGETS, bounded.bindings.size)
    assertEquals(MAX_WIDGETS, bounded.bindings.map { it.nonce }.distinct().size)
    try { RoutineWidgetPolicy.widgets(current, listOf(1, 2)) { lease }; fail("duplicate token accepted") } catch (_: IllegalArgumentException) {}
  }
}
