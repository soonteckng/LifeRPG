package expo.modules.focusprotection

import org.junit.Assert.*
import org.junit.Test

class ProtectionForegroundTest {
  private val essentials = setOf("phone.app", "settings.app", "liferpg.app", "home.app", "com.android.systemui")
  private val apps = setOf("video.app", "browser.app", "notes.app")
  private fun tracker() = ProtectionForegroundTracker(setOf("home.app", "com.android.systemui"))
  private fun lease() = ProtectionLease("11111111-1111-4111-8111-111111111111", "owner-session", "Study", 600,
    "allow-list", setOf("notes.app"), 0L)
  private fun covered(tracker: ProtectionForegroundTracker, item: ProtectionLease = lease(), now: Long = 1000L) =
    ProtectionPolicy.shouldCover(item, tracker.packageName, essentials, apps, now)

  @Test fun aPartialRecentsGestureNeverTurnsAPauseIntoAnUnblockedApp() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    repeat(20) {
      tracker.paused("video.app", "Player")
      assertTrue(covered(tracker))
      // Some devices report no fresh app resume after cancelling the gesture.
      assertEquals("video.app", tracker.packageName)
    }
  }
  @Test fun aSwipeReleasesTheCoverAtOnceAndACancelledOneRestoresIt() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", 1000L)
    assertTrue(covered(tracker))
    tracker.resumed("home.app", "Launcher", 1200L); assertFalse(covered(tracker))
    tracker.paused("home.app", "Launcher", 1500L); assertTrue(covered(tracker))
    tracker.paused("home.app", "Launcher", 1600L); assertTrue(covered(tracker))
  }
  @Test fun closingASystemPanelRestoresTheBlockedApp() {
    val tracker = tracker(); tracker.resumed("browser.app", "Browser")
    tracker.resumed("com.android.systemui", "Shade"); assertFalse(covered(tracker))
    tracker.paused("com.android.systemui", "Shade"); assertTrue(covered(tracker))
  }
  @Test fun actualHomeSettingsAndAllowedAppsStayAvailable() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    for (pkg in listOf("home.app", "settings.app", "notes.app", "liferpg.app", "phone.app")) {
      tracker.resumed(pkg, "Main"); assertFalse(covered(tracker))
    }
    tracker.resumed("video.app", "Player"); assertTrue(covered(tracker))
  }
  @Test fun stalePausesDoNotOverrideAConfirmedDestinationOrAnotherActivity() {
    val tracker = tracker(); tracker.resumed("video.app", "Player"); tracker.resumed("notes.app", "Main")
    tracker.paused("video.app", "Player"); assertFalse(covered(tracker)); assertEquals("notes.app", tracker.packageName)
    tracker.resumed("home.app", "Home", 10); tracker.resumed("home.app", "Recents", 11)
    tracker.paused("home.app", "Home", 10); assertEquals("home.app", tracker.packageName)
    tracker.paused("home.app", "Recents", 11); assertEquals("notes.app", tracker.packageName)
  }
  @Test fun diallerRoundTripKeepsTheSameLeaseAndDoesNotGrantOtherAppsAnExemption() {
    val gate = ProtectionLeaseGate(); val item = lease(); gate.install(item); gate.active(item.id)
    val tracker = tracker(); tracker.resumed("video.app", "Player"); assertTrue(covered(tracker, gate.current!!))
    tracker.resumed("phone.app", "Dialler"); assertFalse(covered(tracker, gate.current!!))
    assertEquals(item.id, gate.current!!.id); assertEquals("active", gate.status)
    tracker.resumed("browser.app", "Browser"); assertTrue(covered(tracker, gate.current!!))
    tracker.resumed("phone.app", "Dialler"); assertFalse(covered(tracker, gate.current!!))
    tracker.resumed("video.app", "Player"); assertTrue(covered(tracker, gate.current!!))
    assertEquals(item.id, gate.current!!.id)
  }
  @Test fun aSystemPanelOverTheDiallerNeverFallsBackToAnOldBlockedApp() {
    val tracker = tracker(); tracker.resumed("video.app", "Player"); tracker.resumed("phone.app", "Call")
    tracker.resumed("com.android.systemui", "Shade"); tracker.paused("com.android.systemui", "Shade")
    assertEquals("phone.app", tracker.packageName); assertFalse(covered(tracker))
  }
  @Test fun retainedForegroundDoesNotCoverDuringABreakOrAfterExpiry() {
    val tracker = tracker(); tracker.resumed("video.app", "Player"); tracker.paused("video.app", "Player")
    val resting = lease().copy(breakStarted = 1000L, breakEnds = 301000L)
    assertFalse(covered(tracker, resting, 300999L)); assertTrue(covered(tracker, resting, 301000L))
    assertFalse(covered(tracker, resting, 900000L))
  }
  @Test fun aPauseOfAnotherLauncherActivityDoesNotLeaveTheVisibleOne() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", 1000L)
    tracker.resumed("home.app", "Launcher", 1200L)
    tracker.paused("home.app", "OverviewProxy", 1250L)
    assertEquals("home.app", tracker.packageName); assertFalse(covered(tracker))
  }
  @Test fun aCancelledGesturePauseWithTheSameOrUnknownClassRecovers() {
    for (name in listOf(null, "Launcher")) {
      val tracker = tracker(); tracker.resumed("video.app", "Player")
      tracker.resumed("home.app", "Launcher"); tracker.paused("home.app", name)
      assertTrue(covered(tracker))
    }
  }
  // Recorded on a Samsung One UI phone (17 Oct 2026), package names generalised.
  @Test fun samsungSwipesReleaseAtOnceRecentsStaysClearAndCancelsRecover() {
    val launcher = "home.app"; val tracker = tracker()
    tracker.resumed("video.app", "Player", 24750L); assertTrue(covered(tracker))
    // The swipe starts: the app can no longer be used, so it is released.
    tracker.resumed(launcher, "Launcher", 25803L); assertFalse(covered(tracker))
    // Into Recents: the app and Launcher pause, RecentsActivity is visible.
    tracker.paused("video.app", "Player", 26577L)
    tracker.resumed(launcher, "com.android.quickstep.RecentsActivity", 26587L)
    tracker.paused(launcher, "Launcher", 26722L)
    tracker.stopped(launcher, "Launcher", 26738L)
    tracker.stopped("video.app", "Player", 26746L)
    assertEquals(launcher, tracker.packageName); assertFalse(covered(tracker))
    // Tapping the blocked app in Recents covers it again.
    tracker.paused(launcher, "com.android.quickstep.RecentsActivity", 37761L)
    tracker.resumed(launcher, "Launcher", 37768L)
    tracker.paused(launcher, "Launcher", 38468L)
    tracker.resumed("video.app", "Player", 38482L); assertTrue(covered(tracker))
    // A partial swipe that is cancelled returns to the blocked app with no new resume.
    tracker.resumed(launcher, "Launcher", 39634L); assertFalse(covered(tracker))
    tracker.paused(launcher, "Launcher", 41761L)
    assertEquals("video.app", tracker.packageName); assertTrue(covered(tracker))
  }
  @Test fun oldRecentsTeardownAfterHomeResumesCannotTrapTheUserOnHome() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", 1000L)
    tracker.resumed("home.app", "Recents", 1200L)
    tracker.resumed("home.app", "Home", 1300L)
    tracker.stopped("home.app", "Recents", 1400L)
    assertEquals("home.app", tracker.packageName); assertFalse(covered(tracker))
    tracker.stopped("home.app", null, 2600L); assertFalse(covered(tracker))
  }
  @Test fun stoppingTheCurrentTransientActivityCanRestoreTheBlockedApp() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", 1000L)
    tracker.resumed("home.app", "Recents", 1200L)
    tracker.stopped("home.app", "Recents", 1300L)
    assertEquals("video.app", tracker.packageName); assertTrue(covered(tracker))
  }
}
