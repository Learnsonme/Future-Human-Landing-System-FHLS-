import { Vector3, Quaternion, Matrix4 } from './vendor/three.module.js';
import { locationToRender, localFrame, moonToRender } from './coordinates.js';

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

/** P11 · ease-in-out for flights: zero speed and zero acceleration at both ends (no jolt, no stutter on arrival). */
export function flightEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * t * (t * (6 * t - 15) + 10);
}

/** P11 · flight time from how far the camera travels: 1.2 s for a short hop … 2.5 s across the Moon. */
export function flightDuration(fromPosition, toPosition) {
  const a = fromPosition.clone().normalize(), b = toPosition.clone().normalize();
  const angle = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  const travelKm = angle * (fromPosition.length() + toPosition.length()) / 2 + Math.abs(fromPosition.length() - toPosition.length());
  return 1200 + 1300 * Math.min(1, travelKm / 4000);
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
  // detailed: true = 40/120 m polar tiles (close), 'mid' = 474 m whole-Moon tiles, false = globe only.
  const [rise, back] = detailed === 'mid' ? [60, -70] : detailed ? [24, -26] : [110, -65];
  const position = target.clone().addScaledVector(up, rise).addScaledVector(north, back);
  const matrix = new Matrix4().lookAt(position, target, up);
  // P11: duration null → from the distance travelled
  duration ??= flightDuration(camera.position, position);
  return { start: now, duration, fromPosition: camera.position.clone(), position,
    fromTarget: controls.target.clone(), target, fromQ: camera.quaternion.clone(),
    toQ: new Quaternion().setFromRotationMatrix(matrix), up, detailed, lat, lon };
}

export function updateFlight(flight, camera, controls, now) {
  const t = Math.max(0, Math.min(1, (now - flight.start) / flight.duration)), e = flightEase(t);
  const distance = flight.fromPosition.length() * (1 - e) + flight.position.length() * e;
  // Interpolate the actual endpoint radii. A fixed 14 km floor used to pop a
  // close-up camera outwards at takeoff and jump on arrival at a sky viewpoint.
  // The viewer enforces clearance against the actual local relief each frame.
  camera.position.copy(arcDirection(flight.fromPosition, flight.position, e)).multiplyScalar(distance);
  camera.quaternion.slerpQuaternions(flight.fromQ, flight.toQ, e);
  controls.target.lerpVectors(flight.fromTarget, flight.target, e);
  if (t === 1) {
    camera.position.copy(flight.position); camera.up.copy(flight.up); camera.lookAt(flight.target);
  }
  return t === 1;
}
