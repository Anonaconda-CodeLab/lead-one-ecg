import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
const L = load();
const dv = bytes => new DataView(new Uint8Array(bytes).buffer);
const le16 = v => [v & 255, (v >> 8) & 255];
const hdr = ft => [0x02, 0, 0, 0, 0, 0, 0, 0, 0, ft];

test('uncompressed 16-bit accelerometer frame', () => {
  const s = L.pmdSamples(dv([...hdr(1), ...le16(100), ...le16(-1000 & 0xffff), ...le16(50), ...le16(101), ...le16(-999 & 0xffff), ...le16(48)]), 3, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), [[100, -1000, 50], [101, -999, 48]]);
});

test('delta-compressed accelerometer frame', () => {
  const deltas = [1, -2, 3, -1, 1, 0], bits = [];
  for (const d of deltas) for (let b = 0; b < 4; b++) bits.push(((d & 15) >> b) & 1);
  const packed = []; for (let i = 0; i < bits.length; i += 8) { let x = 0; for (let b = 0; b < 8 && i + b < bits.length; b++) x |= bits[i + b] << b; packed.push(x); }
  const s = L.pmdSamples(dv([...hdr(0x81), ...le16(100), ...le16(-1000 & 0xffff), ...le16(50), 4, 2, ...packed]), 3, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), [[100, -1000, 50], [101, -1002, 53], [100, -1001, 53]]);
});

test('truncated frames do not throw', () => {
  assert.doesNotThrow(() => L.pmdSamples(dv([...hdr(0x81), 1, 2]), 3, 2));
  assert.doesNotThrow(() => L.pmdSamples(dv([...hdr(1), 1, 2, 3]), 3, 2));
});
