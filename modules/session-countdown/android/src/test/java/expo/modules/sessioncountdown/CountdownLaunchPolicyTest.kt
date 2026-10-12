package expo.modules.sessioncountdown

import org.junit.Assert.*
import org.junit.Test

class CountdownLaunchPolicyTest {
  @Test fun foregroundBeforeConsumePreservesTheIssuedActionAndDrainsOnce() {
    val state = activeState()
    val policy = CountdownLaunchPolicy()
    assertTrue(policy.capture(state, nonceA))
    assertEquals(nonceA, policy.take(state, leaseA))
    assertNull(policy.take(state, leaseA))
    assertNotNull(CountdownEngine.consume(state, leaseA, nonceA).second)
    assertEquals(2, state.actions.size)
  }

  @Test fun consumeBeforeForegroundStillSuppressesOnlyThatLaunchRefresh() {
    val state = activeState()
    val policy = CountdownLaunchPolicy()
    assertTrue(policy.capture(state, nonceA))
    val (consumed, action) = CountdownEngine.consume(state, leaseA, nonceA)
    assertNotNull(action)
    assertNull(CountdownEngine.consume(consumed, leaseA, nonceA).second)
    assertEquals(nonceA, policy.take(consumed, leaseA))
    assertNull(policy.take(consumed, leaseA))
  }

  @Test fun anAlreadyConsumedOrInventedNonceCannotCreateALaunchNotice() {
    val state = activeState()
    val policy = CountdownLaunchPolicy()
    assertFalse(policy.capture(state, leaseB))
    assertFalse(policy.capture(state, "invented"))
    val consumed = CountdownEngine.consume(state, leaseA, nonceA).first
    assertFalse(policy.capture(consumed, nonceA))
    assertNull(policy.take(consumed, leaseA))
  }

  @Test fun sameSessionRevisionChangesDoNotEraseAnAlreadyVerifiedLaunch() {
    val state = activeState()
    val policy = CountdownLaunchPolicy()
    assertTrue(policy.capture(state, nonceA))
    val newer = state.copy(projection = state.projection!!.copy(identity = state.projection.identity.copy(
      journalRevision = 3, recordRevision = 3)), actions = emptyList())
    policy.retain(newer)
    assertEquals(nonceA, policy.take(newer, leaseA))
    // This notice only postpones reconciliation. Strict action consumption
    // still rejects the old command after a projection revision changes.
    assertNull(CountdownEngine.consume(newer, leaseA, nonceA).second)
  }

  @Test fun changingOwnerBackendEpochClientOrServerRetiresTheNotice() {
    val state = activeState()
    val identity = state.projection!!.identity
    val replacements = listOf(
      identity.copy(scope = identity.scope.copy(ownerId = leaseB)),
      identity.copy(scope = identity.scope.copy(backendId = "other")),
      identity.copy(admissionEpoch = identity.admissionEpoch + 1),
      identity.copy(clientSessionId = leaseB),
      identity.copy(serverSessionId = leaseB))
    for (replacement in replacements) {
      val policy = CountdownLaunchPolicy()
      assertTrue(policy.capture(state, nonceA))
      val changed = state.copy(projection = state.projection.copy(identity = replacement))
      policy.retain(changed)
      assertNull(policy.take(changed, leaseA))
    }
  }

  @Test fun outgoingLeaseCannotDrainASuccessorAndColdProcessHasNoNotice() {
    val state = activeState()
    val policy = CountdownLaunchPolicy()
    assertTrue(policy.capture(state, nonceA))
    assertNull(policy.take(state, leaseB))
    assertEquals(nonceA, policy.take(state, leaseA))
    assertNull(CountdownLaunchPolicy().take(state, leaseA))
    assertTrue(policy.capture(state, nonceA))
    val successor = CountdownEngine.activate(state, leaseB, testScope).state
    policy.retain(successor)
    assertNull(policy.take(successor, leaseB))
  }

  @Test fun clearRetiresNoticeAndAnInvalidLinkCannotEraseAValidLaunch() {
    val state = activeState()
    val policy = CountdownLaunchPolicy()
    assertTrue(policy.capture(state, nonceA))
    assertFalse(policy.capture(state, "invented"))
    assertEquals(nonceA, policy.take(state, leaseA))
    assertTrue(policy.capture(state, nonceB))
    val cleared = CountdownEngine.clear(state, leaseA).state
    policy.retain(cleared)
    assertNull(policy.take(cleared, leaseA))
    assertFalse(policy.capture(cleared, nonceB))
  }
}
