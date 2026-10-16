/** Email integration fixtures may only contact local mail capture endpoints. */
function assertLocalAuthTestTarget(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password)
    throw Error('Refusing an email fixture against a hosted or production authentication service. Use local capture or a mocked transport.');
  return url.origin;
}
module.exports = { assertLocalAuthTestTarget };
