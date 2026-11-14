import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { Vector3 } from '../vendor/three.module.js';
import { normalizeLongitude, locationToRender, renderToLocation, moonToRender, renderToMoon,
  locationToPolar, polarToLocation, locationToUV, parseTime, sampleGlobal } from '../coordinates.js';
import { decodePNG16 } from '../png16.js';
import { decodeMoonTIFF } from '../globe.js';
import { arcDirection } from '../navigation.js';
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const data = new URL('../../data/', import.meta.url);
const buffer = async url => { const b = await readFile(url); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

test('Moon-fixed basis and coordinate round trips cover poles and antimeridian', () => {
  const points = [[0,0],[0,90],[0,-90],[0,180],[90,0],[-90,0],[-89.45,-137.3]];
  for (let lat = -89; lat < 90; lat += 7) for (let lon = -180; lon < 180; lon += 11) points.push([lat,lon]);
  for (const [lat,lon] of points) {
    const p = locationToRender(lat,lon,4567), actual = renderToLocation(p);
    near(actual.lat,lat); near(actual.lon,Math.abs(lat) === 90 ? 0 : normalizeLongitude(lon));
    assert.deepEqual(moonToRender(renderToMoon(p)),p);
  }
  const east = new Vector3(...locationToRender(0,90)).normalize(); near(east.z,-1);
  near(locationToUV(0,0).u,.5); near(locationToUV(90,0).v,1); near(locationToUV(-90,0).v,0);
});
test('Polar registration and projection are not mirrored', () => {
  for (const lon of [0,45,90,180,-90,-137.3]) {
    const xy=locationToPolar(-88,lon), p=polarToLocation(xy.x,xy.y);near(p.lat,-88);near(normalizeLongitude(p.lon),normalizeLongitude(lon));
  }
  assert.ok(locationToPolar(-85,0).y>0);assert.ok(locationToPolar(-85,90).x>0);
});
test('Fly-to arcs stay finite, unit length and stable for antipodal targets', () => {
  for (const b of [new Vector3(-1,0,0),new Vector3(1,0,0),new Vector3(0,-1,0),new Vector3(-1,1e-7,0)]) {
    for(let i=0;i<=100;i++){const v=arcDirection(new Vector3(1,0,0),b,i/100);near(v.length(),1);assert.ok(v.toArray().every(Number.isFinite));}
    assert.ok(arcDirection(new Vector3(1,0,0),b,1).distanceTo(b.normalize())<1e-6);
  }
});
test('UTC range validation and hourly selection', () => {
  assert.equal(parseTime('2027-01-01T00:29:00Z'),'2027-01-01T00:00:00.000Z');
  assert.equal(parseTime('2028-12-31T23:00:00Z'),'2028-12-31T23:00:00.000Z');
  for(const t of ['invalid','2027-01-01T00:00:00','2026-12-31T23:00:00Z','2029-01-01T00:00:00Z']) assert.throws(()=>parseTime(t));
});

function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function chunk(type,data){const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc(body),out.length-4);return out;}
function pngFixture(filter){
  const w=4,h=2,rows=[Buffer.from([0,0,0,1,128,1,255,255]),Buffer.from([0,255,1,0,127,254,200,13])],raw=[];
  function paeth(a,b,c){const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;}
  for(let y=0;y<h;y++){raw.push(filter);for(let x=0;x<w*2;x++){const a=x>=2?rows[y][x-2]:0,b=y?rows[y-1][x]:0,c=y&&x>=2?rows[y-1][x-2]:0;raw.push((rows[y][x]-[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter]+256)%256);}}
  const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=16;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from(raw))),chunk('IEND',Buffer.alloc(0))]);
}
test('16-bit PNG preserves both bytes through all PNG filter types',async()=>{
  for(let filter=0;filter<5;filter++){
    const b=pngFixture(filter),p=await decodePNG16(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    assert.deepEqual([...p.values],[0,1,32769,65535,255,256,32766,51213]);
  }
  const b=pngFixture(0);b[30]^=1;await assert.rejects(()=>decodePNG16(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),/checksum/);
});
test('All 37 actual terrain images decode to manifest dimensions and shared physical edges',async()=>{
  const index=JSON.parse(await readFile(new URL('terrain/index.json',data),'utf8'));assert.equal(index.synthetic,false);assert.equal(index.tiles.length,37);
  const images=new Map();
  for(const t of index.tiles){
    const p=await decodePNG16(await buffer(new URL('terrain/'+t.file,data)));assert.equal(p.width,t.px);assert.equal(p.height,t.px);
    near(t.size_km,(t.px-1)*t.spacing_km);images.set(t.file,{...p,meta:t});
  }
  const height=(image,i)=>image.meta.min_m+image.values[i]/65535*(image.meta.max_m-image.meta.min_m);
  for(let y=0;y<6;y++)for(let x=0;x<5;x++){
    const a=images.get(`south/${x}_${y}.png`),b=images.get(`south/${x+1}_${y}.png`);
    for(let j=0;j<513;j++)near(height(a,j*513+512),height(b,j*513),.25);
  }
  for(let y=0;y<5;y++)for(let x=0;x<6;x++){
    const a=images.get(`south/${x}_${y}.png`),b=images.get(`south/${x}_${y+1}.png`);
    for(let i=0;i<513;i++)near(height(a,i),height(b,512*513+i),.25);
  }
});
test('Numerical CGI displacement loads and wraps at the antimeridian',async()=>{
  const p=decodeMoonTIFF(await buffer(new URL('../assets/moon-displacement.tiff',import.meta.url)));
  assert.equal(p.width,1440);assert.equal(p.height,720);
  let min=Infinity,max=-Infinity;for(const h of p.values){min=Math.min(min,h);max=Math.max(max,h);}assert.ok(min < -5000 && max > 5000);
  near(sampleGlobal(p.values,p.width,p.height,0,180),sampleGlobal(p.values,p.width,p.height,0,-180));
});
