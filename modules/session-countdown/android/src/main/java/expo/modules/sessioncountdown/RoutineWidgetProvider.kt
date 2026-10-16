package expo.modules.sessioncountdown

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log

class RoutineWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = safely { RoutineWidgetRepository(context).repair() }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) = safely { RoutineWidgetRepository(context).repair() }
  override fun onDeleted(context: Context, ids: IntArray) = safely { RoutineWidgetRepository(context).delete(ids) }
  override fun onRestored(context: Context, oldIds: IntArray, newIds: IntArray) = safely { RoutineWidgetRepository(context).restored(oldIds, newIds) }
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_USER_UNLOCKED, Intent.ACTION_MY_PACKAGE_REPLACED))
      safely { RoutineWidgetRepository(context).repair() }
  }
  private fun safely(action: () -> Unit) { try { action() } catch (_: Exception) { Log.w("LifeRPGRoutineWidget", "Widget unavailable; open LifeRPG to refresh its display.") } }
}

class RoutineWidgetPinReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try { RoutineWidgetRepository(context).acceptPin(intent) }
    catch (_: Exception) { Log.w("LifeRPGRoutineWidget", "Widget configuration could not be saved; sessions are unchanged.") }
  }
}
