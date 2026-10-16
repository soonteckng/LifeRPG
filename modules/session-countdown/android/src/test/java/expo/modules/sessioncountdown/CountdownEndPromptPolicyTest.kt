package expo.modules.sessioncountdown

import org.junit.Assert.*
import org.junit.Test

class CountdownEndPromptPolicyTest {
  private fun restored(): Pair<CountdownState, CountdownEndPrompts> {
    // Actual frozen-cache parser hydration, as a new Repository/process sees it.
    val previous = CountdownParser.state(activeState().json().toString())
    val next = CountdownEngine.activate(previous, leaseB, testScope).state
    val proof = CountdownEndPromptPolicy.activate(CountdownEndPrompts(), previous, next)
    return next to CountdownEndPromptPolicy.parse(proof.json().toString())
  }
  @Test fun coldHydrateAndActivatePreserveOnlyIssuedEndOriginalIdentity() {
    val old = activeState(); val (current, proof) = restored()
    assertNull(CountdownEngine.consume(current, leaseB, nonceB).second)
    assertEquals(listOf("end"), proof.tokens.map { it.kind })
    assertEquals(old.actions.first { it.kind == "end" }, proof.tokens.single())
    assertNull(CountdownEndPromptPolicy.consume(proof, current, leaseB, nonceA).second)
    assertNull(CountdownEndPromptPolicy.consume(proof, current, leaseA, nonceB).second)
    assertNotNull(CountdownEndPromptPolicy.consume(proof, current, leaseB, nonceB).second)
  }
  @Test fun endProofDrainsOnceAndItsTombstoneSurvivesAnotherProcessAndLease() {
    val (current, proof) = restored()
    val (consumed, token) = CountdownEndPromptPolicy.consume(proof, current, leaseB, nonceB)
    assertEquals("end", token!!.kind)
    val hydrated = CountdownEndPromptPolicy.parse(consumed.json().toString())
    assertNull(CountdownEndPromptPolicy.consume(hydrated, current, leaseB, nonceB).second)
    val leaseC = "66666666-6666-4666-8666-666666666666"
    val successor = CountdownEngine.activate(current, leaseC, testScope).state
    val nextProof = CountdownEndPromptPolicy.activate(hydrated, current, successor)
    assertNull(CountdownEndPromptPolicy.consume(nextProof, successor, leaseC, nonceB).second)
  }
  @Test fun crashAfterEndTombstoneBeforeOriginalActionWriteCannotRecaptureIt() {
    val old = activeState()
    val consumed = CountdownEndPromptPolicy.consumed(CountdownEndPrompts(), old.actions.first { it.kind == "end" })
    val hydrated = CountdownEndPromptPolicy.parse(consumed.json().toString())
    val current = CountdownEngine.activate(old, leaseB, testScope).state
    val proof = CountdownEndPromptPolicy.activate(hydrated, old, current)
    assertTrue(proof.tokens.isEmpty())
    assertNull(CountdownEndPromptPolicy.consume(proof, current, leaseB, nonceB).second)
    assertTrue(nonceB in proof.retiredTokens)
  }
  @Test fun differentOwnerOrBackendAndClearInvalidateOldEnd() {
    val old = activeState(); val (current, proof) = restored()
    for (scope in listOf(testScope.copy(ownerId = sessionA), testScope.copy(backendId = "other"))) {
      val successor = CountdownEngine.activate(old, leaseB, scope).state
      val changed = CountdownEndPromptPolicy.activate(proof, old, successor)
      assertTrue(changed.tokens.isEmpty())
      assertNull(CountdownEndPromptPolicy.consume(changed, successor, leaseB, nonceB).second)
    }
    val cleared = CountdownEndPromptPolicy.clear(proof, current)
    assertTrue(cleared.tokens.isEmpty())
    assertNull(CountdownEndPromptPolicy.consume(cleared, current, leaseB, nonceB).second)
    assertNull(CountdownEndPromptPolicy.consume(proof, CountdownEngine.clear(current, leaseB).state, leaseB, nonceB).second)
  }
  @Test fun clearBeforeFrozenCacheWriteStillRetiresTheOriginalIssuedEnd() {
    val old = activeState()
    val proof = CountdownEndPromptPolicy.clear(CountdownEndPrompts(), old)
    val current = CountdownEngine.activate(old, leaseB, testScope).state
    val hydrated = CountdownEndPromptPolicy.parse(proof.json().toString())
    assertTrue(CountdownEndPromptPolicy.activate(hydrated, old, current).tokens.isEmpty())
  }
  @Test fun sameClientReprojectionKeepsPromptButDifferentClientTerminalAndServerRetireIt() {
    val (bootstrap, proof) = restored()
    val current = CountdownEngine.publish(bootstrap, leaseB, projection(4).copy(identity = projection(4).identity.copy(admissionEpoch = 3)),
      CountdownPreferences(), 1_000_000, 20_000, "boot-a") { "77777777-7777-4777-8777-777777777777" }.state
    assertEquals(proof, CountdownEndPromptPolicy.retain(proof, current))
    val changed = current.copy(projection = current.projection!!.copy(identity = current.projection.identity.copy(clientSessionId = leaseA)))
    assertTrue(CountdownEndPromptPolicy.retain(proof, changed).tokens.isEmpty())
    assertNull(CountdownEndPromptPolicy.consume(proof, changed, leaseB, nonceB).second)
    assertTrue(CountdownEndPromptPolicy.retain(proof, current.copy(projection = current.projection.copy(showOngoing = false, phase = "finished"))).tokens.isEmpty())
    val bound = proof.copy(tokens = proof.tokens.map { it.copy(identity = it.identity.copy(serverSessionId = sessionA)) })
    assertTrue(CountdownEndPromptPolicy.retain(bound, current).tokens.isEmpty())
    val promoted = current.copy(projection = current.projection.copy(identity = current.projection.identity.copy(serverSessionId = sessionA)))
    assertEquals(proof, CountdownEndPromptPolicy.retain(proof, promoted))
  }
  @Test fun preservingAnOriginalColdIntentDoesNotLoseItDuringASecondSameSessionHydration() {
    val (bootstrap, proof) = restored()
    var serial = 0
    val current = CountdownEngine.publish(bootstrap, leaseB, projection(4), CountdownPreferences(), 1_000_000, 20_000, "boot-a") {
      "77777777-7777-4777-8777-%012d".format(++serial)
    }.state
    val leaseC = "66666666-6666-4666-8666-666666666666"
    val successor = CountdownEngine.activate(current, leaseC, testScope).state
    val hydrated = CountdownEndPromptPolicy.parse(CountdownEndPromptPolicy.activate(proof, current, successor).json().toString())
    assertNotNull(CountdownEndPromptPolicy.consume(hydrated, successor, leaseC, nonceB).second)
    assertEquals(2, hydrated.tokens.size)
  }
  @Test fun promptParserRejectsPauseOrResumeProofAndStateRemainsBounded() {
    for (kind in listOf("pause", "resume")) {
      val token = activeState().actions.first().copy(kind = kind)
      val invalid = CountdownEndPrompts(leaseA, testScope, listOf(token)).json().toString()
      try { CountdownEndPromptPolicy.parse(invalid); fail("Mutation token admitted as End prompt") } catch (_: IllegalArgumentException) {}
    }
    var proof = CountdownEndPrompts()
    repeat(60) { index ->
      val nonce = "88888888-8888-4888-8888-%012d".format(index)
      val token = activeState().actions.first { it.kind == "end" }.copy(operationId = nonce)
      proof = CountdownEndPromptPolicy.consumed(proof, token)
    }
    assertEquals(32, proof.retiredTokens.size)
    assertEquals(proof, CountdownEndPromptPolicy.parse(proof.json().toString()))
    // Frozen formatVersion1 cache fields have not changed.
    assertEquals(activeState(), CountdownParser.state(activeState().json().toString()))
  }
}
