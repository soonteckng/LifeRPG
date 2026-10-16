package expo.modules.sessioncountdown

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SessionCountdownModule : Module() {
  private val context: Context get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()
  override fun definition() = ModuleDefinition {
    Name("LifeRPGSessionCountdown")
    Constant("formatVersion") { FORMAT_VERSION }
    Constant("routineWidgetVersion") { ROUTINE_WIDGET_VERSION }
    AsyncFunction("activateRoutineWidgets") { leaseId: String, scopeJson: String -> RoutineWidgetRepository(context).activate(leaseId, scopeJson) }
    AsyncFunction("publishRoutineWidgets") { leaseId: String, routinesJson: String -> RoutineWidgetRepository(context).publish(leaseId, routinesJson) }
    AsyncFunction("clearRoutineWidgets") { leaseId: String -> RoutineWidgetRepository(context).clear(leaseId) }
    AsyncFunction("pinRoutineWidget") { leaseId: String, routineId: String -> RoutineWidgetRepository(context).pin(leaseId, routineId) }
    AsyncFunction("consumeRoutineWidgetLaunch") { scopeJson: String, nonce: String -> RoutineWidgetRepository(context).consume(scopeJson, nonce) }
    AsyncFunction("activate") { leaseId: String, scopeJson: String -> CountdownRepository(context).activate(leaseId, scopeJson) }
    AsyncFunction("publish") { leaseId: String, projectionJson: String, preferencesJson: String ->
      CountdownRepository(context).publish(leaseId, projectionJson, preferencesJson)
    }
    AsyncFunction("clear") { leaseId: String, finished: Boolean -> CountdownRepository(context).clear(leaseId, finished) }
    AsyncFunction("refresh") { leaseId: String, preferencesJson: String -> CountdownRepository(context).refresh(leaseId, preferencesJson) }
    AsyncFunction("capabilities") { CountdownRepository(context).capabilities() }
    AsyncFunction("consumeAction") { leaseId: String, nonce: String -> CountdownRepository(context).consumeAction(leaseId, nonce) }
    AsyncFunction("takeForegroundAction") { leaseId: String -> CountdownRepository(context).takeForegroundAction(leaseId) }
    // Android delivers onNewIntent before onResume. Capture only a native-
    // issued warm action, before JS's foreground refresh can retire its nonce.
    OnNewIntent { intent -> runCatching { CountdownRepository(context).captureLaunch(intent) } }
    // Deliberately no OnDestroy cleanup: process death/React restart must not
    // cancel an OS countdown or a persisted expiry alarm.
  }
}
