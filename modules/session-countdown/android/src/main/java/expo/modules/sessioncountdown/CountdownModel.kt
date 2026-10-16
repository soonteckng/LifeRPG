package expo.modules.sessioncountdown

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

internal const val FORMAT_VERSION = 1
internal const val MAX_JSON_BYTES = 16 * 1024
internal const val MAX_DURATION_MS = 28_800_000L
internal const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L

internal data class CountdownScope(val backendId: String, val ownerId: String) {
  fun json() = JSONObject().put("backendId", backendId).put("ownerId", ownerId)
}
internal data class CountdownIdentity(
  val scope: CountdownScope, val admissionEpoch: Long, val journalRevision: Long,
  val recordRevision: Long, val clientSessionId: String, val serverSessionId: String?
) {
  fun json() = JSONObject().put("scope", scope.json()).put("admissionEpoch", admissionEpoch)
    .put("journalRevision", journalRevision).put("recordRevision", recordRevision)
    .put("clientSessionId", clientSessionId).put("serverSessionId", serverSessionId ?: JSONObject.NULL)
  fun map(): Map<String, Any?> = mapOf("scope" to mapOf("backendId" to scope.backendId, "ownerId" to scope.ownerId),
    "admissionEpoch" to admissionEpoch, "journalRevision" to journalRevision, "recordRevision" to recordRevision,
    "clientSessionId" to clientSessionId, "serverSessionId" to serverSessionId)
  fun finishKey() = "${scope.backendId}:${scope.ownerId}:$clientSessionId"
}
internal data class CountdownClock(val wallMs: Long, val monotonicMs: Long?, val bootId: String?) {
  fun json() = JSONObject().put("wallTimeMs", wallMs).put("monotonicTimeMs", monotonicMs ?: JSONObject.NULL)
    .put("bootId", bootId ?: JSONObject.NULL)
}
internal data class CountdownProjection(
  val identity: CountdownIdentity, val phase: String, val title: String,
  val targetMs: Long, val remainingMs: Long, val elapsedMs: Long,
  val observedClock: CountdownClock, val deadlineMs: Long?, val clockWarning: Boolean,
  val showOngoing: Boolean, val scheduleFinishAlert: Boolean, val actions: List<String>, val resumeAtMs: Long? = null
) {
  fun json() = JSONObject().put("version", FORMAT_VERSION).put("identity", identity.json()).put("phase", phase)
    .put("title", title).put("targetMs", targetMs).put("remainingMs", remainingMs).put("elapsedMs", elapsedMs)
    .put("observedClock", observedClock.json()).put("deadlineMs", deadlineMs ?: JSONObject.NULL)
    .put("clockWarning", clockWarning).put("showOngoing", showOngoing).put("scheduleFinishAlert", scheduleFinishAlert)
    .put("foregroundActions", JSONArray(actions)).apply { if (resumeAtMs != null) put("resumeAtMs", resumeAtMs) }
  fun renderKey(): String = listOf(identity.json().toString(), phase, title, targetMs,
    if (phase == "running") deadlineMs else remainingMs, clockWarning, showOngoing,
    scheduleFinishAlert, resumeAtMs, actions.joinToString(",")).joinToString("|")
}
internal data class CountdownPreferences(val sound: Boolean = true, val haptics: Boolean = true) {
  fun json() = JSONObject().put("sound", sound).put("haptics", haptics)
}
internal data class CountdownAction(val operationId: String, val identity: CountdownIdentity, val kind: String) {
  fun json() = JSONObject().put("version", FORMAT_VERSION).put("identity", identity.json())
    .put("operationId", operationId).put("kind", kind)
  fun map(): Map<String, Any?> = mapOf("version" to FORMAT_VERSION, "identity" to identity.map(),
    "operationId" to operationId, "kind" to kind)
}
internal data class CountdownAnchor(val wallMs: Long, val elapsedMs: Long, val bootId: String, val deadlineElapsedMs: Long) {
  fun json() = JSONObject().put("wallMs", wallMs).put("elapsedMs", elapsedMs).put("bootId", bootId)
    .put("deadlineElapsedMs", deadlineElapsedMs)
}
internal data class CountdownState(
  val leaseId: String? = null, val scope: CountdownScope? = null, val cleared: Boolean = true,
  val retiredLeases: List<String> = emptyList(), val projection: CountdownProjection? = null,
  val preferences: CountdownPreferences = CountdownPreferences(), val anchor: CountdownAnchor? = null,
  val delivered: List<String> = emptyList(), val actions: List<CountdownAction> = emptyList()
) {
  fun json() = JSONObject().put("formatVersion", FORMAT_VERSION).put("leaseId", leaseId ?: JSONObject.NULL)
    .put("scope", scope?.json() ?: JSONObject.NULL).put("cleared", cleared).put("retiredLeases", JSONArray(retiredLeases))
    .put("projection", projection?.json() ?: JSONObject.NULL).put("preferences", preferences.json())
    .put("anchor", anchor?.json() ?: JSONObject.NULL).put("delivered", JSONArray(delivered))
    .put("actions", JSONArray().apply { actions.forEach { put(it.json()) } })
}

/** Narrow JSON boundary: no credentials, coercion, arbitrary object fields or oversized payloads. */
internal object CountdownParser {
  private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
  private val backend = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
  fun lease(value: String): String { require(uuid.matches(value)) { "Invalid renderer lease" }; return value }
  private fun objectText(text: String, maxBytes: Int = MAX_JSON_BYTES): JSONObject {
    require(text.toByteArray(Charsets.UTF_8).size <= maxBytes) { "Countdown payload too large" }
    val parser = JSONTokener(text)
    val value = parser.nextValue()
    require(value is JSONObject && parser.nextClean() == '\u0000') { "Invalid countdown JSON" }
    return value
  }
  private fun keys(item: JSONObject, vararg expected: String) {
    val actual = mutableSetOf<String>(); val iterator = item.keys()
    while (iterator.hasNext()) actual.add(iterator.next())
    require(actual == expected.toSet()) { "Unexpected countdown fields" }
  }
  private fun number(item: JSONObject, key: String, maximum: Long = MAX_SAFE_INTEGER, minimum: Long = 0): Long {
    val value = item.get(key)
    require(value is Number) { "Invalid countdown number" }
    val double = value.toDouble()
    require(double.isFinite() && double >= minimum && double <= maximum && double % 1.0 == 0.0) { "Invalid countdown number" }
    return double.toLong()
  }
  private fun text(item: JSONObject, key: String, maximum: Int, empty: Boolean = false, controls: Boolean = false): String {
    val value = item.get(key)
    require(value is String && value.length <= maximum && (empty || value.isNotEmpty())
      && (controls || value.none { it < ' ' || it == '\u007f' })) { "Invalid countdown text" }
    return value
  }
  private fun bool(item: JSONObject, key: String): Boolean {
    val value = item.get(key); require(value is Boolean) { "Invalid countdown boolean" }; return value
  }
  private fun nullableNumber(item: JSONObject, key: String) = if (item.isNull(key)) null else number(item, key)
  private fun nullableText(item: JSONObject, key: String, max: Int) = if (item.isNull(key)) null else text(item, key, max)
  fun scope(text: String) = scope(objectText(text, 1024))
  fun scope(item: JSONObject): CountdownScope {
    keys(item, "backendId", "ownerId")
    val value = CountdownScope(text(item, "backendId", 128), text(item, "ownerId", 36))
    require(backend.matches(value.backendId) && uuid.matches(value.ownerId)) { "Invalid countdown owner" }
    return value
  }
  fun identity(item: JSONObject): CountdownIdentity {
    keys(item, "scope", "admissionEpoch", "journalRevision", "recordRevision", "clientSessionId", "serverSessionId")
    val result = CountdownIdentity(scope(item.getJSONObject("scope")), number(item, "admissionEpoch"),
      number(item, "journalRevision"), number(item, "recordRevision"), text(item, "clientSessionId", 36),
      nullableText(item, "serverSessionId", 36))
    require(uuid.matches(result.clientSessionId) && (result.serverSessionId == null || uuid.matches(result.serverSessionId)))
    require(result.admissionEpoch > 0)
    return result
  }
  fun projection(text: String) = projection(objectText(text))
  fun projection(item: JSONObject): CountdownProjection {
    keys(item, "version", "identity", "phase", "title", "targetMs", "remainingMs", "elapsedMs", "observedClock",
      "deadlineMs", "clockWarning", "showOngoing", "scheduleFinishAlert", "foregroundActions", *if (item.has("resumeAtMs")) arrayOf("resumeAtMs") else emptyArray())
    require(number(item, "version") == FORMAT_VERSION.toLong())
    val clock = item.getJSONObject("observedClock"); keys(clock, "wallTimeMs", "monotonicTimeMs", "bootId")
    val observed = CountdownClock(number(clock, "wallTimeMs"), nullableNumber(clock, "monotonicTimeMs"), nullableText(clock, "bootId", 128))
    require((observed.monotonicMs == null) == (observed.bootId == null))
    val phases = setOf("running", "paused", "checking", "unconfirmed", "ending", "finished", "settled")
    val actions = item.getJSONArray("foregroundActions")
    require(actions.length() <= 2)
    val kinds = (0 until actions.length()).map { index ->
      val kind = actions.get(index); require(kind is String && kind in setOf("pause", "resume", "end")); kind as String
    }
    require(kinds.distinct().size == kinds.size)
    val result = CountdownProjection(identity(item.getJSONObject("identity")), text(item, "phase", 12),
      text(item, "title", 256, true, true), number(item, "targetMs", MAX_DURATION_MS, 1000),
      number(item, "remainingMs", MAX_DURATION_MS), number(item, "elapsedMs", MAX_DURATION_MS), observed,
      nullableNumber(item, "deadlineMs"), bool(item, "clockWarning"), bool(item, "showOngoing"),
      bool(item, "scheduleFinishAlert"), kinds, if (item.has("resumeAtMs")) number(item, "resumeAtMs") else null)
    require(result.phase in phases && result.remainingMs <= result.targetMs && result.elapsedMs <= result.targetMs)
    require(result.remainingMs + result.elapsedMs == result.targetMs)
    require(result.showOngoing == (result.phase == "running" || result.phase == "paused"))
    require(result.scheduleFinishAlert == (result.phase == "running"))
    require((result.deadlineMs != null) == (result.phase == "running"))
    if (result.phase == "running") require(result.remainingMs > 0 && result.deadlineMs == (result.resumeAtMs ?: observed.wallMs) + result.remainingMs && ("resume" !in kinds || result.resumeAtMs != null))
    if (result.resumeAtMs != null) require(result.phase == "running" && result.resumeAtMs > observed.wallMs && result.resumeAtMs - observed.wallMs <= 300000)
    if (result.phase == "paused") require("pause" !in kinds)
    if (result.phase !in setOf("running", "paused", "checking")) require(kinds.isEmpty())
    if (result.phase == "checking") require(kinds.all { it == "end" })
    return result
  }
  fun preferences(text: String) = preferences(objectText(text, 256))
  private fun preferences(item: JSONObject): CountdownPreferences {
    keys(item, "sound", "haptics"); return CountdownPreferences(bool(item, "sound"), bool(item, "haptics"))
  }
  fun action(item: JSONObject): CountdownAction {
    keys(item, "version", "identity", "operationId", "kind"); require(number(item, "version") == FORMAT_VERSION.toLong())
    val kind = text(item, "kind", 6); require(kind in setOf("pause", "resume", "end"))
    return CountdownAction(lease(text(item, "operationId", 36)), identity(item.getJSONObject("identity")), kind)
  }
  fun state(text: String): CountdownState {
    val item = objectText(text, 32 * 1024)
    keys(item, "formatVersion", "leaseId", "scope", "cleared", "retiredLeases", "projection", "preferences", "anchor", "delivered", "actions")
    require(number(item, "formatVersion") == FORMAT_VERSION.toLong())
    fun strings(key: String, max: Int, chars: Int): List<String> {
      val values = item.getJSONArray(key); require(values.length() <= max)
      return (0 until values.length()).map { index -> val value = values.get(index)
        require(value is String && value.length <= chars); value as String }
    }
    val currentLease = nullableText(item, "leaseId", 36)?.let { lease(it) }
    val owner = if (item.isNull("scope")) null else scope(item.getJSONObject("scope"))
    require((currentLease == null) == (owner == null))
    val current = if (item.isNull("projection")) null else projection(item.getJSONObject("projection"))
    require(current == null || current.identity.scope == owner)
    val anchor = if (item.isNull("anchor")) null else item.getJSONObject("anchor").let {
      keys(it, "wallMs", "elapsedMs", "bootId", "deadlineElapsedMs")
      CountdownAnchor(number(it, "wallMs"), number(it, "elapsedMs"), text(it, "bootId", 128), number(it, "deadlineElapsedMs"))
    }
    val issued = item.getJSONArray("actions"); require(issued.length() <= 2)
    val tokens = (0 until issued.length()).map { index -> action(issued.getJSONObject(index)) }
    require(tokens.all { it.identity == current?.identity && it.kind in (current?.actions ?: emptyList()) })
    val retired = strings("retiredLeases", 32, 36).map { lease(it) }
    val result = CountdownState(currentLease, owner, bool(item, "cleared"), retired, current,
      preferences(item.getJSONObject("preferences")), anchor, strings("delivered", 32, 240), tokens)
    require(!result.cleared || (current == null && anchor == null && tokens.isEmpty()))
    require(current?.phase != "running" || anchor != null)
    return result
  }
}
