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
    navigator, document: { documentElement: { classList: { add() {} } }, getElementById: () => null, body: { dataset: {} } },
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
