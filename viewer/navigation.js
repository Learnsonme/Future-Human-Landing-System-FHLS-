import { Vector3, Quaternion, Matrix4 } from './vendor/three.module.js';
import { locationToRender, localFrame, R_KM } from './coordinates.js';
export const ease = t => t * t * (3 - 2 * t);

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
