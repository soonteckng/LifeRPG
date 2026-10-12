package expo.modules.sessioncountdown

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CountdownParserTest {
  private fun rejects(text: String) {
    try { CountdownParser.projection(text); fail("Expected invalid projection") } catch (_: IllegalArgumentException) {}
  }
  @Test fun projectionAndNativeCacheRoundTrip() {
    val source = projection()
    assertEquals(source, CountdownParser.projection(source.json().toString()))
    val native = activeState()
    assertEquals(native, CountdownParser.state(native.json().toString()))
    val cleared = CountdownEngine.clear(native, leaseA).state
    assertEquals(cleared, CountdownParser.state(cleared.json().toString()))
  }
  @Test fun unknownVersionAndCredentialsRejected() {
    rejects(projection().json().put("version", 2).toString())
    rejects(projection().json().put("accessToken", "must-never-be-in-cache").toString())
    rejects(projection().json().put("targetMs", "60000").toString())
  }
  @Test fun unsafeFractionalNegativeAndTooLargeNumbersRejected() {
    for (value in listOf(-1, 1.5, 28_800_001)) rejects(projection().json().put("remainingMs", value).toString())
    val identity = projection().json()
    identity.getJSONObject("identity").put("journalRevision", 9_007_199_254_740_992.0)
    rejects(identity.toString())
  }
  @Test fun impossibleDeadlineAndPhaseFlagsRejected() {
    rejects(projection().json().put("deadlineMs", 9).toString())
    rejects(projection().json().put("scheduleFinishAlert", false).toString())
    rejects(projection().json().put("showOngoing", false).toString())
    rejects(projection().json().put("phase", "completed").toString())
  }
  @Test fun inconsistentDurationAndInactiveAdmissionRejected() {
    rejects(projection().json().put("elapsedMs", 10).toString())
    rejects(projection(remaining = 0).json().toString())
    val inactive = projection().json(); inactive.getJSONObject("identity").put("admissionEpoch", 0)
    rejects(inactive.toString())
  }
  @Test fun malformedScopeAndIdentityRejected() {
    val item = projection().json()
    item.getJSONObject("identity").getJSONObject("scope").put("backendId", "../other")
    rejects(item.toString())
    val foreign = projection().json(); foreign.getJSONObject("identity").put("clientSessionId", "not-a-uuid")
    rejects(foreign.toString())
  }
  @Test fun extraTrailingJsonAndHugePayloadRejected() {
    rejects(projection().json().toString() + "{}")
    rejects(" ".repeat(16 * 1024) + projection().json().toString())
    rejects(projection().json().put("title", "x".repeat(257)).toString())
  }
  @Test fun titleMatchesJournalBoundaryAndRemainsDisplayOnly() {
    val expected = projection().copy(title = "Learning\nwith notes " + "x".repeat(236))
    assertEquals(expected, CountdownParser.projection(expected.json().toString()))
  }
  @Test fun invalidActionAndPreferenceCoercionRejected() {
    rejects(projection().json().put("foregroundActions", org.json.JSONArray(listOf("resume", "end"))).toString())
    rejects(projection().json().put("foregroundActions", org.json.JSONArray(listOf("pause", "pause"))).toString())
    try { CountdownParser.preferences("{\"sound\":\"true\",\"haptics\":false}"); fail("Expected strict boolean") }
    catch (_: IllegalArgumentException) {}
  }
  @Test fun ownerMismatchedCacheAndClearedActionsRejected() {
    val source = activeState().json()
    source.put("scope", JSONObject().put("backendId", "other").put("ownerId", testScope.ownerId))
    try { CountdownParser.state(source.toString()); fail("Expected owner mismatch") } catch (_: IllegalArgumentException) {}
    try { CountdownParser.state(activeState().json().put("cleared", true).toString()); fail("Expected cleared token cache rejection") }
    catch (_: IllegalArgumentException) {}
  }
  @Test fun consumedTokensRemainAbsentAfterStorageReload() {
    val (consumed, _) = CountdownEngine.consume(activeState(), leaseA, nonceA)
    val reloaded = CountdownParser.state(consumed.json().toString())
    assertNull(CountdownEngine.consume(reloaded, leaseA, nonceA).second)
  }
}
