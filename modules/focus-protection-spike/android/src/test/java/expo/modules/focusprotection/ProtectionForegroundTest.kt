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
    tracker.resumed("home.app", "Home"); tracker.resumed("home.app", "Recents")
    tracker.paused("home.app", "Home"); assertEquals("home.app", tracker.packageName)
    tracker.paused("home.app", "Recents"); assertEquals("notes.app", tracker.packageName)
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
}
