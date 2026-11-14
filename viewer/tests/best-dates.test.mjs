import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCore, windows } from '../../core/fhls-core.js';
import { bestWindows, windowsCsv, windowLabel } from '../../web/components/best-dates.js';

test('ranking is longest first, earliest on ties, absolute and non-mutating; blackout uses earliest tie', () => {
  const power = Uint8Array.from([1,1,0,0,1,1,0,0,1,1,1]);
  const source = windows(power);
  const r = { start_index: 100, power, comms: power, windows: { both: source }, summary: { longest_dark_hours: 2 } };
  const s = bestWindows(r);
  assert.deepEqual(s.ranked, [{ start:108,end:111,hours:3 },{ start:100,end:102,hours:2 },{ start:104,end:106,hours:2 }]);
  assert.deepEqual(s.blackout, { start:102,end:104,hours:2 });
  assert.equal(source[0].start, 0);
  const timeOf = h => new Date(Date.UTC(2028,11,31,0) + h * 3600000);
  const last = { start:0,end:24,hours:24 };
  assert.equal(windowLabel(last,timeOf,true), '31 Dec 2028 00:00 UTC – 1 Jan 2029 00:00 UTC, 1.0 days');
  assert.match(windowsCsv({ kind:'both', ranked:[last] },timeOf), /end_utc_exclusive.*\n1,sunlight_and_earth,2028-12-31T00:00:00.000Z,2029-01-01T00:00:00.000Z,24,1.0/);
});

test('far side uses sunlight; permanent shadow and no overlap are distinct', () => {
  const power = Uint8Array.from([1,1,0]), off = new Uint8Array(3);
  const make = (p,c,b) => ({ start_index:0,power:p,comms:c,windows:{power:windows(p),both:windows(b)},summary:{longest_dark_hours:p===off?3:1} });
  const far = bestWindows(make(power,off,off));
  assert.equal(far.kind,'power'); assert.equal(far.noEarth,true); assert.equal(far.neverSunlit,false); assert.equal(far.ranked[0].hours,2);
  const shadow = bestWindows(make(off,off,off));
  assert.equal(shadow.neverSunlit,true); assert.deepEqual(shadow.ranked,[]); assert.equal(shadow.blackout.hours,3);
  const noOverlap = bestWindows(make(power,Uint8Array.from([0,0,1]),off));
  assert.equal(noOverlap.kind,'both'); assert.equal(noOverlap.noEarth,false); assert.equal(noOverlap.neverSunlit,false); assert.deepEqual(noOverlap.ranked,[]);
});

test('real data: connecting ridge, equator, far side and Shackleton floor', async () => {
  const data = new URL('../../data/', import.meta.url);
  const json = async p => JSON.parse(await readFile(new URL(p,data),'utf8'));
  const bin = async p => { const b = await readFile(new URL(p,data)); return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength); };
  const core = createCore({ ephemerisMeta:await json('ephemeris.json'),ephemerisBin:await bin('ephemeris.bin'),horizonIndex:await json('horizon/index.json'),loadBinary:p=>bin('horizon/'+p) });
  for (const [name,lat,lon] of [['ridge',-89.45,-137.3],['equator',0,0],['far side',0,180],['shadow',-89.67,129.8]]) {
    const r = await core.analyze(lat,lon), s = bestWindows(r);
    assert.equal(s.blackout?.hours || 0,r.summary.longest_dark_hours);
    if (name === 'ridge') assert.ok(s.ranked[0].hours > 24);
    if (name === 'equator') { assert.equal(r.summary.pct_earth,100); assert.ok(s.ranked[0].hours/24 > 13 && s.ranked[0].hours/24 < 16); }
    if (name === 'far side') { assert.equal(s.noEarth,true); assert.equal(s.kind,'power'); assert.equal(s.ranked.length,3); }
    if (name === 'shadow') { assert.equal(s.neverSunlit,true); assert.equal(s.blackout.hours,17544); }
    for (const w of s.ranked) {
      assert.equal(w.end-w.start,w.hours);
      assert.ok(r[s.kind].slice(w.start,w.end).every(Boolean));
    }
    console.log(`${name}: best ${s.ranked[0]?.hours || 0} h; blackout ${s.blackout?.hours || 0} h`);
  }
});
