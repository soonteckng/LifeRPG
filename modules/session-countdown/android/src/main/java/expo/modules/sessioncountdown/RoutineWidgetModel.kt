package expo.modules.sessioncountdown

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

internal const val ROUTINE_WIDGET_VERSION = 1
internal const val MAX_WIDGETS = 64
internal data class WidgetRoutine(val id: String, val name: String, val durationSeconds: Long, val areaTitle: String, val color: String) {
  fun json() = JSONObject().put("id", id).put("name", name).put("durationSeconds", durationSeconds).put("areaTitle", areaTitle).put("color", color)
}
internal data class RoutineWidgetBinding(val widgetId: Int, val routineId: String? = null, val nonce: String? = null) {
  fun json() = JSONObject().put("widgetId", widgetId).put("routineId", routineId ?: JSONObject.NULL).put("nonce", nonce ?: JSONObject.NULL)
}
internal data class RoutineWidgetPin(val nonce: String, val routineId: String) {
  fun json() = JSONObject().put("nonce", nonce).put("routineId", routineId)
}
internal data class RoutineWidgetState(
  val leaseId: String? = null, val scope: CountdownScope? = null, val cleared: Boolean = true,
  val retiredLeases: List<String> = emptyList(), val routines: List<WidgetRoutine> = emptyList(),
  val bindings: List<RoutineWidgetBinding> = emptyList(), val pins: List<RoutineWidgetPin> = emptyList()
) {
  fun json() = JSONObject().put("version", ROUTINE_WIDGET_VERSION).put("leaseId", leaseId ?: JSONObject.NULL)
    .put("scope", scope?.json() ?: JSONObject.NULL).put("cleared", cleared).put("retiredLeases", JSONArray(retiredLeases))
    .put("routines", JSONArray().apply { routines.forEach { put(it.json()) } })
    .put("bindings", JSONArray().apply { bindings.forEach { put(it.json()) } })
    .put("pins", JSONArray().apply { pins.forEach { put(it.json()) } })
}
internal data class RoutineWidgetLaunch(val routineId: String, val scope: CountdownScope) {
  fun map(): Map<String, Any> = mapOf("routineId" to routineId, "scope" to mapOf("ownerId" to scope.ownerId, "backendId" to scope.backendId))
}

/** A small display catalogue, never credentials or session/XP storage. */
internal object RoutineWidgetParser {
  private val color = Regex("^#[0-9a-fA-F]{6}$")
  private fun json(text: String, maximum: Int): Any {
    require(text.toByteArray(Charsets.UTF_8).size <= maximum) { "Widget payload too large" }
    val parser = JSONTokener(text); val result = parser.nextValue()
    require(parser.nextClean() == '\u0000') { "Invalid widget JSON" }; return result
  }
  private fun keys(item: JSONObject, vararg expected: String) {
    val actual = mutableSetOf<String>(); val iterator = item.keys()
    while (iterator.hasNext()) actual.add(iterator.next())
    require(actual == expected.toSet()) { "Unexpected widget fields" }
  }
  private fun text(item: JSONObject, key: String, maximum: Int): String {
    val result = item.get(key)
    require(result is String && result.isNotBlank() && result.length <= maximum && result.none { it < ' ' || it == '\u007f' }) { "Invalid widget text" }
    return result
  }
  private fun uuid(item: JSONObject, key: String) = CountdownParser.lease(text(item, key, 36))
  private fun nullableUuid(item: JSONObject, key: String) = if (item.isNull(key)) null else uuid(item, key)
  private fun number(item: JSONObject, key: String, maximum: Long): Long {
    val result = item.get(key); require(result is Number)
    val value = result.toDouble(); require(value.isFinite() && value >= 1 && value <= maximum && value % 1 == 0.0)
    return value.toLong()
  }
  private fun routines(items: JSONArray): List<WidgetRoutine> {
    require(items.length() <= 32) { "Too many widget routines" }
    val result = (0 until items.length()).map { index ->
      val item = items.getJSONObject(index); keys(item, "id", "name", "durationSeconds", "areaTitle", "color")
      val tint = text(item, "color", 7); require(color.matches(tint))
      WidgetRoutine(uuid(item, "id"), text(item, "name", 120), number(item, "durationSeconds", 28_800), text(item, "areaTitle", 120), tint)
    }
    require(result.map { it.id }.distinct().size == result.size) { "Duplicate widget routine" }; return result
  }
  fun routines(text: String) = routines(json(text, 32 * 1024) as? JSONArray ?: error("Expected widget catalogue"))
  fun state(text: String): RoutineWidgetState {
    val item = json(text, 64 * 1024) as? JSONObject ?: error("Expected widget state")
    keys(item, "version", "leaseId", "scope", "cleared", "retiredLeases", "routines", "bindings", "pins")
    require(number(item, "version", ROUTINE_WIDGET_VERSION.toLong()) == ROUTINE_WIDGET_VERSION.toLong())
    val lease = nullableUuid(item, "leaseId")
    val scope = if (item.isNull("scope")) null else CountdownParser.scope(item.getJSONObject("scope"))
    require((lease == null) == (scope == null))
    val cleared = item.get("cleared"); require(cleared is Boolean)
    val retiredItems = item.getJSONArray("retiredLeases"); require(retiredItems.length() <= 32)
    val retired = (0 until retiredItems.length()).map { CountdownParser.lease(retiredItems.getString(it)) }
    require(retired.distinct().size == retired.size)
    require(cleared || lease !in retired) { "A retired widget lease cannot be active" }
    val catalogue = routines(item.getJSONArray("routines"))
    val widgets = item.getJSONArray("bindings"); require(widgets.length() <= MAX_WIDGETS)
    val bindings = (0 until widgets.length()).map { index ->
      val binding = widgets.getJSONObject(index); keys(binding, "widgetId", "routineId", "nonce")
      RoutineWidgetBinding(number(binding, "widgetId", Int.MAX_VALUE.toLong()).toInt(), nullableUuid(binding, "routineId"), nullableUuid(binding, "nonce"))
    }
    require(bindings.map { it.widgetId }.distinct().size == bindings.size)
    val pinItems = item.getJSONArray("pins"); require(pinItems.length() <= 16)
    val pins = (0 until pinItems.length()).map { index ->
      val pin = pinItems.getJSONObject(index); keys(pin, "nonce", "routineId"); RoutineWidgetPin(uuid(pin, "nonce"), uuid(pin, "routineId"))
    }
    val nonces = bindings.mapNotNull { it.nonce } + pins.map { it.nonce }
    require(nonces.distinct().size == nonces.size)
    require(bindings.all { it.nonce == null || catalogue.any { routine -> routine.id == it.routineId } })
    require(pins.all { pin -> catalogue.any { it.id == pin.routineId } })
    require(!cleared || (catalogue.isEmpty() && bindings.all { it.nonce == null } && pins.isEmpty()))
    require(scope != null || (catalogue.isEmpty() && nonces.isEmpty()))
    return RoutineWidgetState(lease, scope, cleared, retired, catalogue, bindings, pins)
  }
}
