package expo.modules.sessioncountdown

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.util.concurrent.Executors

class CountdownReceiver : BroadcastReceiver() {
  companion object { private val worker = Executors.newSingleThreadExecutor() }
  override fun onReceive(context: Context, intent: Intent) {
    val allowed = setOf(CountdownNotifications.ALARM_ACTION, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_USER_UNLOCKED,
      Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED")
    if (intent.action !in allowed) return
    val pending = goAsync()
    worker.execute {
      try {
        val repository = CountdownRepository(context.applicationContext)
        if (intent.action == CountdownNotifications.ALARM_ACTION) repository.onAlarm(intent) else repository.repair()
      } catch (_: Exception) {
        // Corrupt derived cache is retained. It does not prevent journal recovery.
        runCatching { CountdownNotifications(context.applicationContext).cancelAll() }
        Log.w("LifeRPGCountdown", "Countdown recovery needs the app; the session journal is unchanged.")
      } finally { pending.finish() }
    }
  }
}
