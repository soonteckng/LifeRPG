package expo.modules.sessioncountdown

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.io.File

internal class CountdownNotifications(private val context: Context) {
  companion object {
    const val ALARM_ACTION = "expo.modules.sessioncountdown.EXPIRE"
    const val ONGOING_ID = 81_741
    const val FINISHED_ID = 81_742
    const val ONGOING_CHANNEL = "liferpg-session-countdown-v1"
  }
  private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun capabilities(): Map<String, Any> = mapOf("supported" to true, "notificationsGranted" to notificationsGranted(),
    "exactAlarms" to exactAlarms())
  fun notificationsGranted(): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()
    && (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
      == PackageManager.PERMISSION_GRANTED)
  fun exactAlarms(): Boolean = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()
  fun wallMs() = System.currentTimeMillis()
  fun elapsedMs() = SystemClock.elapsedRealtime()
  fun bootId(): String {
    val count = try { Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1) } catch (_: Exception) { -1 }
    if (count >= 0) return "boot-count:$count"
    val kernel = try { File("/proc/sys/kernel/random/boot_id").readText().trim() } catch (_: Exception) { "" }
    if (kernel.isNotEmpty()) return "boot-id:$kernel"
    // If unavailable, never pretend elapsed anchors survived a restart. The
    // bounded saved wall deadline repairs presentation; the server owns credit.
    return "boot-fallback:${(wallMs() - elapsedMs()) / 1000}"
  }

  private fun icon(): Int {
    val configured = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (configured != 0) configured else android.R.drawable.ic_lock_idle_alarm
  }
  private fun channelId(settings: CountdownPreferences) =
    "liferpg-session-finished-v1-${if (settings.sound) "sound" else "silent"}-${if (settings.haptics) "haptic" else "quiet"}"
  private fun ensureChannels(settings: CountdownPreferences) {
    if (Build.VERSION.SDK_INT < 26) return
    val ongoing = NotificationChannel(ONGOING_CHANNEL, "Session countdown", NotificationManager.IMPORTANCE_LOW)
    ongoing.setSound(null, null); ongoing.enableVibration(false); ongoing.setShowBadge(false)
    manager.createNotificationChannel(ongoing)
    val finish = NotificationChannel(channelId(settings), "Session finished", NotificationManager.IMPORTANCE_HIGH)
    finish.setSound(if (settings.sound) Settings.System.DEFAULT_NOTIFICATION_URI else null,
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
    finish.enableVibration(settings.haptics)
    if (settings.haptics) finish.vibrationPattern = longArrayOf(0, 350, 180, 350)
    manager.createNotificationChannel(finish)
  }
  private fun openIntent(nonce: String? = null): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    // Explicit MainActivity destination: no receiver/service notification trampoline.
    if (intent.component == null) return null
    intent.action = Intent.ACTION_VIEW
    intent.data = Uri.Builder().scheme("liferpg").authority("session")
      .apply { if (nonce != null) appendQueryParameter("countdownAction", nonce) }.build()
    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, nonce?.hashCode() ?: ONGOING_ID, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun alarmIntent(state: CountdownState?): PendingIntent {
    val intent = Intent(context, CountdownReceiver::class.java).setAction(ALARM_ACTION)
    if (state != null) {
      val identity = state.projection!!.identity
      intent.putExtra("leaseId", state.leaseId)
      intent.putExtra("clientSessionId", identity.clientSessionId)
      intent.putExtra("journalRevision", identity.journalRevision)
      intent.putExtra("recordRevision", identity.recordRevision)
      intent.putExtra("admissionEpoch", identity.admissionEpoch)
    }
    return PendingIntent.getBroadcast(context, ONGOING_ID, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  fun cancelAll() {
    alarms.cancel(alarmIntent(null))
    manager.cancel(ONGOING_ID); manager.cancel(FINISHED_ID)
  }
  fun cancelOngoing() { alarms.cancel(alarmIntent(null)); manager.cancel(ONGOING_ID) }

  fun render(state: CountdownState) {
    val projection = state.projection
    if (state.cleared || projection == null || !projection.showOngoing) { cancelOngoing(); return }
    val remaining = CountdownEngine.remaining(state, wallMs(), elapsedMs(), bootId())
    if (projection.phase == "running" && (remaining == 0L || projection.identity.finishKey() in state.delivered)) {
      cancelOngoing(); return
    }
    ensureChannels(state.preferences)
    if (projection.phase == "running") {
      val operation = alarmIntent(state)
      val deadline = state.anchor!!.deadlineElapsedMs
      try {
        if (exactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, operation)
        else alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, operation)
      } catch (_: SecurityException) {
        // Special access can be revoked between checking and scheduling.
        alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline, operation)
      }
    } else alarms.cancel(alarmIntent(null))
    if (!notificationsGranted()) return
    val title = projection.title.replace(Regex("[\\s\\p{Cntrl}]+"), " ").trim().take(100).ifEmpty { "Your session" }
    val breakMs = CountdownEngine.breakRemaining(state, wallMs(), elapsedMs(), bootId())
    val paused = projection.phase == "paused"
    val content = if (breakMs > 0) "Break · protection returns automatically" else if (paused) "Paused · ${formatRemaining(remaining)} remaining" else "Session in progress"
    val public = NotificationCompat.Builder(context, ONGOING_CHANNEL).setSmallIcon(icon())
      .setContentTitle("LifeRPG session").setContentText(if (paused) "Paused" else "Session in progress")
      .setSilent(true).setOngoing(true).setOnlyAlertOnce(true)
    val builder = NotificationCompat.Builder(context, ONGOING_CHANNEL).setSmallIcon(icon()).setContentTitle(title)
      .setContentText(content).setColor(0xFFAAB3FF.toInt()).setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
      .setCategory(Notification.CATEGORY_PROGRESS).setVisibility(Notification.VISIBILITY_PRIVATE)
    openIntent()?.let { builder.setContentIntent(it) }
    if (!paused) {
      // setWhen is converted by Android to its system chronometer base. The OS
      // updates seconds without running JavaScript or posting each second.
      val displayDeadline = CountdownEngine.chronometerWhen(wallMs(), if (breakMs > 0) breakMs else remaining)
      builder.setWhen(displayDeadline).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
      public.setWhen(displayDeadline).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
      if (Build.VERSION.SDK_INT >= 26) {
        val lifetime = remaining + breakMs
        builder.setTimeoutAfter(lifetime.coerceAtLeast(1)); public.setTimeoutAfter(lifetime.coerceAtLeast(1))
      }
    } else {
      builder.setUsesChronometer(false).setShowWhen(false)
        .setProgress(projection.targetMs.toInt(), (projection.targetMs - remaining).toInt(), false)
      public.setUsesChronometer(false).setShowWhen(false)
    }
    builder.setPublicVersion(public.build())
    state.actions.filter { it.kind != "resume" || projection.resumeAtMs == null || breakMs > 0 }.forEach { action ->
      openIntent(action.operationId)?.let { pending ->
        val label = when (action.kind) { "pause" -> "Break in app"; "resume" -> if (breakMs > 0) "End break in app" else "Resume in app"; else -> "End in app" }
        builder.addAction(NotificationCompat.Action.Builder(0, label, pending).build())
      }
    }
    try { manager.notify(ONGOING_ID, builder.build()) } catch (_: SecurityException) { /* Permission denied: timer still works. */ }
  }

  fun finished(state: CountdownState) {
    cancelOngoing()
    if (!notificationsGranted()) return
    ensureChannels(state.preferences)
    val public = NotificationCompat.Builder(context, channelId(state.preferences)).setSmallIcon(icon())
      .setContentTitle("Time well spent").setContentText("Your session is finished. Open LifeRPG to see your progress.").build()
    val builder = NotificationCompat.Builder(context, channelId(state.preferences)).setSmallIcon(icon())
      .setContentTitle("Time well spent").setContentText("Your session is finished. Open LifeRPG to see your progress.")
      .setColor(0xFFAAB3FF.toInt()).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(public).setCategory(Notification.CATEGORY_REMINDER).setPriority(NotificationCompat.PRIORITY_HIGH)
    openIntent()?.let { builder.setContentIntent(it) }
    if (Build.VERSION.SDK_INT < 26) {
      if (state.preferences.sound) builder.setSound(Settings.System.DEFAULT_NOTIFICATION_URI)
      if (state.preferences.haptics) builder.setVibrate(longArrayOf(0, 350, 180, 350))
    }
    try { manager.notify(FINISHED_ID, builder.build()) } catch (_: SecurityException) { /* Best effort OS alert only. */ }
  }
  private fun formatRemaining(ms: Long): String {
    val seconds = (ms + 999) / 1000
    return if (seconds >= 3600) "%d:%02d:%02d".format(seconds / 3600, seconds / 60 % 60, seconds % 60)
      else "%d:%02d".format(seconds / 60, seconds % 60)
  }
}
