package expo.modules.focusprotection

import org.json.JSONObject

const val PROTECTION_VERSION = 3
const val MAX_TEST_SECONDS = 600
const val MAX_SESSION_SECONDS = 480 * 60
data class ProtectionLease(val id: String, val scope: String, val title: String, val seconds: Int,
  val mode: String, val allowed: Set<String>, val startedElapsed: Long,
  val breakStarted: Long? = null, val breakEnds: Long? = null) {
  fun breakRemaining(now: Long): Long = if (breakEnds != null && breakStarted != null && now >= breakStarted) (breakEnds - now).coerceAtLeast(0) else 0
  fun remaining(now: Long): Int {
    if (now < startedElapsed) return 0
    val pause = if (breakStarted != null && breakEnds != null && now >= breakStarted) minOf(now, breakEnds) - breakStarted else 0
    val worked = (now - startedElapsed - pause).coerceAtLeast(0)
    return if (worked >= seconds * 1000L) 0 else seconds - (worked / 1000).toInt()
  }
}
data class ProtectionAppCatalog(val apps: Set<String>, val essentials: Set<String>)
/** Safety is a package/role decision, never a blanket exemption for bundled apps. */
object ProtectionAppPolicy {
  private val safetyPackages = setOf("android", "com.android.settings", "com.android.systemui", "com.android.phone",
    "com.android.emergency", "com.android.server.telecom", "com.android.telecom", "com.samsung.android.incallui",
    "com.google.android.dialer", "com.android.permissioncontroller", "com.google.android.permissioncontroller",
    "com.android.packageinstaller", "com.google.android.packageinstaller", "com.samsung.android.packageinstaller",
    "com.sec.android.emergencymode.service", "com.sec.android.app.safetyassurance", "com.samsung.android.app.sos")
  fun essentials(ownPackage: String, resolvedSafetyApps: Collection<String>): Set<String> = safetyPackages + ownPackage + resolvedSafetyApps
  fun catalog(launchablePackages: Collection<String>, essentials: Set<String>): ProtectionAppCatalog =
    ProtectionAppCatalog(launchablePackages.filterNot { it in essentials }.toSet(), essentials)
}
/** A pause is not proof that another app is visible (notably a cancelled Home
 * or Recents gesture). Only a resumed destination replaces the app underneath.
 * Launcher/System UI pauses return to that app even on devices which omit its
 * second RESUMED event after cancelling the gesture. */
class ProtectionForegroundTracker(private val transientPackages: Set<String>) {
  private data class Activity(val pkg: String, val name: String?)
  private var foreground: Activity? = null
  private var application: Activity? = null
  val packageName: String? get() = foreground?.pkg
  fun resumed(pkg: String, name: String?) {
    val activity = Activity(pkg, name)
    foreground = activity
    if (pkg !in transientPackages) application = activity
  }
  fun paused(pkg: String, name: String?) {
    val current = foreground ?: return
    if (pkg in transientPackages && current.pkg == pkg && (name == null || current.name == null || current.name == name)) foreground = application
  }
}
object ProtectionPolicy {
  fun parse(raw: String, elapsed: Long): ProtectionLease {
    require(raw.length <= 24_000 && elapsed >= 0)
    val json = JSONObject(raw)
    val keys = setOf("version", "id", "scope", "title", "seconds", "mode", "allowed")
    require(json.keys().asSequence().toSet() == keys && json.get("version") in listOf(1, 2, PROTECTION_VERSION))
    require(listOf("id", "scope", "title", "mode").all { json.get(it) is String })
    val id = json.getString("id"); val scope = json.getString("scope"); val title = json.getString("title")
    require(id.matches(Regex("[a-zA-Z0-9-]{16,80}")) && scope.length in 1..512 && title.length in 1..120)
    val seconds = json.getInt("seconds")
    val maximum = if (json.getInt("version") == 1) MAX_TEST_SECONDS else MAX_SESSION_SECONDS
    require(json.get("seconds") is Int && seconds in 1..maximum)
    val mode = json.getString("mode"); require(mode == "allow-list" || mode == "essentials")
    val items = json.getJSONArray("allowed"); require(items.length() <= 64)
    val allowed = (0 until items.length()).map { require(items.get(it) is String); items.getString(it) }.toSet()
    require(allowed.all { it.matches(Regex("[a-zA-Z_][a-zA-Z0-9_]*(\\.[a-zA-Z_][a-zA-Z0-9_]*)+")) })
    require(mode != "essentials" || allowed.isEmpty())
    return ProtectionLease(id, scope, title, seconds, mode, allowed, elapsed)
  }
  fun shouldCover(lease: ProtectionLease, pkg: String?, essentials: Set<String>, userApps: Set<String>, elapsed: Long): Boolean {
    if (lease.breakRemaining(elapsed) > 0 || lease.remaining(elapsed) <= 0 || pkg == null || pkg !in userApps || pkg in essentials) return false
    return lease.mode == "essentials" || pkg !in lease.allowed
  }
  fun sameLease(current: ProtectionLease?, id: String) = current != null && current.id == id
}
class ProtectionLeaseGate {
  @Volatile var current: ProtectionLease? = null
    private set
  @Volatile var status = "idle"
    private set
  @Volatile var covers = 0
    private set
  @Volatile var lastScope: String? = null
    private set
  private val retired = linkedSetOf<String>()
  @Synchronized fun install(lease: ProtectionLease): Boolean {
    if (lease.id in retired) return false
    if (current != null) return current == lease
    current = lease; lastScope = lease.scope; status = "starting"; covers = 0; return true
  }
  @Synchronized fun takeBreak(id: String, now: Long, duration: Long): Boolean {
    val lease = current ?: return false
    if (lease.id != id || duration !in 1..300000 || lease.remaining(now) <= 0) return false
    if (lease.breakStarted != null) return lease.breakRemaining(now) > 0
    current = lease.copy(breakStarted = now, breakEnds = now + duration); status = "active"; return true
  }
  @Synchronized fun endBreak(id: String, now: Long): Boolean {
    val lease = current ?: return false
    if (lease.id != id || lease.breakRemaining(now) <= 0) return false
    current = lease.copy(breakEnds = now); return true
  }
  @Synchronized fun active(id: String) { if (ProtectionPolicy.sameLease(current, id)) status = "active" }
  @Synchronized fun covered(id: String) { if (ProtectionPolicy.sameLease(current, id)) covers++ }
  @Synchronized fun finish(id: String, reason: String) {
    // End also retires a start whose main-thread delivery has not arrived yet.
    retired.add(id); while (retired.size > 64) retired.remove(retired.first())
    if (ProtectionPolicy.sameLease(current, id)) { current = null; status = reason; covers = 0 }
  }
  @Synchronized fun snapshot(elapsed: Long): Map<String, Any?> {
    val lease = current
    return mapOf("id" to lease?.id, "scope" to (lease?.scope ?: lastScope), "status" to status,
      "secondsLeft" to (lease?.remaining(elapsed) ?: 0), "covers" to covers)
  }
}
