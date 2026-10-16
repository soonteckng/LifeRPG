package expo.modules.sessioncountdown

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RoutineWidgetParserTest {
  private val id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
  private fun routine() = WidgetRoutine(id, "Review notes", 1500, "Learning", "#AAB3FF").json()
  private fun rejected(text: String) { try { RoutineWidgetParser.routines(text); fail("Invalid catalogue accepted") } catch (_: IllegalArgumentException) {} }
  @Test fun completeCatalogueRoundTripsAndEmptyCatalogueIsAllowed() {
    assertEquals(1500L, RoutineWidgetParser.routines(JSONArray().put(routine()).toString()).single().durationSeconds)
    assertTrue(RoutineWidgetParser.routines("[]").isEmpty())
    assertEquals(RoutineWidgetState(), RoutineWidgetParser.state(RoutineWidgetState().json().toString()))
  }
  @Test fun unknownFieldsCoercionAndInvalidTextAreRejected() {
    for (bad in listOf(routine().put("credentials", "no"), routine().put("durationSeconds", "1500"),
      routine().put("durationSeconds", 1.5), routine().put("durationSeconds", 28801), routine().put("durationSeconds", 0),
      routine().put("id", "../session"), routine().put("color", "red"), routine().put("name", " "),
      routine().put("name", "line\nbreak"), routine().put("areaTitle", "x".repeat(121)))) rejected(JSONArray().put(bad).toString())
  }
  @Test fun duplicatesOversizeCatalogueAndTrailingJSONAreRejected() {
    rejected(JSONArray().put(routine()).put(routine()).toString())
    val many = JSONArray(); repeat(33) { many.put(routine().put("id", "00000000-0000-4000-8000-%012d".format(it))) }; rejected(many.toString())
    rejected("[]{}"); rejected("[\"${"x".repeat(33000)}\"]")
  }
  @Test fun thirtyTwoBoundedRoutinesAndExactMaximumDurationAreAccepted() {
    val many = JSONArray(); repeat(32) { many.put(routine().put("id", "00000000-0000-4000-8000-%012d".format(it)).put("durationSeconds", 28800)) }
    assertEquals(32, RoutineWidgetParser.routines(many.toString()).size)
  }
  @Test fun persistedUnboundOrClearedTokenCannotBecomeStartAuthority() {
    val state = RoutineWidgetState().json().put("bindings", JSONArray().put(JSONObject().put("widgetId", 1).put("routineId", id).put("nonce", id)))
    try { RoutineWidgetParser.state(state.toString()); fail("Unbound token accepted") } catch (_: IllegalArgumentException) {}
    val unsupported = RoutineWidgetState().json().put("version", 2)
    try { RoutineWidgetParser.state(unsupported.toString()); fail("Unknown version accepted") } catch (_: IllegalArgumentException) {}
  }
}
