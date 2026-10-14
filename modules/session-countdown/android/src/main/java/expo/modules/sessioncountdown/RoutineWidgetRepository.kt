package expo.modules.sessioncountdown

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.RemoteViews
import java.util.UUID

/** Separate projection store. Never reads AsyncStorage, credentials or the session journal. */
internal class RoutineWidgetRepository(context: Context) {
  companion object { private val lock = Any(); const val PIN_ACTION = "expo.modules.sessioncountdown.PIN_ROUTINE_WIDGET" }
  private val context = context.applicationContext
  private val preferences = this.context.getSharedPreferences("liferpg-routine-widget-v1", Context.MODE_PRIVATE)
  private val manager = AppWidgetManager.getInstance(this.context)
  private val provider = ComponentName(this.context, RoutineWidgetProvider::class.java)
  private fun nonce() = UUID.randomUUID().toString()
  private fun read(): RoutineWidgetState {
    val text = preferences.getString("projection", null) ?: return RoutineWidgetState()
    // Preserve invalid bytes and fail closed rather than replacing proof with
    // an empty catalogue which could be mistaken for a verified logout.
    return RoutineWidgetParser.state(text)
  }
  private fun write(state: RoutineWidgetState) {
    val text = state.json().toString(); require(text.toByteArray(Charsets.UTF_8).size <= 64 * 1024)
    check(preferences.edit().putString("projection", text).commit()) { "Widget projection could not be saved" }
  }
  private fun widgets(state: RoutineWidgetState): RoutineWidgetState =
    RoutineWidgetPolicy.widgets(state, manager.getAppWidgetIds(provider).toList(), ::nonce)
  private fun render(state: RoutineWidgetState) {
    for (binding in state.bindings) {
      try { manager.updateAppWidget(binding.widgetId, view(state, binding)) }
      catch (_: Exception) { Log.w("LifeRPGRoutineWidget", "Widget display could not be refreshed; sessions are unchanged.") }
    }
  }
  fun activate(leaseId: String, scopeJson: String): Boolean = synchronized(lock) {
    val old = read(); val decision = RoutineWidgetPolicy.activate(old, leaseId, CountdownParser.scope(scopeJson))
    if (!decision.accepted) return@synchronized false
    val state = widgets(decision.state); write(state); render(state); true
  }
  fun publish(leaseId: String, routinesJson: String): Boolean = synchronized(lock) {
    CountdownParser.lease(leaseId)
    val decision = RoutineWidgetPolicy.publish(read(), leaseId, RoutineWidgetParser.routines(routinesJson))
    if (!decision.accepted) return@synchronized false
    val state = widgets(decision.state); write(state); render(state); true
  }
  fun clear(leaseId: String): Boolean = synchronized(lock) {
    CountdownParser.lease(leaseId)
    val decision = RoutineWidgetPolicy.clear(read(), leaseId)
    if (!decision.accepted) return@synchronized false
    val state = widgets(decision.state); write(state); render(state); true
  }
  fun consume(scopeJson: String, token: String): Map<String, Any>? = synchronized(lock) {
    if (runCatching { CountdownParser.lease(token) }.isFailure) return@synchronized null
    val scope = CountdownParser.scope(scopeJson)
    val old = read()
    val issued = old.bindings.firstOrNull { it.nonce == token } ?: return@synchronized null
    // A stale URI from a removed widget has no authority even if its deletion
    // broadcast has not run yet.
    if (manager.getAppWidgetInfo(issued.widgetId)?.provider != provider) return@synchronized null
    val (state, launch) = RoutineWidgetPolicy.consume(old, scope, token, ::nonce)
    if (launch == null) return@synchronized null
    write(state); render(state); launch.map()
  }
  fun pin(leaseId: String, routineId: String): Boolean = synchronized(lock) {
    CountdownParser.lease(leaseId); CountdownParser.lease(routineId)
    if (Build.VERSION.SDK_INT < 26 || !manager.isRequestPinAppWidgetSupported) return@synchronized false
    val (prepared, token) = RoutineWidgetPolicy.preparePin(read(), leaseId, routineId, ::nonce)
    if (token == null) return@synchronized false
    write(prepared)
    val intent = Intent(context, RoutineWidgetPinReceiver::class.java).setAction(PIN_ACTION)
      .setData(Uri.Builder().scheme("liferpg-widget-pin").authority(token).build())
    // The launcher must fill EXTRA_APPWIDGET_ID. This mutable PendingIntent has
    // an explicit, non-exported receiver and an unpredictable persisted proof;
    // its destination cannot be redirected to another component.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
    val callback = PendingIntent.getBroadcast(context, token.hashCode(), intent, flags)
    val preview = view(prepared, RoutineWidgetBinding(0, routineId))
    val extras = Bundle().apply { putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, preview) }
    val supported = try { manager.requestPinAppWidget(provider, extras, callback) } catch (_: IllegalStateException) { false }
    if (!supported) { write(RoutineWidgetPolicy.cancelPin(read(), token)); callback.cancel() }
    supported
  }
  fun acceptPin(intent: Intent): Boolean = synchronized(lock) {
    if (intent.action != PIN_ACTION) return@synchronized false
    val uri = intent.data ?: return@synchronized false
    if (uri.scheme != "liferpg-widget-pin" || !uri.isHierarchical || !uri.path.isNullOrEmpty()
      || uri.query != null || uri.fragment != null) return@synchronized false
    val token = uri.authority ?: return@synchronized false
    if (runCatching { CountdownParser.lease(token) }.isFailure) return@synchronized false
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (widgetId <= 0 || manager.getAppWidgetInfo(widgetId)?.provider != provider) return@synchronized false
    val (state, accepted) = RoutineWidgetPolicy.bindPin(read(), token, widgetId, ::nonce)
    if (!accepted) return@synchronized false
    val repaired = widgets(state); write(repaired); render(repaired); true
  }
  fun repair() = synchronized(lock) { val state = widgets(read()); write(state); render(state) }
  fun delete(ids: IntArray) = synchronized(lock) { val state = RoutineWidgetPolicy.delete(read(), ids.toList()); write(state) }
  fun restored(oldIds: IntArray, newIds: IntArray) = synchronized(lock) {
    // Backups do not carry start authority to a new widget id/device. Recreate
    // bindings from the current locally verified catalogue and rotate tokens.
    val state = widgets(RoutineWidgetPolicy.delete(read(), oldIds.toList() + newIds.toList())); write(state); render(state)
  }
  private fun openIntent(widgetId: Int, token: String?): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    if (intent.component == null) return null
    intent.action = Intent.ACTION_VIEW
    intent.data = if (token == null) Uri.parse("liferpg://") else
      Uri.Builder().scheme("liferpg").authority("routine-start").appendQueryParameter("widgetNonce", token).build()
    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    // A direct activity PendingIntent, never a notification/widget trampoline.
    return PendingIntent.getActivity(context, widgetId, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun view(state: RoutineWidgetState, binding: RoutineWidgetBinding): RemoteViews {
    val routine = if (!state.cleared) state.routines.firstOrNull { it.id == binding.routineId } else null
    val views = RemoteViews(context.packageName, R.layout.liferpg_routine_widget)
    val duration = routine?.let { duration(it.durationSeconds) } ?: "Your next step, close by"
    views.setTextViewText(R.id.liferpg_widget_area, routine?.areaTitle ?: "LIFERPG")
    views.setTextColor(R.id.liferpg_widget_area, routine?.let { Color.parseColor(it.color) } ?: 0xFFBBB5FF.toInt())
    views.setTextViewText(R.id.liferpg_widget_name, routine?.name ?: "Make room for what matters")
    views.setTextViewText(R.id.liferpg_widget_duration, duration)
    views.setTextViewText(R.id.liferpg_widget_start, if (routine != null) "Start routine  ›" else "Open LifeRPG  ›")
    views.setContentDescription(R.id.liferpg_widget_start,
      if (routine != null) "Start ${routine.name}, $duration, ${routine.areaTitle}" else "Open LifeRPG to choose a routine")
    views.setContentDescription(R.id.liferpg_widget_root,
      if (routine != null) "${routine.name}. $duration. ${routine.areaTitle}." else "LifeRPG. Open the app to choose a routine.")
    openIntent(binding.widgetId, binding.nonce)?.let { pending ->
      views.setOnClickPendingIntent(R.id.liferpg_widget_start, pending)
      views.setOnClickPendingIntent(R.id.liferpg_widget_root, pending)
    }
    return views
  }
  private fun duration(seconds: Long): String = when {
    seconds % 3600 == 0L -> "${seconds / 3600} ${if (seconds == 3600L) "hour" else "hours"}"
    seconds % 60 == 0L -> "${seconds / 60} min"
    seconds < 60 -> "$seconds sec"
    else -> "${seconds / 60} min ${seconds % 60} sec"
  }
}
