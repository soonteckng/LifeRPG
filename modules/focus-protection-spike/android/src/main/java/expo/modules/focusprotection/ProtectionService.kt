package expo.modules.focusprotection

import android.animation.ValueAnimator
import android.app.*
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.*
import android.os.Process
import android.view.Gravity
import android.view.WindowManager
import android.widget.*

/** Session-bound protection. It has no database or reward mutation path. */
class ProtectionService : Service() {
  companion object {
    private const val CHANNEL = "liferpg_protection_preview"
    private const val NOTIFICATION = 84103
    private var instance: ProtectionService? = null
    fun canStart() = instance == null
    fun stop(context: Context, id: String, reason: String) {
      val work = Runnable {
        val service = instance
        if (service != null) service.finish(id, reason) else ProtectionRuntime.finish(id, reason)
      }
      if (Looper.myLooper() == Looper.getMainLooper()) work.run() else Handler(Looper.getMainLooper()).post(work)
    }
  }
  private val handler = Handler(Looper.getMainLooper())
  private val monitorThread = HandlerThread("LifeRPGSessionProtection", Process.THREAD_PRIORITY_BACKGROUND)
  private lateinit var monitor: Handler
  @Volatile private var leaseId: String? = null
  private var overlay: LinearLayout? = null
  private var remainingText: TextView? = null
  private var foreground = ProtectionForegroundTracker(emptySet())
  private var wasOnBreak = false
  private var lastQuery = 0L
  private var userApps: Set<String> = emptySet()
  private var essentials: Set<String> = emptySet()
  private val wm by lazy { getSystemService(Context.WINDOW_SERVICE) as WindowManager }
  override fun onCreate() { super.onCreate(); ProtectionRuntime.attach(this); monitorThread.start(); monitor = Handler(monitorThread.looper); instance = this }
  override fun onBind(intent: Intent?) = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra("lease")
    if (intent?.action == "stop") {
      if (id != null) finish(id, "stopped")
      if (leaseId == null) stopSelf(startId)
      return START_NOT_STICKY
    }
    val lease = ProtectionRuntime.current
    if (lease == null || lease.id != id) { stopSelf(startId); return START_NOT_STICKY }
    try {
      leaseId = lease.id
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Session protection", NotificationManager.IMPORTANCE_LOW).apply {
        description = "App protection for your running session, with an always available End session control"
        setSound(null, null); enableVibration(false)
      })
      val end = PendingIntent.getActivity(this, lease.id.hashCode(), appIntent(true, lease.scope), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val open = PendingIntent.getActivity(this, 84104, appIntent(), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val notification = Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle("Your session is protected").setContentText("${lease.title} · tap to return to your session")
        .setOngoing(true).setOnlyAlertOnce(true).setContentIntent(open)
        .addAction(Notification.Action.Builder(null, "End session…", end).build()).build()
      // The declared specialUse type is selected from the manifest on Android 14+.
      startForeground(NOTIFICATION, notification)
      // Package-manager scans may be slow. Keep them off Android's UI thread and
      // never load app labels for monitoring. End can retire this lease meanwhile.
      val queryFrom = System.currentTimeMillis() - 1000
      monitor.removeCallbacks(tick)
      monitor.post {
        if (leaseId != lease.id || !ProtectionPolicy.sameLease(ProtectionRuntime.current, lease.id)) return@post
        try {
          val catalog = ProtectionRuntime.appCatalog(this)
          if (leaseId != lease.id || !ProtectionPolicy.sameLease(ProtectionRuntime.current, lease.id)) return@post
          userApps = catalog.apps; essentials = catalog.essentials
          // Include app changes made while the inventory was loading, rather
          // than leaving an already-open distraction undetected until a switch.
          foreground = ProtectionForegroundTracker(ProtectionRuntime.transientSurfaces(this))
          lastQuery = queryFrom
          ProtectionRuntime.active(lease.id)
          tick.run()
        } catch (_: Exception) { finish(lease.id, "interrupted") }
      }
    } catch (_: Exception) { finish(lease.id, "interrupted") }
    return START_NOT_STICKY
  }
  private val tick = object : Runnable {
    override fun run() {
      val lease = ProtectionRuntime.current
      if (lease == null || lease.id != leaseId) { leaseId?.let { finish(it, "interrupted") }; return }
      try {
        val elapsed = SystemClock.elapsedRealtime()
        if (lease.remaining(elapsed) <= 0) { finish(lease.id, "finished"); return }
        if (!ProtectionRuntime.ready(this@ProtectionService)) { finish(lease.id, "permission-lost"); return }
        val onBreak = lease.breakRemaining(elapsed) > 0
        if (wasOnBreak != onBreak) handler.post {
          if (ProtectionRuntime.current?.id == lease.id) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.activeNotifications.firstOrNull { it.id == NOTIFICATION }?.notification?.let { existing ->
              manager.notify(NOTIFICATION, Notification.Builder.recoverBuilder(this@ProtectionService, existing)
                .setContentTitle(if (onBreak) "Take a little breather" else "Your session is protected")
                .setContentText(if (onBreak) "App protection returns automatically when your break ends." else "Return to your intention · tap to open LifeRPG").build())
            }
          }
        }
        if (wasOnBreak && !onBreak) sendBroadcast(Intent("liferpg.PROTECTED_BREAK_END").setPackage(packageName))
        wasOnBreak = onBreak
        val interactive = (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
        val locked = (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
        var cover = false
        // Keep lifecycle state across lock screens. Unlocking need not emit a
        // new RESUMED event for the app which was already under our cover.
        queryForeground()
        if (interactive && !locked) cover = ProtectionPolicy.shouldCover(lease, foreground.packageName, essentials, userApps, elapsed)
        val shouldCover = cover
        handler.post {
          // A queued detection must not re-cover apps after Stop or expiry.
          if (!ProtectionPolicy.sameLease(ProtectionRuntime.current, lease.id) || lease.remaining(SystemClock.elapsedRealtime()) <= 0) return@post
          try {
            if (shouldCover && ProtectionRuntime.current?.breakRemaining(SystemClock.elapsedRealtime()) == 0L) showOverlay(lease) else hideOverlay()
            val copy = "${lease.remaining(elapsed) / 60}:${(lease.remaining(elapsed) % 60).toString().padStart(2, '0')} remaining"
            remainingText?.let { if (it.text.toString() != copy) it.text = copy }
          } catch (_: Exception) { finish(lease.id, "interrupted") }
        }
        monitor.postDelayed(this, 400)
      } catch (_: Exception) { finish(lease.id, "interrupted") }
    }
  }
  private fun queryForeground() {
    val now = System.currentTimeMillis()
    // A sparse event stream is normal for an app left open. Never erase the
    // last destination just because no new events arrived or the clock moved.
    if (now < lastQuery) lastQuery = now
    else if (now - lastQuery > 30000) lastQuery = now - 30000
    val events = (getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager).queryEvents(lastQuery, now)
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val pkg = event.packageName ?: continue
      if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) foreground.resumed(pkg, event.className)
      else if (event.eventType == UsageEvents.Event.MOVE_TO_BACKGROUND || event.eventType == UsageEvents.Event.ACTIVITY_STOPPED) foreground.paused(pkg, event.className)
    }
    lastQuery = now
  }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun text(copy: String, size: Float, color: String = "#F5F6FA") = TextView(this).apply {
    text = copy; textSize = size; setTextColor(Color.parseColor(color)); gravity = Gravity.CENTER
    setPadding(0, dp(10), 0, dp(10))
  }
  private fun showOverlay(lease: ProtectionLease) {
    if (overlay != null) return
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor("#080809")) }
    val scroll = ScrollView(this).apply { isFillViewport = true }
    val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(36), dp(24), dp(36)) }
    column.addView(text("SESSION PROTECTED", 14f, "#21C6B7"))
    column.addView(text("Stay with your intention.", 28f).apply { setTypeface(typeface, Typeface.BOLD) })
    column.addView(text(lease.title, 19f))
    remainingText = text("", 24f, "#AAB3FF"); column.addView(remainingText)
    column.addView(text("You chose to keep this app aside until your session ends.", 16f, "#ADB2C0"))
    fun button(parent: LinearLayout, label: String, primary: Boolean, action: () -> Unit) {
      parent.addView(Button(this).apply {
        text = label; isAllCaps = false; textSize = 16f; minHeight = dp(52)
        setTextColor(Color.parseColor(if (primary) "#11131B" else "#AAB3FF"))
        background = GradientDrawable().apply { setColor(Color.parseColor(if (primary) "#DDE1FF" else "#1E1E21")); cornerRadius = dp(16).toFloat() }
        setOnClickListener { action() }
      }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
    }
    button(column, "Back to my session", true) { openDestination(appIntent()) }
    column.addView(text("Calls, emergency access, Settings and LifeRPG stay available. Ending your session is always available in LifeRPG.", 14f, "#ADB2C0"))
    scroll.addView(column, FrameLayout.LayoutParams(-1, -1))
    root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
    // Exit and dialler controls remain outside scrolling copy, including large text.
    val footer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), 0, dp(24), dp(16)) }
    button(footer, "End session…", false) { openDestination(appIntent(true, lease.scope)) }
    button(footer, "Phone & emergency dialler", false) {
      openDestination(Intent(Intent.ACTION_DIAL, Uri.parse("tel:")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    root.addView(footer, LinearLayout.LayoutParams(-1, -2))
    wm.addView(root, WindowManager.LayoutParams(-1, -1, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT))
    overlay = root; ProtectionRuntime.covered(lease.id)
    if (ValueAnimator.areAnimatorsEnabled()) { root.alpha = 0f; root.animate().alpha(1f).setDuration(180).start() }
  }
  private fun openDestination(intent: Intent) {
    try {
      startActivity(intent)
      // The normal detector releases the cover for LifeRPG or the dialler.
      // No stop, grace period, or blanket exemption for the next opened app.
    } catch (_: Exception) {
      Toast.makeText(this, "Couldn’t open this screen. Your session stays protected.", Toast.LENGTH_LONG).show()
    }
  }
  private fun appIntent(end: Boolean = false, scope: String? = null): Intent {
    val uri = Uri.parse("liferpg://session").buildUpon()
    if (end && scope != null) {
      val session = runCatching { org.json.JSONArray(scope).getString(1) }.getOrNull()
      if (session != null) uri.appendQueryParameter("protectionEnd", java.util.UUID.randomUUID().toString()).appendQueryParameter("protectionSession", session)
    }
    return Intent(Intent.ACTION_VIEW, uri.build()).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }
  private fun hideOverlay() {
    overlay?.let { it.animate().cancel(); runCatching { wm.removeViewImmediate(it) } }
    overlay = null; remainingText = null
  }
  private fun finish(id: String, reason: String) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      ProtectionRuntime.finish(id, reason); handler.post { finish(id, reason) }; return
    }
    if (id != leaseId && !ProtectionPolicy.sameLease(ProtectionRuntime.current, id)) return
    ProtectionRuntime.finish(id, reason)
    if (id == leaseId) {
      monitor.removeCallbacks(tick); hideOverlay(); leaseId = null
      stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }
  }
  // Swiping LifeRPG from recents keeps this foreground service alive until the
  // monotonic deadline. Force-stop/OS eviction releases apps and is reported on return.
  override fun onDestroy() {
    monitor.removeCallbacks(tick); monitorThread.quitSafely(); handler.removeCallbacksAndMessages(null); hideOverlay()
    leaseId?.let { ProtectionRuntime.finish(it, "interrupted") }; leaseId = null
    if (instance === this) instance = null
    super.onDestroy()
  }
}
