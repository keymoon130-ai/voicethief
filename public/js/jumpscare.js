// 잡혔을 때 점프스케어: 어둠 속에서 토토 얼굴이 화면으로 덮쳐 옴 (따로 그리는 작은 장면)
import * as THREE from 'three';

export function makeJumpscare(buildToto) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#000');
  const toto = buildToto({ creepy: true }); scene.add(toto);
  scene.add(new THREE.AmbientLight('#ff9080', 0.12));
  const red = new THREE.PointLight('#ff2a1a', 0, 7, 1.4); scene.add(red);
  const key = new THREE.SpotLight('#fff4e0', 0, 9, 0.7, 0.4, 1); scene.add(key, key.target);
  const cam = new THREE.PerspectiveCamera(55, 1, 0.03, 30);
  toto.updateMatrixWorld(true);
  const head = toto.userData.head, box = new THREE.Box3().setFromObject(head), hp = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length() / 2;
  const NEAR = rad * 1.15 + 0.1, FAR = NEAR + 6;
  const base = head.rotation.clone();
  let t = -1;
  const DUR = 1.35;
  return {
    get active() { return t >= 0 && t < DUR; },
    start() { t = 0; },
    render(renderer, dt, aspect) {
      t += dt;
      // 0~0.18 어둠 속 멀리 · 0.18~0.34 확 덮침 · 이후 코앞에서 떨림 · 끝에 꺼짐
      const lunge = t < 0.18 ? 0 : Math.min(1, (t - 0.18) / 0.16);
      const d = FAR - (FAR - NEAR) * (1 - Math.pow(1 - lunge, 3));
      const sh = lunge > 0 ? 0.035 * (1 - Math.max(0, t - 0.9) * 2) : 0;
      cam.aspect = aspect; cam.fov = 55 - lunge * 10; cam.up.set(Math.sin(t * 9) * 0.06 * lunge, 1, 0); cam.updateProjectionMatrix();
      cam.position.set(hp.x + (Math.random() - 0.5) * sh, hp.y - rad * 0.1 + (Math.random() - 0.5) * sh, hp.z + d);
      cam.lookAt(hp.x, hp.y - rad * 0.12, hp.z);
      head.rotation.set(base.x + (Math.random() - 0.5) * 0.12 * lunge, base.y + (Math.random() - 0.5) * 0.12 * lunge, base.z + Math.sin(t * 40) * 0.08 * lunge);
      const flick = Math.random() < 0.15 ? 0.2 : 1;
      red.intensity = (t < 0.18 ? 2.5 : 26) * flick; red.position.set(hp.x, hp.y - rad * 1.4, hp.z + NEAR + 0.4);
      key.intensity = lunge > 0 ? 40 * flick : 0; key.position.set(hp.x + rad, hp.y + rad * 2, hp.z + NEAR + 1.5); key.target.position.copy(hp);
      if (t > DUR - 0.12) { red.intensity = key.intensity = 0; }
      renderer.render(scene, cam);
    }
  };
}
