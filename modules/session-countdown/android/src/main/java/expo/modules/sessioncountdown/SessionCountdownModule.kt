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
    AsyncFunction("activate") { leaseId: String, scopeJson: String -> CountdownRepository(context).activate(leaseId, scopeJson) }
    AsyncFunction("publish") { leaseId: String, projectionJson: String, preferencesJson: String ->
      CountdownRepository(context).publish(leaseId, projectionJson, preferencesJson)
    }
    AsyncFunction("clear") { leaseId: String, finished: Boolean -> CountdownRepository(context).clear(leaseId, finished) }
    AsyncFunction("refresh") { leaseId: String, preferencesJson: String -> CountdownRepository(context).refresh(leaseId, preferencesJson) }
    AsyncFunction("capabilities") { CountdownRepository(context).capabilities() }
    AsyncFunction("consumeAction") { leaseId: String, nonce: String -> CountdownRepository(context).consumeAction(leaseId, nonce) }
    // Deliberately no OnDestroy cleanup: process death/React restart must not
    // cancel an OS countdown or a persisted expiry alarm.
  }
}
