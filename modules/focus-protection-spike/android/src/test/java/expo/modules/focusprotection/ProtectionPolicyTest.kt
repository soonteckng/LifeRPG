package expo.modules.focusprotection
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ProtectionPolicyTest {
  private fun raw() = JSONObject().put("version", 1).put("id", "11111111-1111-4111-8111-111111111111")
    .put("scope", "owner-backend-session").put("title", "Study").put("seconds", 60).put("mode", "allow-list").put("allowed", org.json.JSONArray().put("study.notes"))
  private fun lease() = ProtectionPolicy.parse(raw().toString(), 1000L)
  @Test fun exactExpiryAndClockRollbackNeverCover() {
    val item = lease(); assertEquals(60, item.remaining(1000)); assertEquals(1, item.remaining(60999)); assertEquals(0, item.remaining(61000))
    assertEquals(0, item.remaining(999)); assertEquals(0, item.remaining(Long.MAX_VALUE))
  }
  @Test fun allowedAndEssentialAppsRemainAccessible() {
    val item = lease(); val users = setOf("study.notes", "social.app", "phone.app", "settings.app")
    for (pkg in listOf("study.notes", "phone.app", "settings.app", null, "unknown.app")) assertFalse(ProtectionPolicy.shouldCover(item, pkg, setOf("phone.app", "settings.app"), users, 2000))
    assertTrue(ProtectionPolicy.shouldCover(item, "social.app", setOf("phone.app"), users, 2000))
    assertFalse(ProtectionPolicy.shouldCover(item, "social.app", emptySet(), users, 61000))
  }
  @Test fun systemOnlyModeStillHonoursSafetyExclusions() {
    val item = ProtectionPolicy.parse(raw().put("mode", "essentials").put("allowed", org.json.JSONArray()).toString(), 0)
    assertTrue(ProtectionPolicy.shouldCover(item, "social.app", setOf("phone.app"), setOf("social.app", "phone.app"), 0))
    assertFalse(ProtectionPolicy.shouldCover(item, "phone.app", setOf("phone.app"), setOf("phone.app"), 0))
  }
  @Test fun oneBreakAutomaticallyRestoresCoverWithoutJavaScript() {
    val gate = ProtectionLeaseGate(); val item = lease(); assertTrue(gate.install(item));
    assertTrue(gate.takeBreak(item.id, 11000, 300000)); val resting = gate.current!!;
    assertEquals(50, resting.remaining(310999)); assertEquals(50, resting.remaining(311000));
    assertFalse(ProtectionPolicy.shouldCover(resting, "social.app", emptySet(), setOf("social.app"), 310999));
    assertTrue(ProtectionPolicy.shouldCover(resting, "social.app", emptySet(), setOf("social.app"), 311000));
    assertFalse(gate.takeBreak(item.id, 311000, 300000)); assertEquals(0, resting.remaining(361000));
  }
  @Test fun earlyReturnCannotRestartBreakOrAffectAnotherLease() {
    val gate = ProtectionLeaseGate(); val item = lease(); gate.install(item); gate.takeBreak(item.id, 11000, 300000);
    assertFalse(gate.endBreak("foreign-id", 12000)); assertTrue(gate.endBreak(item.id, 12000));
    assertEquals(50, gate.current!!.remaining(12000)); assertFalse(gate.takeBreak(item.id, 12000, 300000));
    gate.finish(item.id,"stopped"); assertFalse(gate.takeBreak(item.id, 13000,300000));
  }
  @Test fun malformedInputNeverInstallsProtection() {
    val variants = listOf(raw().put("seconds", 0), raw().put("seconds", 601), raw().put("seconds", 2.5), raw().put("seconds", "60"), raw().put("version", 4), raw().put("extra", true), raw().put("id", "bad"), raw().put("scope", 33), raw().put("mode", "block-everything"), raw().put("allowed", org.json.JSONArray().put("../settings")))
    for (input in variants) { try { ProtectionPolicy.parse(input.toString(), 0); fail("Accepted malformed input") } catch (_: IllegalArgumentException) {} }
  }
  @Test fun essentialModeCannotCarryAnAmbiguousAllowList() {
    try { ProtectionPolicy.parse(raw().put("mode", "essentials").toString(), 0); fail() } catch (_: IllegalArgumentException) {}
  }
  @Test fun anEndBeforeDelayedStartRetiresItsLease() {
    val gate = ProtectionLeaseGate(); val item = lease(); gate.finish(item.id, "stopped")
    assertFalse(gate.install(item)); assertNull(gate.current)
  }
  @Test fun outgoingStopCannotClearASuccessor() {
    val gate = ProtectionLeaseGate(); val first = lease(); val second = first.copy(id = "22222222-2222-4222-8222-222222222222")
    assertTrue(gate.install(first)); gate.finish(first.id, "stopped"); assertTrue(gate.install(second))
    gate.active(first.id); gate.covered(first.id); gate.finish(first.id, "interrupted")
    assertEquals(second, gate.current); assertEquals(0, gate.covers); assertEquals("starting", gate.status)
  }
  @Test fun interruptionDropsCountersAndNeverRestarts() {
    val gate = ProtectionLeaseGate(); val item = lease(); gate.install(item); gate.active(item.id); gate.covered(item.id)
    assertEquals(1, gate.covers); gate.finish(item.id, "permission-lost")
    assertNull(gate.current); assertEquals(0, gate.covers); assertFalse(gate.install(item)); assertEquals("permission-lost", gate.status)
  }
  @Test fun fullSessionVersionUsesTheSessionLimitAndExactMonotonicDeadline() {
    val item = ProtectionPolicy.parse(raw().put("version", 2).put("seconds", 28800).toString(), 1000L)
    assertEquals(28800, item.remaining(1000L)); assertEquals(1, item.remaining(28_800_999L)); assertEquals(0, item.remaining(28_801_000L))
    try { ProtectionPolicy.parse(raw().put("version", 2).put("seconds", 28801).toString(), 1000L); fail() } catch (_: IllegalArgumentException) {}
  }
  @Test fun stoppedLeaseRetainsItsSessionScopeForAnHonestInterruptedStatus() {
    val gate = ProtectionLeaseGate(); val item = lease(); gate.install(item); gate.finish(item.id, "interrupted")
    val state = gate.snapshot(2000L); assertNull(state["id"]); assertEquals(item.scope, state["scope"]); assertEquals("interrupted", state["status"])
  }
}
