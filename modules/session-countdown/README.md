# LifeRPG Android session countdown

Local Expo SDK 57 module, autolinked from `modules/`. `LifeRPGSessionCountdown` owns notification/alarm presentation only. The installed AsyncStorage journal and JS session controller remain the single source of session state. No credentials, Supabase calls or reward mutations are implemented in Kotlin.

`activate` creates a scoped renderer lease; `publish` accepts newer journal projections; `refresh` changes preferences/reposts the saved presentation without replacing timing or action nonces; `consumeAction` consumes an opaque native-issued foreground action once; `clear` retires the lease idempotently. A completed-session clear preserves a previously delivered finish alert and can emit one only at the stored native deadline. An early End clears alerts without completion.

Android uses a system chronometer and an elapsed-time alarm. Persisted projection changes use a synchronized AtomicFile; the receiver rereads scoped lease/session/revisions before delivery. The cached projection is not an offline session journal. Reboots repair the presentation from the saved wall deadline after unlock; ordinary same-boot display uses elapsedRealtime.

Existing Expo Modules Core supplies AndroidX Core. Runtime behavior requires a fresh installed API 26+ Android build. Older Android, old binaries, Expo Go, iOS and web retain the static notification fallback. No new permission is declared in this module.

The app's Node checks cover the pure projection, bridge lifecycle, journal coordinator and provider fallbacks. `scripts/test-session-countdown-jvm.ps1` compiles/runs the real Kotlin policy/parser tests using already cached compiler/JUnit jars, without installing tools. Alternatively run the module's Android Gradle unit tests in a generated native project. JVM tests cover serialized cache content and policy; Android AtomicFile crash behavior and receiver/bridge concurrency need device/instrumentation verification.

See [scope and design](../../docs/android-countdown-next-slice.md) and [installed-device checks](../../docs/android-countdown-device-checks.md).
