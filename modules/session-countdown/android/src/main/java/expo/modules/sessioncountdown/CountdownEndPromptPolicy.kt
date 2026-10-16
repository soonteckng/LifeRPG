package expo.modules.sessioncountdown

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** A bounded UI-intent handover, separate from the frozen countdown cache.
 * These tokens can ONLY ask JS for a current End confirmation, never mutate a
 * timer. Consumed proof tombstones survive file/context/process reloads.
 */
internal data class CountdownEndPrompts(
  val leaseId: String? = null, val scope: CountdownScope? = null,
  val tokens: List<CountdownAction> = emptyList(), val retiredTokens: List<String> = emptyList()
) {
  fun json() = JSONObject().put("version", 1).put("leaseId", leaseId ?: JSONObject.NULL)
    .put("scope", scope?.json() ?: JSONObject.NULL)
    .put("tokens", JSONArray().apply { tokens.forEach { put(it.json()) } }).put("retiredTokens", JSONArray(retiredTokens))
}
internal object CountdownEndPromptPolicy {
  private const val MAX_TOKENS = 4
  fun parse(text: String): CountdownEndPrompts {
    require(text.toByteArray(Charsets.UTF_8).size <= 8192)
    val parser = JSONTokener(text); val value = parser.nextValue()
    require(value is JSONObject && parser.nextClean() == '\u0000')
    val keys = mutableSetOf<String>(); val iterator = value.keys()
    while (iterator.hasNext()) keys.add(iterator.next())
    require(keys == setOf("version", "leaseId", "scope", "tokens", "retiredTokens"))
    require(value.get("version") is Number && value.getDouble("version") == 1.0)
    val lease = if (value.isNull("leaseId")) null else CountdownParser.lease(value.getString("leaseId"))
    val scope = if (value.isNull("scope")) null else CountdownParser.scope(value.getJSONObject("scope"))
    require((lease == null) == (scope == null))
    val items = value.getJSONArray("tokens"); require(items.length() <= MAX_TOKENS)
    val tokens = (0 until items.length()).map { CountdownParser.action(items.getJSONObject(it)) }
    require(tokens.all { it.kind == "end" && it.identity.scope == scope })
    require(tokens.map { it.operationId }.distinct().size == tokens.size)
    val retiredItems = value.getJSONArray("retiredTokens"); require(retiredItems.length() <= 32)
    val retired = (0 until retiredItems.length()).map { CountdownParser.lease(retiredItems.getString(it)) }
    require(retired.distinct().size == retired.size && tokens.none { it.operationId in retired })
    return CountdownEndPrompts(lease, scope, tokens, retired)
  }
  private fun retire(proof: CountdownEndPrompts, values: List<CountdownAction> = proof.tokens): CountdownEndPrompts =
    proof.copy(tokens = proof.tokens.filterNot { it in values },
      retiredTokens = (proof.retiredTokens + values.map { it.operationId }).distinct().takeLast(32))
  fun activate(proof: CountdownEndPrompts, before: CountdownState, after: CountdownState): CountdownEndPrompts {
    val lease = after.leaseId ?: return retire(proof).copy(leaseId = null, scope = null, tokens = emptyList())
    val scope = after.scope ?: return retire(proof).copy(leaseId = null, scope = null, tokens = emptyList())
    val issued = before.actions.filter { it.kind == "end" }
    if (before.cleared || after.cleared || before.scope != scope) {
      val retired = retire(proof, proof.tokens + issued)
      return retired.copy(leaseId = lease, scope = scope, tokens = emptyList())
    }
    val retained = retain(proof.copy(leaseId = before.leaseId), before)
    val usable = issued.filter { it.operationId !in retained.retiredTokens }
    val tokens = (retained.tokens + usable).distinctBy { it.operationId }
    val dropped = tokens.dropLast(MAX_TOKENS)
    val retired = retire(retained.copy(tokens = tokens), dropped)
    return retired.copy(leaseId = lease, scope = scope, tokens = tokens.takeLast(MAX_TOKENS))
  }
  fun retain(proof: CountdownEndPrompts, current: CountdownState): CountdownEndPrompts {
    if (current.cleared || current.scope != proof.scope || current.leaseId != proof.leaseId) return retire(proof)
    val projection = current.projection ?: return proof // Scoped bootstrap, before journal recovery publishes.
    val retired = proof.tokens.filter { token ->
      !projection.showOngoing || token.identity.clientSessionId != projection.identity.clientSessionId
        || token.identity.serverSessionId != null && token.identity.serverSessionId != projection.identity.serverSessionId
    }
    return retire(proof, retired)
  }
  fun clear(proof: CountdownEndPrompts, current: CountdownState): CountdownEndPrompts =
    retire(proof, proof.tokens + current.actions.filter { it.kind == "end" }).copy(tokens = emptyList())
  fun consumed(proof: CountdownEndPrompts, token: CountdownAction): CountdownEndPrompts =
    if (token.kind == "end") retire(proof, proof.tokens.filter { it.operationId == token.operationId } + token) else proof
  fun consume(proof: CountdownEndPrompts, current: CountdownState, lease: String, nonce: String): Pair<CountdownEndPrompts, CountdownAction?> {
    if (current.cleared || current.leaseId != lease || proof.leaseId != lease || current.scope != proof.scope) return proof to null
    val valid = retain(proof, current)
    val token = valid.tokens.firstOrNull { it.operationId == nonce } ?: return valid to null
    return consumed(valid, token) to token
  }
}
