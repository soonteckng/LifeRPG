// Unit tests use mocked clients or local capture. Never allow a fixture to
// reach production Auth/email (or any other external service), even when a
// developer's environment contains real project configuration.
const net = require('node:net');
const local = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
function assertLocalHost(host) {
  if (!local.has(String(host).toLowerCase())) throw Error('Unit tests refuse external network access. Use mocks or a local capture service.');
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  // Local named pipes/Unix sockets do not contact hosted Auth services.
  if (options && typeof options === 'object' && !options.path) assertLocalHost(options.host ?? options.hostname ?? 'localhost');
  else if (typeof options === 'number' || typeof options === 'string' && /^\d+$/.test(options)) assertLocalHost(typeof args[1] === 'string' ? args[1] : 'localhost');
  return originalConnect.apply(this, args);
};
if (globalThis.fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.protocol === 'https:' || url.protocol === 'http:') assertLocalHost(url.hostname);
    return originalFetch(input, init);
  };
}
module.exports = { assertLocalHost };
