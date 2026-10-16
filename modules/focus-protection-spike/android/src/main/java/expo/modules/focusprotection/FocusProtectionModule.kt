package expo.modules.focusprotection

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FocusProtectionModule : Module() {
  private val context: Context get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()
  private var connectivity: ConnectivityObserver? = null
  private fun network() = connectivity ?: ConnectivityObserver(context) { sendEvent("onConnectivityChanged", it) }.also { connectivity = it }
  private fun visibleActivity() = appContext.currentActivity?.takeIf { it.hasWindowFocus() }
    ?: throw IllegalStateException("Open LifeRPG before starting protection or changing permissions.")
  override fun definition() = ModuleDefinition {
    Name("LifeRPGFocusProtectionSpike")
    Constant("formatVersion") { PROTECTION_VERSION }
    Events("onConnectivityChanged")
    OnCreate { ProtectionRuntime.attach(context) }
    AsyncFunction("networkStatus") { network().snapshot() }
    OnStartObserving { network().start() }
    OnStopObserving { connectivity?.stop() }
    AsyncFunction("capabilities") { mapOf("supported" to (Build.VERSION.SDK_INT >= 26),
      "usage" to ProtectionRuntime.usageAllowed(context), "overlay" to Settings.canDrawOverlays(context), "notifications" to ProtectionRuntime.notificationsAllowed(context)) }
    AsyncFunction("apps") { ProtectionRuntime.launchable(context) }
    AsyncFunction("state") { ProtectionRuntime.state() }
    AsyncFunction("openPermission") { kind: String ->
      val activity = visibleActivity()
      require(kind == "usage" || kind == "overlay")
      val action = if (kind == "usage") Settings.ACTION_USAGE_ACCESS_SETTINGS else Settings.ACTION_MANAGE_OVERLAY_PERMISSION
      val intent = Intent(action, Uri.parse("package:${context.packageName}"))
      try { activity.startActivity(intent) }
      catch (_: android.content.ActivityNotFoundException) { activity.startActivity(Intent(action)) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("start") { json: String ->
      visibleActivity()
      check(Build.VERSION.SDK_INT >= 26 && ProtectionRuntime.ready(context)) { "Allow Usage Access, Display over other apps and notifications before enabling protection." }
      check(ProtectionService.canStart()) { "The previous protection session is stopping. Try again in a moment." }
      val lease = ProtectionPolicy.parse(json, SystemClock.elapsedRealtime())
      check(ProtectionRuntime.install(lease)) { "Protection is already active. Stop it before starting another." }
      try { context.startForegroundService(Intent(context, ProtectionService::class.java).putExtra("lease", lease.id)) }
      catch (error: Exception) { ProtectionRuntime.finish(lease.id, "interrupted"); throw error }
      ProtectionRuntime.state()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("takeBreak") { id: String, duration: Double ->
      require(duration.isFinite() && duration % 1.0 == 0.0 && duration in 1.0..300000.0)
      check(ProtectionRuntime.takeBreak(id, duration.toLong())) { "This break is no longer available." }
      ProtectionRuntime.state()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("endBreak") { id: String -> ProtectionRuntime.endBreak(id); ProtectionRuntime.state() }.runOnQueue(Queues.MAIN)
    AsyncFunction("stop") { id: String -> ProtectionService.stop(context, id, "stopped"); ProtectionRuntime.state() }.runOnQueue(Queues.MAIN)
    AsyncFunction("pause") { id: String -> ProtectionService.stop(context, id, "paused"); ProtectionRuntime.state() }.runOnQueue(Queues.MAIN)
    // React reload/recents removal must not cancel a still-running native session lease.
    OnDestroy { connectivity?.stop(); connectivity = null }
  }
}
