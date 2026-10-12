package expo.modules.sessioncountdown

import android.content.Context
import android.content.Intent
import android.util.AtomicFile
import android.util.Log
import java.io.File
import java.util.UUID

internal class CountdownRepository(context: Context) {
  companion object {
    // All bridges and receivers use the default app process and the same lock.
    // AtomicFile guarantees replacement, not read/modify/write serialization.
    private val lock = Any()
  }
  private val file = AtomicFile(File(context.filesDir, "liferpg-session-countdown-v1.json"))
  private val notifications = CountdownNotifications(context.applicationContext)

  private fun read(): CountdownState {
    // Older Android AtomicFile versions restore .bak in openRead. Checking
    // only baseFile first would skip that crash recovery and lose a tombstone.
    val backup = File(file.baseFile.path + ".bak")
    val source = if (backup.exists()) backup else file.baseFile
    if (!source.exists()) return CountdownState()
    require(source.length() <= 32 * 1024) { "Countdown cache is too large" }
    val bytes = file.readFully()
    require(bytes.size <= 32 * 1024)
    // Invalid cache is preserved and fails closed. No journal is touched.
    return CountdownParser.state(String(bytes, Charsets.UTF_8))
  }
  private fun write(state: CountdownState) {
    val bytes = state.json().toString().toByteArray(Charsets.UTF_8)
    require(bytes.size <= 32 * 1024)
    val stream = file.startWrite()
    try { stream.write(bytes); file.finishWrite(stream) }
    catch (error: Throwable) { file.failWrite(stream); throw error }
  }
  private fun render(state: CountdownState) {
    try { notifications.render(state) }
    catch (_: Exception) { Log.w("LifeRPGCountdown", "Countdown display could not be updated; the saved session is unchanged.") }
  }
  fun capabilities() = notifications.capabilities()

  fun activate(lease: String, scopeText: String): Boolean = synchronized(lock) {
    val scope = CountdownParser.scope(scopeText)
    val old = read()
    val decision = CountdownEngine.activate(old, lease, scope)
    if (!decision.accepted) return@synchronized false
    if (decision.state != old) { write(decision.state); notifications.cancelAll() }
    true
  }
  fun publish(lease: String, projectionText: String, preferencesText: String): Boolean = synchronized(lock) {
    CountdownParser.lease(lease)
    val projection = CountdownParser.projection(projectionText)
    val preferences = CountdownParser.preferences(preferencesText)
    val decision = CountdownEngine.publish(read(), lease, projection, preferences,
      notifications.wallMs(), notifications.elapsedMs(), notifications.bootId()) { UUID.randomUUID().toString() }
    if (!decision.accepted) return@synchronized false
    write(decision.state)
    expireOrRender(decision.state)
    true
  }
  fun clear(lease: String, finished: Boolean): Boolean = synchronized(lock) {
    CountdownParser.lease(lease)
    val old = read()
    if (old.leaseId != lease) return@synchronized false
    val expiry = if (finished) CountdownEngine.expire(old,
      notifications.wallMs(), notifications.elapsedMs(), notifications.bootId())
      else CountdownEngine.Decision(false, old)
    val decision = CountdownEngine.clear(expiry.state, lease)
    if (!decision.accepted) return@synchronized false
    if (decision.state != old) write(decision.state)
    if (expiry.accepted) {
      try { notifications.finished(expiry.state) }
      catch (_: Exception) { Log.w("LifeRPGCountdown", "The session finish alert is unavailable; progress remains in the app.") }
    }
    if (finished) notifications.cancelOngoing() else notifications.cancelAll()
    true
  }
  fun refresh(lease: String, preferencesText: String): Boolean = synchronized(lock) {
    CountdownParser.lease(lease)
    val preferences = CountdownParser.preferences(preferencesText)
    val old = read()
    if (old.leaseId != lease || old.cleared) return@synchronized false
    val current = CountdownEngine.repairAnchor(old.copy(preferences = preferences),
      notifications.wallMs(), notifications.elapsedMs(), notifications.bootId())
    if (current != old) write(current)
    expireOrRender(current)
    true
  }
  fun consumeAction(lease: String, nonce: String): Map<String, Any?>? = synchronized(lock) {
    if (runCatching { CountdownParser.lease(lease); CountdownParser.lease(nonce) }.isFailure) return@synchronized null
    val (state, token) = CountdownEngine.consume(read(), lease, nonce)
    if (token == null) return@synchronized null
    write(state)
    token.map()
  }
  fun onAlarm(intent: Intent) = synchronized(lock) {
    val current = read()
    if (!CountdownEngine.alarmMatches(current, intent.getStringExtra("leaseId"), intent.getStringExtra("clientSessionId"),
      intent.getLongExtra("journalRevision", -1), intent.getLongExtra("recordRevision", -1), intent.getLongExtra("admissionEpoch", -1))) return@synchronized
    expireOrRender(current)
  }
  fun repair() = synchronized(lock) {
    val old = read()
    val current = CountdownEngine.repairAnchor(old, notifications.wallMs(), notifications.elapsedMs(), notifications.bootId())
    if (current != old) write(current)
    expireOrRender(current)
  }
  private fun expireOrRender(state: CountdownState) {
    val decision = CountdownEngine.expire(state, notifications.wallMs(), notifications.elapsedMs(), notifications.bootId())
    if (decision.accepted) {
      write(decision.state)
      try { notifications.finished(decision.state) }
      catch (_: Exception) { Log.w("LifeRPGCountdown", "The session finish alert is unavailable; progress remains in the app.") }
    } else render(state)
  }
}
