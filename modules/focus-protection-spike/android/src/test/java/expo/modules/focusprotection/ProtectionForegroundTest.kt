package expo.modules.focusprotection

import org.junit.Assert.*
import org.junit.Test

class ProtectionForegroundTest {
  private val essentials = setOf("phone.app", "settings.app", "liferpg.app", "home.app", "com.android.systemui")
  private val apps = setOf("video.app", "browser.app", "notes.app")
  private fun tracker() = ProtectionForegroundTracker(setOf("home.app", "com.android.systemui"))
  private fun lease() = ProtectionLease("11111111-1111-4111-8111-111111111111", "owner-session", "Study", 600,
    "allow-list", setOf("notes.app"), 0L)
  private fun covered(tracker: ProtectionForegroundTracker, item: ProtectionLease = lease(), now: Long = 1000L, showing: Boolean = false) =
    ProtectionPolicy.shouldCover(item, tracker.packageForCover(now, showing), essentials, apps, now)

  @Test fun aPartialRecentsGestureNeverTurnsAPauseIntoAnUnblockedApp() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    repeat(20) {
      tracker.paused("video.app", "Player")
      assertTrue(covered(tracker))
      // Some devices report no fresh app resume after cancelling the gesture.
      assertEquals("video.app", tracker.packageName)
    }
  }
  @Test fun aCancelledLauncherGestureFallsBackEvenWithoutAnotherAppResume() {
    val tracker = tracker(); tracker.resumed("video.app", "Player"); tracker.paused("video.app", "Player")
    tracker.resumed("home.app", "Recents"); assertFalse(covered(tracker))
    tracker.paused("home.app", "Recents"); assertTrue(covered(tracker))
    tracker.paused("home.app", "Recents"); assertTrue(covered(tracker))
  }
  @Test fun closingASystemPanelRestoresTheBlockedApp() {
    val tracker = tracker(); tracker.resumed("browser.app", "Browser")
    tracker.resumed("com.android.systemui", "Shade"); assertFalse(covered(tracker))
    tracker.paused("com.android.systemui", "Shade"); assertTrue(covered(tracker))
  }
  @Test fun actualHomeSettingsAndAllowedAppsStayAvailable() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    for (pkg in listOf("home.app", "settings.app", "notes.app", "liferpg.app")) {
      tracker.resumed(pkg, "Main"); assertFalse(covered(tracker))
    }
    tracker.resumed("video.app", "Player"); assertTrue(covered(tracker))
  }
  @Test fun stalePausesDoNotOverrideAConfirmedDestinationOrAnotherActivity() {
    val tracker = tracker(); tracker.resumed("video.app", "Player"); tracker.resumed("notes.app", "Main")
    tracker.paused("video.app", "Player"); assertFalse(covered(tracker)); assertEquals("notes.app", tracker.packageName)
    tracker.resumed("home.app", "Home", eventAt = 10); tracker.resumed("home.app", "Recents", eventAt = 11)
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
  @Test fun aLauncherResumeCannotRemoveAnExistingCoverAtTheStartOfASwipe() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", elapsed = 1000L, eventAt = 1000L)
    assertTrue(covered(tracker, now = 1000L))
    tracker.paused("video.app", "Player", 1100L)
    tracker.resumed("home.app", "GestureActivity", elapsed = 1200L, eventAt = 1200L)
    assertTrue(covered(tracker, now = 1200L, showing = true))
    assertTrue(covered(tracker, now = 2199L, showing = true))
    assertFalse(covered(tracker, now = 2200L, showing = true))
    assertFalse(covered(tracker, now = 2600L, showing = false))
  }
  @Test fun aPauseOfAnotherLauncherActivityDoesNotLeaveTheVisibleOne() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", elapsed = 1000L, eventAt = 1000L)
    tracker.resumed("home.app", "Launcher", elapsed = 1200L, eventAt = 1200L)
    tracker.paused("home.app", "OverviewProxy", 1250L)
    assertEquals("home.app", tracker.packageName)
    assertFalse(covered(tracker, now = 5000L, showing = true))
  }
  @Test fun aCancelledGesturePauseWithTheSameOrUnknownClassRecovers() {
    for (name in listOf(null, "Launcher")) {
      val tracker = tracker(); tracker.resumed("video.app", "Player")
      tracker.resumed("home.app", "Launcher", elapsed = 1200L)
      tracker.paused("home.app", name)
      assertTrue(covered(tracker, now = 1600L, showing = true))
    }
  }
  // Recorded on a Samsung One UI phone (17 Oct 2026), package names generalised.
  @Test fun samsungRecentsIsNotCoveredAndCancelledSwipesAreRecovered() {
    val launcher = "home.app"; val tracker = tracker()
    tracker.resumed("video.app", "Player", elapsed = 25109L, eventAt = 24750L)
    assertTrue(covered(tracker, now = 25109L))
    // Swipe starts: the cover stays even though the tick clock is read first.
    tracker.resumed(launcher, "Launcher", elapsed = 25916L, eventAt = 25803L)
    assertTrue(covered(tracker, now = 25915L, showing = true))
    // Into Recents: the app and Launcher pause, RecentsActivity is visible.
    tracker.paused("video.app", "Player", 26577L)
    tracker.resumed(launcher, "com.android.quickstep.RecentsActivity", elapsed = 26721L, eventAt = 26587L)
    tracker.paused(launcher, "Launcher", 26722L)
    tracker.stopped(launcher, "Launcher", 26738L)
    tracker.stopped("video.app", "Player", 26746L)
    assertEquals(launcher, tracker.packageName)
    assertFalse(covered(tracker, now = 27126L, showing = true))
    // Tapping the blocked app in Recents covers it again.
    tracker.paused(launcher, "com.android.quickstep.RecentsActivity", 37761L)
    tracker.resumed(launcher, "Launcher", elapsed = 38008L, eventAt = 37768L)
    tracker.paused(launcher, "Launcher", 38468L)
    tracker.resumed("video.app", "Player", elapsed = 38814L, eventAt = 38482L)
    assertTrue(covered(tracker, now = 38814L))
    // A partial swipe that is cancelled returns to the blocked app with no new resume.
    tracker.resumed(launcher, "Launcher", elapsed = 40022L, eventAt = 39634L)
    tracker.paused(launcher, "Launcher", 41761L)
    assertEquals("video.app", tracker.packageName)
    assertTrue(covered(tracker, now = 42036L))
  }
  @Test fun repeatedLauncherAndSystemResumesCannotExtendTheGraceForever() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    tracker.resumed("home.app", "Launcher", elapsed = 1200L)
    tracker.resumed("com.android.systemui", "Overview", elapsed = 1600L)
    tracker.resumed("home.app", "Launcher", elapsed = 2000L)
    assertTrue(covered(tracker, now = 2199L, showing = true))
    assertFalse(covered(tracker, now = 2200L, showing = true))
  }
  @Test fun returningToABlockedAppFromSettledRecentsRecoversWithoutAnyNewGrace() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    tracker.resumed("home.app", "Recents", elapsed = 1200L)
    assertFalse(covered(tracker, now = 2500L, showing = true))
    tracker.resumed("video.app", "Player", elapsed = 2600L)
    assertTrue(covered(tracker, now = 2600L, showing = false))
  }
  @Test fun emergencySettingsAndAllowedToolDestinationsDoNotWaitForTransientGrace() {
    val tracker = tracker()
    for (pkg in listOf("phone.app", "settings.app", "notes.app", "liferpg.app")) {
      tracker.resumed("video.app", "Player", elapsed = 1000L)
      tracker.resumed("home.app", "Overview", elapsed = 1200L)
      assertTrue(covered(tracker, now = 1250L, showing = true))
      tracker.resumed(pkg, "Main", elapsed = 1300L)
      assertFalse(covered(tracker, now = 1300L, showing = true))
    }
  }
  @Test fun HomeWithoutAnExistingCoverIsNeverObscuredByAStaleUnderlyingApp() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    tracker.resumed("home.app", "Launcher", elapsed = 1200L)
    assertFalse(covered(tracker, now = 1250L, showing = false))
  }
  @Test fun aBreakAndExpiryImmediatelyOverrideTheTransientHold() {
    val tracker = tracker(); tracker.resumed("video.app", "Player")
    tracker.resumed("home.app", "Overview", elapsed = 1200L)
    assertTrue(covered(tracker, now = 1500L, showing = true))
    assertFalse(covered(tracker, lease().copy(breakStarted = 1000L, breakEnds = 301000L), 1500L, true))
    assertFalse(covered(tracker, lease().copy(seconds = 1), 1500L, true))
  }
  @Test fun oldRecentsTeardownAfterHomeResumesCannotTrapTheUserOnHome() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", eventAt = 1000L)
    tracker.resumed("home.app", "Recents", elapsed = 1200L, eventAt = 1200L)
    tracker.resumed("home.app", "Home", elapsed = 1300L, eventAt = 1300L)
    tracker.stopped("home.app", "Recents", 1400L)
    assertEquals("home.app", tracker.packageName)
    assertTrue(covered(tracker, now = 1500L, showing = true))
    assertFalse(covered(tracker, now = 2500L, showing = true))
    tracker.stopped("home.app", null, 2600L)
    assertFalse(covered(tracker, now = 2600L, showing = false))
  }
  @Test fun stoppingTheCurrentTransientActivityCanRestoreTheBlockedApp() {
    val tracker = tracker(); tracker.resumed("video.app", "Player", eventAt = 1000L)
    tracker.resumed("home.app", "Recents", elapsed = 1200L, eventAt = 1200L)
    tracker.stopped("home.app", "Recents", 1300L)
    assertEquals("video.app", tracker.packageName)
    assertTrue(covered(tracker, now = 2500L, showing = false))
  }
}
