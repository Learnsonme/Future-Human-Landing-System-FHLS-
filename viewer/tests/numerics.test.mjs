import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { Vector3, PerspectiveCamera, MeshStandardMaterial } from '../vendor/three.module.js';
import { normalizeLongitude, locationToRender, renderToLocation, moonToRender, renderToMoon,
  locationToPolar, polarToLocation, locationToUV, parseTime, sampleGlobal } from '../coordinates.js';
import { decodePNG16 } from '../png16.js';
import { decodeMoonTIFF } from '../globe.js';
import { Terrain } from '../terrain.js';
import { arcDirection, makeFlight, updateFlight } from '../navigation.js';
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
test('Flights reach exact targets without crossing the lunar sphere', () => {
  const camera = new PerspectiveCamera(); camera.position.set(4600,1200,2900);
  const controls = { target: new Vector3() };
  for (const [lat,lon] of [[-89.45,-137.3],[-90,0],[90,0],[0,179.9],[0,-179.9],[-84,0]]) {
    const f = makeFlight(camera,controls,lat,lon,7000,lat<=-84,1100,0);
    for (let ms=0;ms<1100;ms+=10) {
      assert.equal(updateFlight(f,camera,controls,ms),false);
      assert.ok(camera.position.length() >= 1737.4+14-1e-7);
      assert.ok(camera.quaternion.toArray().every(Number.isFinite));
    }
    assert.equal(updateFlight(f,camera,controls,1100),true);
    assert.ok(controls.target.distanceTo(new Vector3(...locationToRender(lat,lon,7000)))<1e-7);
    const look = camera.getWorldDirection(new Vector3());
    assert.ok(look.dot(controls.target.clone().sub(camera.position).normalize())>1-1e-8);
  }
});
test('UTC range validation and hourly selection', () => {
  assert.equal(parseTime('2027-01-01T00:29:00Z'),'2027-01-01T00:00:00.000Z');
  assert.equal(parseTime('2028-12-31T23:00:00Z'),'2028-12-31T23:00:00.000Z');
  for(const t of ['invalid','2027-01-01T00:00:00','2026-12-31T23:00:00Z','2029-01-01T00:00:00Z','2027-02-30T12:00:00Z','2027-01-01T24:00:00Z']) assert.throws(()=>parseTime(t));
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
test('Actual terrain meshes preserve 120 m registration, outward faces, borders and physical heights',async()=>{
  const manifest=JSON.parse(await readFile(new URL('terrain/index.json',data),'utf8'));
  const terrain=new Terrain(data);terrain.manifest=manifest;
  for(const file of ['south/2_2.png','south/3_2.png','south/overview.png']){
    const meta=manifest.tiles.find(t=>t.file===file),png=await decodePNG16(await buffer(new URL('terrain/'+file,data)));
    const tile={meta,heights:Float32Array.from(png.values,v=>meta.min_m+v/65535*(meta.max_m-meta.min_m))};
    if(meta.lod===0)terrain.overview=tile;else terrain.records.push(tile);
  }
  const material=new MeshStandardMaterial(),meshes=terrain.records.map(t=>terrain.mesh(t,material,1));
  for(let k=0;k<2;k++){
    const mesh=meshes[k],tile=terrain.records[k],p=mesh.geometry.attributes.position,m=tile.meta;
    assert.ok(p.count>=513*513);
    for(const [row,col] of [[0,0],[256,256],[512,512]]){
      const v=new Vector3().fromBufferAttribute(p,row*513+col),loc=renderToLocation(v.toArray()),xy=locationToPolar(loc.lat,loc.lon);
      near(xy.x,m.x0_km+col*.12,.0002);near(xy.y,m.y0_km+m.size_km-row*.12,.0002);
      near((v.length()-1737.4)*1000,tile.heights[row*513+col],.2);
    }
    const index=mesh.geometry.index;
    for(let i=0;i<mesh.userData.surfaceIndexCount;i+=3000){
      const a=new Vector3().fromBufferAttribute(p,index.getX(i)),b=new Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new Vector3().fromBufferAttribute(p,index.getX(i+2));
      assert.ok(b.sub(a).cross(c.sub(a)).dot(a)>0);
    }
  }
  const a=meshes[0].geometry.attributes.position,b=meshes[1].geometry.attributes.position;
  for(let row=0;row<513;row++){
    near(a.getX(row*513+512),b.getX(row*513));near(a.getY(row*513+512),b.getY(row*513));near(a.getZ(row*513+512),b.getZ(row*513));
  }
  const cap=terrain.mesh(terrain.overview,material,4);
  const p=cap.geometry.attributes.position,index=cap.geometry.index;
  for(let i=0;i<cap.userData.surfaceIndexCount;i++)assert.ok(renderToLocation(new Vector3().fromBufferAttribute(p,index.getX(i)).toArray()).lat<=-84+1e-5);
  for(const mesh of [...meshes,cap])mesh.geometry.dispose();material.dispose();terrain.dispose();
});
