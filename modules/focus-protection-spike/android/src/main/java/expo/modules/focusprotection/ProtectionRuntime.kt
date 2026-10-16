package expo.modules.focusprotection

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.os.SystemClock
import android.provider.Settings

/** Local protection projection. Never reads or writes rewards or the session journal. */
object ProtectionRuntime {
  private val gate = ProtectionLeaseGate()
  private var storage: android.content.SharedPreferences? = null
  fun attach(context: Context) { if (storage == null) storage = context.getSharedPreferences("liferpg_session_protection_v2", Context.MODE_PRIVATE) }
  val current get() = gate.current
  val status get() = gate.status
  val covers get() = gate.covers
  fun install(lease: ProtectionLease): Boolean {
    if (!gate.install(lease)) return false
    if (storage?.edit()?.putString("id", lease.id)?.putString("scope", lease.scope)?.putString("status", "active")?.commit() != true) {
      gate.finish(lease.id, "interrupted"); return false
    }
    return true
  }
  fun takeBreak(id: String, duration: Long): Boolean = gate.takeBreak(id, SystemClock.elapsedRealtime(), duration)
  fun endBreak(id: String): Boolean = gate.endBreak(id, SystemClock.elapsedRealtime())
  fun active(id: String) = gate.active(id)
  fun covered(id: String) = gate.covered(id)
  fun finish(id: String, reason: String) {
    gate.finish(id, reason)
    if (storage?.getString("id", null) == id) storage?.edit()?.putString("status", reason)?.commit()
  }
  fun state(): Map<String, Any?> {
    if (gate.current != null) return gate.snapshot(SystemClock.elapsedRealtime())
    val saved = storage ?: return gate.snapshot(SystemClock.elapsedRealtime())
    val savedScope = saved.getString("scope", null) ?: return gate.snapshot(SystemClock.elapsedRealtime())
    // A dead service is never silently restored after force-stop, reboot or OS eviction.
    val status = saved.getString("status", "interrupted").let { if (it == "active") "interrupted" else it }
    return mapOf("id" to null, "scope" to savedScope, "status" to status, "secondsLeft" to 0, "covers" to 0)
  }
  fun usageAllowed(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
  }
  fun notificationsAllowed(context: Context): Boolean {
    val manager = context.getSystemService(android.app.NotificationManager::class.java)
    return manager.areNotificationsEnabled() && (manager.getNotificationChannel("liferpg_protection_preview")?.importance ?: 2) != 0
  }
  fun ready(context: Context) = Settings.canDrawOverlays(context) && usageAllowed(context) && notificationsAllowed(context)
  /** Service startup needs package names only; label loading belongs to the chooser. */
  fun appCatalog(context: Context): ProtectionAppCatalog {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val packages = context.packageManager.queryIntentActivities(intent, 0).mapNotNull { it.activityInfo?.packageName }
    return ProtectionAppPolicy.catalog(packages, essentials(context))
  }
  fun launchable(context: Context): List<Map<String, String>> {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val safety = essentials(context)
    return context.packageManager.queryIntentActivities(intent, 0).mapNotNull { result ->
      val info = result.activityInfo?.applicationInfo ?: return@mapNotNull null
      // Bundled browsers, video players and social apps are still distractions.
      if (info.packageName in safety) null
      else mapOf("packageName" to info.packageName, "label" to result.loadLabel(context.packageManager).toString().take(80))
    }.distinctBy { it["packageName"] }.sortedBy { it["label"]?.lowercase() }
  }
  fun essentials(context: Context): Set<String> {
    val pm = context.packageManager
    val intents = listOf(Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:")), Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))
    return ProtectionAppPolicy.essentials(context.packageName,
      intents.flatMap { pm.queryIntentActivities(it, 0).map { item -> item.activityInfo.packageName } })
  }
}
