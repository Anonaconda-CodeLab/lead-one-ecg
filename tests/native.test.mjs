import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The Android shim with a fake Capacitor bridge that, like Android, refuses a second Bluetooth request while one runs
function loadShim() {
  const log = []; let busy = false, refusedOnce = false;
  const nativePromise = async (plugin, method, opts) => {
    if (method === 'getServices') return { services: [{ uuid: '0000180d-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002a37-0000-1000-8000-00805f9b34fb' }] }] };
    if (method !== 'write' && method !== 'read' && method !== 'startNotifications') return { value: true };
    if (busy) { log.push('refused ' + method); throw new Error('Writing characteristic failed with status code 201.'); }
    if (method === 'write' && !refusedOnce) { refusedOnce = true; throw new Error('Writing characteristic failed with status code 201.'); }
    busy = true; log.push('start ' + method); await new Promise(r => setTimeout(r, 30)); log.push('end ' + method); busy = false;
    return method === 'read' ? { value: '50' } : {};
  };
  const navigator = {};
  const ctx = vm.createContext({ console, setTimeout, Promise, Uint8Array, DataView, ArrayBuffer, Error, String, Object, Math,
    navigator, document: { documentElement: { classList: { add() {} } }, getElementById: () => null, body: { dataset: {} }, addEventListener() {} },
    window: { Capacitor: { isNativePlatform: () => true, nativePromise, addListener: () => ({ remove() {} }) } } });
  ctx.window.navigator = navigator;
  vm.runInContext(readFileSync(new URL('../src/native.js', import.meta.url), 'utf8'), ctx);
  return { bt: navigator.bluetooth, log };
}

test('Android shim: Bluetooth requests run one at a time, and a busy refusal is retried', async () => {
  const { bt, log } = loadShim();
  const dev = await bt.requestDevice({ filters: [{ namePrefix: 'Polar H10' }] });
  await dev.gatt.connect();
  const ch = await (await dev.gatt.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
  await Promise.all([ch.writeValueWithResponse(new Uint8Array([1])), ch.readValue(), ch.startNotifications(), ch.writeValueWithResponse(new Uint8Array([2]))]);
  assert.ok(!log.some(l => l.startsWith('refused')), 'no request overlapped another: ' + log.join(', '));
  assert.equal(log.filter(l => l.startsWith('end')).length, 4, 'all four requests finished');
});

test('Android shim: saves run one at a time, so a finishing save never clears a newer one', async () => {
  const log = []; let n = 0;
  const nativePromise = async (plugin, method, opts) => {
    if (method === 'pickSaveLocation') { const u = 'content://doc/' + (++n); log.push('pick ' + u); await new Promise(r => setTimeout(r, 5)); return { uri: u }; }
    if (method === 'writeChunk') { log.push('write ' + opts.uri + (opts.last ? ' last' : '')); await new Promise(r => setTimeout(r, 10)); return {}; }
    return {};
  };
  const ctx = vm.createContext({ console, setTimeout, Promise, Uint8Array, DataView, ArrayBuffer, Error, String, Object, Math, navigator: {},
    document: { documentElement: { classList: { add() {} } }, getElementById: () => null, body: { dataset: {} }, addEventListener() {} },
    window: { Capacitor: { isNativePlatform: () => true, nativePromise, addListener: () => ({ remove() {} }) } } });
  ctx.window.navigator = ctx.navigator;
  vm.runInContext(readFileSync(new URL('../src/native.js', import.meta.url), 'utf8') + ';globalThis.N = LeadOneNative;', ctx);
  const big = 'x'.repeat(600 * 1024);   // three pieces
  const [a, b] = await Promise.all([ctx.N.saveFile('a.json', big), ctx.N.saveFile('b.json', 'y')]);
  assert.ok(a.saved && b.saved);
  assert.deepEqual(log, ['pick content://doc/1', 'write content://doc/1', 'write content://doc/1', 'write content://doc/1 last', 'pick content://doc/2', 'write content://doc/2 last'], log.join(', '));
});
