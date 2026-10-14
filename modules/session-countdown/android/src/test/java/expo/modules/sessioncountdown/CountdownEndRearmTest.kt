package expo.modules.sessioncountdown

import org.junit.Assert.*
import org.junit.Test

class CountdownEndRearmTest {
  private val fresh = "99999999-9999-4999-8999-999999999999"
  private fun rearm(state: CountdownState, wall: Long = 1_000_000, elapsed: Long = 20_000): CountdownState =
    CountdownEngine.rearmEndPrompt(state, wall, elapsed, "boot-a") { fresh }

  @Test fun endRetiresItsNonceAndKeepsOneFreshConfirmationWithoutChangingTiming() {
    val old = activeState()
    val (consumed, token) = CountdownEngine.consume(old, leaseA, nonceB)
    assertEquals("end", token!!.kind)
    val next = rearm(consumed)
    assertEquals(listOf("pause", "end"), next.actions.map { it.kind })
    assertEquals(fresh, next.actions.last().operationId)
    assertEquals(old.copy(actions = next.actions), next)
    assertNull(CountdownEngine.consume(next, leaseA, nonceB).second)
    assertEquals("end", CountdownEngine.consume(next, leaseA, fresh).second!!.kind)
    assertEquals(next, CountdownParser.state(next.json().toString()))
  }

  @Test fun repeatedRefreshDoesNotMultiplyEndActionsOrReissuePause() {
    val old = activeState()
    assertEquals(old, rearm(old))
    val noPause = CountdownEngine.consume(old, leaseA, nonceA).first
    assertEquals(noPause, rearm(noPause))
    val noEnd = CountdownEngine.consume(old, leaseA, nonceB).first
    val next = rearm(noEnd)
    assertEquals(next, rearm(next))
    assertEquals(1, next.actions.count { it.kind == "end" })
  }

  @Test fun terminalClearedAndExpiredStatesCannotRegainAConfirmationShortcut() {
    val old = CountdownEngine.consume(activeState(), leaseA, nonceB).first
    val cleared = CountdownEngine.clear(old, leaseA).state
    assertEquals(cleared, rearm(cleared))
    val terminal = old.copy(projection = old.projection!!.copy(showOngoing = false, phase = "finished"))
    assertEquals(terminal, rearm(terminal))
    assertEquals(old, rearm(old, 2_000_000, 1_020_000))
  }

  @Test fun pausedEndRemainsAvailableWithoutResumingOrChangingItsSavedRemainder() {
    val running = activeState()
    val paused = running.copy(projection = running.projection!!.copy(phase = "paused", deadlineMs = null,
      scheduleFinishAlert = false, actions = listOf("resume", "end")), anchor = null,
      actions = running.actions.map { if (it.kind == "pause") it.copy(kind = "resume") else it })
    val noEnd = CountdownEngine.consume(paused, leaseA, nonceB).first
    val next = rearm(noEnd)
    assertEquals(paused.copy(actions = next.actions), next)
    assertEquals(listOf("resume", "end"), next.actions.map { it.kind })
  }
}
