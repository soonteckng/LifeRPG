package expo.modules.focusprotection

import org.junit.Assert.*
import org.junit.Test

class DefaultNetworkStateTest {
  @Test fun lossIsImmediateAndAStaleValidationCannotRestoreIt() {
    val state = DefaultNetworkState("wifi", true)
    assertTrue(state.lost("wifi"))
    assertEquals(false, state.snapshot(10)["connected"])
    assertFalse(state.capabilities("wifi", true))
    assertEquals(false, state.snapshot(11)["validated"])
  }
  @Test fun outgoingLossCannotReplaceTheNewDefaultNetwork() {
    val state = DefaultNetworkState("wifi", true)
    state.available("mobile"); assertTrue(state.capabilities("mobile", true))
    assertFalse(state.lost("wifi")); assertFalse(state.capabilities("wifi", false))
    val current = state.snapshot(20)
    assertEquals(true, current["connected"]); assertEquals(true, current["validated"])
  }
  @Test fun aNewNetworkNeedsItsOwnValidationAndCaptiveAccessDoesNotClaimOnline() {
    val state = DefaultNetworkState<String>(null, false)
    state.available("captive")
    assertEquals(true, state.snapshot(30)["connected"]); assertEquals(false, state.snapshot(31)["validated"])
    state.capabilities("captive", true); assertEquals(true, state.snapshot(32)["validated"])
  }
  @Test fun redundantAvailabilityDoesNotForgetKnownValidation() {
    val state = DefaultNetworkState("wifi", true)
    state.available("wifi"); assertEquals(true, state.snapshot(1)["validated"])
  }
  @Test fun snapshotsAreStrictlyOrderedEvenAtTheSameClockTick() {
    val state = DefaultNetworkState<String>(null, false)
    val a = state.snapshot(100)["sequence"] as Long
    val b = state.snapshot(100)["sequence"] as Long
    val c = state.snapshot(99)["sequence"] as Long
    assertTrue(a < b && b < c)
    state.replace(null, true); assertEquals(false, state.snapshot(101)["validated"])
  }
}
