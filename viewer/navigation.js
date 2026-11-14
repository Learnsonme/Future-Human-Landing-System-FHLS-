import { Vector3, Quaternion, Matrix4 } from './vendor/three.module.js';
import { locationToRender, localFrame, moonToRender, R_KM } from './coordinates.js';

// Match design/style.md's cubic-bezier(.4, 0, .2, 1), including inversion
// of its time (x) coordinate rather than treating the curve parameter as time.
export function ease(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 24; i++) {
    u = (lo + hi) / 2;
    const x = 3 * (1-u) * (1-u) * u * .4 + 3 * (1-u) * u * u * .2 + u*u*u;
    if (x < t) lo = u; else hi = u;
  }
  return 3 * (1-u) * u*u + u*u*u;
}

// Change only the initial presentation viewpoint. The MOON_ME Sun and the
// Moon's orientation stay untouched. A 30° phase angle shows a gibbous Moon.
export function sunlitCameraPosition(moonSun, distance) {
  const sun = new Vector3(...moonToRender(moonSun)).normalize();
  let side = new Vector3().crossVectors(new Vector3(0, 1, 0), sun);
  if (side.lengthSq() < 1e-10) side = new Vector3(1, 0, 0);
  return sun.multiplyScalar(Math.cos(Math.PI / 6))
    .addScaledVector(side.normalize(), Math.sin(Math.PI / 6)).multiplyScalar(distance);
}

export function arcDirection(from, to, t) {
  const a = from.clone().normalize(), b = to.clone().normalize(), dot = Math.max(-1, Math.min(1, a.dot(b)));
  if (dot > 0.999999) return a.lerp(b, t).normalize();
  if (dot < -0.999999) {
    const helper = Math.abs(a.x) < 0.8 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    return a.applyAxisAngle(new Vector3().crossVectors(a, helper).normalize(), Math.PI * t);
  }
  const angle = Math.acos(dot), s = Math.sin(angle);
  return a.multiplyScalar(Math.sin((1 - t) * angle) / s).addScaledVector(b, Math.sin(t * angle) / s).normalize();
}

export function makeFlight(camera, controls, lat, lon, heightM, detailed, duration, now) {
  const frame = localFrame(lat, lon), up = new Vector3(...frame.up), north = new Vector3(...frame.north);
  const target = new Vector3(...locationToRender(lat, lon, heightM));
  const position = target.clone().addScaledVector(up, detailed ? 24 : 110).addScaledVector(north, detailed ? -26 : -65);
  const matrix = new Matrix4().lookAt(position, target, up);
  return { start: now, duration, fromPosition: camera.position.clone(), position,
    fromTarget: controls.target.clone(), target, fromQ: camera.quaternion.clone(),
    toQ: new Quaternion().setFromRotationMatrix(matrix), up, detailed, lat, lon };
}

export function updateFlight(flight, camera, controls, now) {
  const t = Math.min(1, (now - flight.start) / flight.duration), e = ease(t);
  const distance = flight.fromPosition.length() * (1 - e) + flight.position.length() * e;
  camera.position.copy(arcDirection(flight.fromPosition, flight.position, e)).multiplyScalar(Math.max(R_KM + 14, distance));
  camera.quaternion.slerpQuaternions(flight.fromQ, flight.toQ, e);
  controls.target.lerpVectors(flight.fromTarget, flight.target, e);
  if (t === 1) {
    camera.position.copy(flight.position); camera.up.copy(flight.up); camera.lookAt(flight.target);
  }
  return t === 1;
}
