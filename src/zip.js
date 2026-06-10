// Minimal store-only (no compression) ZIP writer — just enough to bundle a kit
// of binary STLs into one download. STL bodies are already dense binary, so
// store (method 0) loses little versus deflate and keeps this dependency-free
// and byte-reproducible (fixed timestamp), which the tests pin.

// CRC-32 (IEEE 802.3, poly 0xEDB88320), the checksum ZIP requires per entry.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed DOS timestamp (2026-01-01 00:00) so identical input -> identical zip.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

const asBytes = (data) =>
  data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

// Build a ZIP archive from entries [{ name, data }] where data is a Uint8Array
// or DataView. Names must be ASCII (ours are). Returns a Uint8Array.
export function zipBytes(entries) {
  // The classic (non-ZIP64) format stores counts in u16 and sizes/offsets in
  // u32, and DataView setUint16/setUint32 silently wrap past those — so an
  // out-of-range archive would be VALID-LOOKING garbage (e.g. an entry count of
  // 0). Our kits sit ~4 orders of magnitude below every limit; fail loudly if
  // that ever changes. Duplicate names extract last-wins in most tools (a part
  // would silently vanish), so they are rejected too.
  if (entries.length > 0xffff) throw new Error(`zip: too many entries (${entries.length})`);
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.name)) throw new Error(`zip: duplicate entry name "${e.name}"`);
    seen.add(e.name);
  }

  const enc = new TextEncoder();
  const files = entries.map((e) => {
    const data = asBytes(e.data);
    return { name: enc.encode(e.name), data, crc: crc32(data) };
  });

  const localSize = files.reduce((s, f) => s + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((s, f) => s + 46 + f.name.length, 0);
  if (localSize + centralSize + 22 > 0xffffffff) throw new Error('zip: archive exceeds 4GiB (ZIP64 not supported)');
  const out = new Uint8Array(localSize + centralSize + 22);
  const dv = new DataView(out.buffer);
  let off = 0;

  // local file headers + data
  const offsets = [];
  for (const f of files) {
    offsets.push(off);
    dv.setUint32(off, 0x04034b50, true); // local header signature
    dv.setUint16(off + 4, 20, true); // version needed
    dv.setUint16(off + 6, 0, true); // flags
    dv.setUint16(off + 8, 0, true); // method: store
    dv.setUint16(off + 10, DOS_TIME, true);
    dv.setUint16(off + 12, DOS_DATE, true);
    dv.setUint32(off + 14, f.crc, true);
    dv.setUint32(off + 18, f.data.length, true); // compressed size (= stored)
    dv.setUint32(off + 22, f.data.length, true); // uncompressed size
    dv.setUint16(off + 26, f.name.length, true);
    dv.setUint16(off + 28, 0, true); // extra length
    out.set(f.name, off + 30);
    out.set(f.data, off + 30 + f.name.length);
    off += 30 + f.name.length + f.data.length;
  }

  // central directory
  const cdStart = off;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    dv.setUint32(off, 0x02014b50, true); // central header signature
    dv.setUint16(off + 4, 20, true); // version made by
    dv.setUint16(off + 6, 20, true); // version needed
    dv.setUint16(off + 8, 0, true); // flags
    dv.setUint16(off + 10, 0, true); // method: store
    dv.setUint16(off + 12, DOS_TIME, true);
    dv.setUint16(off + 14, DOS_DATE, true);
    dv.setUint32(off + 16, f.crc, true);
    dv.setUint32(off + 20, f.data.length, true);
    dv.setUint32(off + 24, f.data.length, true);
    dv.setUint16(off + 28, f.name.length, true);
    dv.setUint16(off + 30, 0, true); // extra
    dv.setUint16(off + 32, 0, true); // comment
    dv.setUint16(off + 34, 0, true); // disk
    dv.setUint16(off + 36, 0, true); // internal attrs
    dv.setUint32(off + 38, 0, true); // external attrs
    dv.setUint32(off + 42, offsets[i], true); // local header offset
    out.set(f.name, off + 46);
    off += 46 + f.name.length;
  }

  // end of central directory
  dv.setUint32(off, 0x06054b50, true);
  dv.setUint16(off + 4, 0, true); // this disk
  dv.setUint16(off + 6, 0, true); // cd start disk
  dv.setUint16(off + 8, files.length, true);
  dv.setUint16(off + 10, files.length, true);
  dv.setUint32(off + 12, centralSize, true);
  dv.setUint32(off + 16, cdStart, true);
  dv.setUint16(off + 20, 0, true); // comment length

  return out;
}
