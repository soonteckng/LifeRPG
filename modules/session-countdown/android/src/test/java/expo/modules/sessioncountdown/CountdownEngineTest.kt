package expo.modules.sessioncountdown

import org.junit.Assert.*
import org.junit.Test

internal val testScope = CountdownScope("local-test", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
internal const val leaseA = "11111111-1111-4111-8111-111111111111"
internal const val leaseB = "22222222-2222-4222-8222-222222222222"
internal const val sessionA = "33333333-3333-4333-8333-333333333333"
internal const val nonceA = "44444444-4444-4444-8444-444444444444"
internal const val nonceB = "55555555-5555-4555-8555-555555555555"

internal fun projection(revision: Long = 1, phase: String = "running", remaining: Long = 60_000,
  scope: CountdownScope = testScope, clientId: String = sessionA, epoch: Long = 2,
  clock: CountdownClock = CountdownClock(1_000_000, null, null)): CountdownProjection = CountdownProjection(
  CountdownIdentity(scope, epoch, revision, revision, clientId, null), phase, "Learning", 60_000,
  remaining, 60_000 - remaining, clock, if (phase == "running") clock.wallMs + remaining else null,
  false, phase in setOf("running", "paused"), phase == "running",
  if (phase == "running") listOf("pause", "end") else if (phase == "paused") listOf("resume", "end") else emptyList())
internal fun activeState(projection: CountdownProjection = projection()): CountdownState {
  val active = CountdownEngine.activate(CountdownState(), leaseA, testScope).state
  var counter = 0
  return CountdownEngine.publish(active, leaseA, projection, CountdownPreferences(), 1_000_000, 20_000, "boot-a") {
    if (counter++ == 0) nonceA else nonceB
  }.state
}

class CountdownEngineTest {
  @Test fun protectedBreakFreezesEffortAndKeepsTheFullFinishAlarmDeadline() {
    val p = projection(remaining = 50000).copy(resumeAtMs = 1300000, deadlineMs = 1350000, actions = listOf("resume", "end"))
    val state = activeState(p)
    assertEquals(300000L, CountdownEngine.breakRemaining(state,1000000,20000,"boot-a"))
    assertEquals(50000L, CountdownEngine.remaining(state,1299999,319999,"boot-a"))
    assertEquals(0L, CountdownEngine.breakRemaining(state,1300000,320000,"boot-a"))
    assertEquals(49000L, CountdownEngine.remaining(state,1301000,321000,"boot-a"))
    assertFalse(CountdownEngine.expire(state,1300000,320000,"boot-a").accepted)
    assertTrue(CountdownEngine.expire(state,1350000,370000,"boot-a").accepted)
    assertEquals(p,CountdownParser.projection(p.json()))
  }
  @Test fun breakNotificationRecoversItsDeadlineAfterNativeProcessRestart() {
    val p = projection(remaining = 50000).copy(resumeAtMs = 1300000, deadlineMs = 1350000, actions = listOf("resume", "end"))
    val state = activeState(p).copy(anchor = null)
    val restored = CountdownEngine.repairAnchor(state,1250000,5000,"boot-b")
    assertEquals(50000L,CountdownEngine.breakRemaining(restored,1250000,5000,"boot-b"))
    assertEquals(50000L,CountdownEngine.remaining(restored,1250000,5000,"boot-b"))
  }
  @Test fun freshLeaseOwnsOnlyItsScope() {
    val activated = CountdownEngine.activate(CountdownState(), leaseA, testScope)
    assertTrue(activated.accepted); assertEquals(testScope, activated.state.scope)
    assertNull(activated.state.projection)
    assertEquals(activated.state, CountdownEngine.activate(activated.state, leaseA, testScope).state)
    assertFalse(CountdownEngine.activate(activated.state, leaseA, testScope.copy(backendId = "other")).accepted)
  }
  @Test fun newLeaseRetiresOldLeaseAndCannotBeClearedByIt() {
    val old = activeState()
    val current = CountdownEngine.activate(old, leaseB, testScope).state
    assertNull(current.projection)
    assertFalse(CountdownEngine.activate(current, leaseA, testScope).accepted)
    assertFalse(CountdownEngine.clear(current, leaseA).accepted)
    assertEquals(current, CountdownEngine.clear(current, leaseA).state)
  }
  @Test fun clearIsDurableTombstoneAndRejectsLatePublication() {
    val current = CountdownEngine.clear(activeState(), leaseA)
    assertTrue(current.accepted); assertTrue(current.state.cleared); assertNull(current.state.projection)
    assertFalse(CountdownEngine.activate(current.state, leaseA, testScope).accepted)
    assertFalse(CountdownEngine.publish(current.state, leaseA, projection(8), CountdownPreferences(), 0, 0, "boot-a") { nonceA }.accepted)
    assertTrue(CountdownEngine.clear(current.state, leaseA).accepted)
    assertEquals(current.state, CountdownEngine.clear(current.state, leaseA).state)
  }
  @Test fun confirmedFinishCanExpireAndClearWithoutReplayingItsAlert() {
    val expired = CountdownEngine.expire(activeState(), 1_060_000, 80_000, "boot-a")
    val cleared = CountdownEngine.clear(expired.state, leaseA)
    assertTrue(expired.accepted); assertTrue(cleared.accepted)
    assertEquals(expired.state.delivered, cleared.state.delivered)
    assertFalse(CountdownEngine.expire(cleared.state, 1_100_000, 120_000, "boot-a").accepted)
  }
  @Test fun earlyClearNeverBecomesACompletionAlertAtTheOldDeadline() {
    val cleared = CountdownEngine.clear(activeState(), leaseA).state
    assertTrue(cleared.delivered.isEmpty())
    assertFalse(CountdownEngine.expire(cleared, 1_060_000, 80_000, "boot-a").accepted)
  }
  @Test fun equalAndLowerJournalRevisionsCannotReplaceProjection() {
    val current = activeState(projection(4))
    for (revision in listOf(3L, 4L)) {
      val result = CountdownEngine.publish(current, leaseA, projection(revision), CountdownPreferences(false, false), 0, 0, "boot-a") { nonceA }
      assertFalse(result.accepted); assertEquals(current, result.state)
    }
  }
  @Test fun foreignScopeCannotPublishEvenWithCorrectLease() {
    val current = activeState()
    val result = CountdownEngine.publish(current, leaseA, projection(2, scope = testScope.copy(backendId = "other")),
      CountdownPreferences(), 0, 0, "boot-a") { nonceA }
    assertFalse(result.accepted); assertEquals(current, result.state)
  }
  @Test fun olderEpochCannotReplaceHigherRevision() {
    assertFalse(CountdownEngine.publish(activeState(), leaseA, projection(10, epoch = 1),
      CountdownPreferences(), 0, 0, "boot-a") { nonceA }.accepted)
  }
  @Test fun countdownUsesElapsedClockAcrossWallClockJump() {
    val current = activeState()
    assertEquals(50_000L, CountdownEngine.remaining(current, 5_000_000, 30_000, "boot-a"))
    assertEquals(50_000L, CountdownEngine.remaining(current, 5, 30_000, "boot-a"))
    assertFalse(CountdownEngine.expire(current, 5_000_000, 30_000, "boot-a").accepted)
  }
  @Test fun notificationWholeSecondsMatchAppCeilingInsteadOfShowingOneSecondAhead() {
    val wall = 1_000_000L
    for (remaining in listOf(1L, 250L, 999L, 1000L, 1001L, 1250L, 1999L, 16_250L, 29_750L, 60_000L)) {
      val appSeconds = (remaining + 999) / 1000
      val androidSeconds = (CountdownEngine.chronometerWhen(wall, remaining) - wall) / 1000
      assertEquals(appSeconds, androidSeconds)
    }
    // Current AOSP uses Math.round((base-now-499)/1000f), equivalent
    // away from its millisecond boundary to truncation. Check fractional
    // samples against that actual formula as well as the older integer one.
    for (remaining in listOf(250L, 750L, 1250L, 16_250L, 29_750L)) {
      val base = CountdownEngine.chronometerWhen(wall, remaining)
      val androidSeconds = Math.round((base - wall - 499).toFloat() / 1000f).toLong()
      assertEquals((remaining + 999) / 1000, androidSeconds)
    }
  }
  @Test fun displayRoundingNeverDelaysExpiryOrChangesTheStoredCountdown() {
    val current = activeState()
    val anchor = current.anchor
    val remaining = CountdownEngine.remaining(current, 1_059_750, 79_750, "boot-a")
    assertEquals(250L, remaining)
    assertEquals(1L, (CountdownEngine.chronometerWhen(1_059_750, remaining) - 1_059_750) / 1000)
    assertFalse(CountdownEngine.expire(current, 1_059_750, 79_750, "boot-a").accepted)
    assertTrue(CountdownEngine.expire(current, 1_060_000, 80_000, "boot-a").accepted)
    assertEquals(anchor, current.anchor)
    assertEquals(1_060_000L, current.projection!!.deadlineMs)
  }
  @Test fun rebootRepairsElapsedAnchorFromBoundedWallDeadline() {
    val current = CountdownEngine.repairAnchor(activeState(), 1_025_000, 5000, "boot-b")
    assertEquals("boot-b", current.anchor!!.bootId)
    assertEquals(40_000L, current.anchor.deadlineElapsedMs)
    assertEquals(30_000L, CountdownEngine.remaining(current, 1_030_000, 10_000, "boot-b"))
  }
  @Test fun pauseIsStaticAndNeverSchedulesFinishAlert() {
    val current = activeState(projection(phase = "paused", remaining = 16_000))
    assertNull(current.anchor)
    assertEquals(16_000L, CountdownEngine.remaining(current, 5_000_000, 500_000, "boot-b"))
    assertFalse(CountdownEngine.expire(current, 5_000_000, 500_000, "boot-b").accepted)
  }
  @Test fun staleAlarmFieldsCannotExpireNewProjection() {
    val current = activeState(projection(9))
    assertFalse(CountdownEngine.alarmMatches(current, leaseA, sessionA, 8, 8, 2))
    assertFalse(CountdownEngine.alarmMatches(current, leaseB, sessionA, 9, 9, 2))
    assertFalse(CountdownEngine.alarmMatches(current, leaseA, sessionA, 9, 9, 1))
    assertTrue(CountdownEngine.alarmMatches(current, leaseA, sessionA, 9, 9, 2))
  }
  @Test fun expiryIsOnceAcrossReplayAndRendererLeaseChange() {
    val result = CountdownEngine.expire(activeState(), 1_060_000, 80_000, "boot-a")
    assertTrue(result.accepted); assertTrue(result.state.actions.isEmpty())
    assertFalse(CountdownEngine.expire(result.state, 1_090_000, 110_000, "boot-a").accepted)
    val rebound = CountdownEngine.activate(result.state, leaseB, testScope).state
    val published = CountdownEngine.publish(rebound, leaseB, projection(20), CountdownPreferences(), 1_070_000, 20_000, "boot-a") { nonceA }.state
    assertFalse(CountdownEngine.expire(published, 1_070_000, 20_000, "boot-a").accepted)
  }
  @Test fun issuedActionIsScopedAndConsumedExactlyOnce() {
    val current = activeState()
    assertNull(CountdownEngine.consume(current, leaseB, nonceA).second)
    assertNull(CountdownEngine.consume(current, leaseA, "66666666-6666-4666-8666-666666666666").second)
    val (saved, token) = CountdownEngine.consume(current, leaseA, nonceA)
    assertEquals("pause", token!!.kind); assertEquals(current.projection!!.identity, token.identity)
    assertNull(CountdownEngine.consume(saved, leaseA, nonceA).second)
    assertEquals(1, saved.actions.size)
  }
  @Test fun sourceActionsNeverGrantBackgroundMutation() {
    val current = activeState()
    val (_, action) = CountdownEngine.consume(current, leaseA, nonceB)
    assertEquals("end", action!!.kind)
    assertEquals("running", current.projection!!.phase)
    assertTrue(current.delivered.isEmpty())
  }
  @Test fun refreshAnchorDoesNotRestartDeadlineOrReissueActions() {
    val current = activeState()
    val repaired = CountdownEngine.repairAnchor(current, 1_030_000, 50_000, "boot-a")
    assertEquals(current, repaired)
    assertEquals(30_000L, CountdownEngine.remaining(repaired, 1_030_000, 50_000, "boot-a"))
  }
  @Test fun retainedPresentationHistoryIsBounded() {
    var current = CountdownState()
    for (index in 1..40) {
      val lease = "%08d-1111-4111-8111-111111111111".format(index)
      current = CountdownEngine.activate(current, lease, testScope).state
    }
    assertEquals(32, current.retiredLeases.size)
  }
}
