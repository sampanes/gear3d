// Unit tests for the minimal store-only ZIP writer (src/zip.js). The archive
// layout is pinned by parsing it back with an independent mini-reader below —
// if a slicer or OS unzipper would choke, these should catch it first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zipBytes } from '../src/zip.js';

const enc = new TextEncoder();

test('crc32 matches the published check vectors', () => {
  assert.equal(crc32(new Uint8Array(0)), 0x00000000);
  assert.equal(crc32(enc.encode('abc')), 0x352441c2);
  assert.equal(crc32(enc.encode('123456789')), 0xcbf43926); // the classic CRC-32 check value
});

// Independent mini-reader: walk the End-Of-Central-Directory record back to the
// central directory, then each local header. Store-only, single disk.
function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOff = bytes.length - 22; // no archive comment in our writer
  assert.equal(dv.getUint32(eocdOff, true), 0x06054b50, 'EOCD signature');
  const count = dv.getUint16(eocdOff + 8, true);
  assert.equal(dv.getUint16(eocdOff + 10, true), count, 'total = this-disk count');
  let off = dv.getUint32(eocdOff + 16, true); // central directory start
  assert.equal(dv.getUint32(eocdOff + 12, true), eocdOff - off, 'central directory size');
  const entries = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(off, true), 0x02014b50, `central header ${i} signature`);
    const crc = dv.getUint32(off + 16, true);
    const csize = dv.getUint32(off + 20, true);
    const usize = dv.getUint32(off + 24, true);
    const nlen = dv.getUint16(off + 28, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nlen));
    assert.equal(csize, usize, 'store method: sizes equal');

    // cross-check the local header this central entry points at
    assert.equal(dv.getUint32(lho, true), 0x04034b50, `${name}: local header signature`);
    assert.equal(dv.getUint16(lho + 8, true), 0, `${name}: method is store`);
    assert.equal(dv.getUint32(lho + 14, true), crc, `${name}: local/central crc agree`);
    const lnlen = dv.getUint16(lho + 26, true);
    const data = bytes.subarray(lho + 30 + lnlen, lho + 30 + lnlen + csize);
    entries.push({ name, crc, data });
    off += 46 + nlen;
  }
  return entries;
}

test('zipBytes round-trips entries: names, data, and per-entry CRCs all verify', () => {
  const a = enc.encode('hello stl world');
  const b = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
  const zip = zipBytes([
    { name: 'plate.stl', data: a },
    { name: 'tile-disc-x25.stl', data: b },
  ]);
  const entries = readZip(zip);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'plate.stl');
  assert.equal(entries[1].name, 'tile-disc-x25.stl');
  assert.deepEqual([...entries[0].data], [...a]);
  assert.deepEqual([...entries[1].data], [...b]);
  for (const e of entries) assert.equal(crc32(e.data), e.crc, `${e.name}: stored CRC matches data`);
});

test('zipBytes accepts DataView payloads (the shape stlBytes returns)', () => {
  const buf = new ArrayBuffer(16);
  new Uint8Array(buf).set([9, 8, 7, 6], 4);
  const view = new DataView(buf, 4, 8); // offset view — must respect byteOffset
  const entries = readZip(zipBytes([{ name: 'part.stl', data: view }]));
  assert.deepEqual([...entries[0].data], [9, 8, 7, 6, 0, 0, 0, 0]);
});

test('zipBytes is byte-reproducible (fixed timestamp): same input, same archive', () => {
  const mk = () => zipBytes([{ name: 'a.stl', data: enc.encode('AAAA') }]);
  assert.deepEqual([...mk()], [...mk()]);
});

test('an empty archive is still a valid zip (EOCD only)', () => {
  const zip = zipBytes([]);
  assert.equal(zip.length, 22);
  assert.equal(readZip(zip).length, 0);
});

test('zipBytes fails LOUDLY past format limits and on duplicate names (no silent u16 wrap)', () => {
  // DataView writes wrap modulo past u16/u32 — a 65536-entry archive would
  // report an entry count of 0 and extract as empty in .NET. Reject instead.
  const a = enc.encode('x');
  assert.throws(() => zipBytes([{ name: 'same.stl', data: a }, { name: 'same.stl', data: a }]), /duplicate/);
  const many = Array.from({ length: 0x10000 }, (_, i) => ({ name: `f${i}`, data: new Uint8Array(0) }));
  assert.throws(() => zipBytes(many), /too many entries/);
});
