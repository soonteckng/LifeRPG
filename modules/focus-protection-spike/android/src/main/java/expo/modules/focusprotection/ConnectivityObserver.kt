package expo.modules.focusprotection

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.SystemClock

/** Callback values preserve the actual default network during Wi-Fi/mobile handoffs. */
class ConnectivityObserver(context: Context, private val emit: (Map<String, Any>) -> Unit) {
  private val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private var observing = false
  private val initial = manager.activeNetwork
  private val state = DefaultNetworkState(initial, initial?.let { manager.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } == true)
  @Synchronized fun snapshot(): Map<String, Any> {
    if (!observing) {
      val current = manager.activeNetwork
      state.replace(current, current?.let { manager.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } == true)
    }
    return state.snapshot(SystemClock.elapsedRealtime())
  }
  // Android warns that synchronous capabilities reads inside callbacks race
  // with framework updates. Use callback values and ignore an outgoing loss.
  @Synchronized private fun available(network: Network) {
    state.available(network)
    emit(snapshot())
  }
  @Synchronized private fun changedCapabilities(network: Network, value: NetworkCapabilities) {
    if (!state.capabilities(network, value.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))) return
    emit(snapshot())
  }
  @Synchronized private fun lost(network: Network) {
    if (state.lost(network)) emit(snapshot())
  }
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { available(network) }
    override fun onLost(network: Network) { lost(network) }
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { changedCapabilities(network, capabilities) }
  }
  @Synchronized fun start() { if (!observing) { manager.registerDefaultNetworkCallback(callback); observing = true }; emit(snapshot()) }
  @Synchronized fun stop() { if (observing) { runCatching { manager.unregisterNetworkCallback(callback) }; observing = false } }
}
