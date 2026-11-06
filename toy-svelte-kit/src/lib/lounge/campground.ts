import * as THREE from "three";
import camp from "../assets/data/lounge/campground.json";

export class Campground {
  readonly floor: THREE.Mesh;
  readonly lake: THREE.Mesh;
  readonly logs: THREE.Mesh[] = [];
  private waterTime = { value: 0 };
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.Material>();
  private batches = new Map<string, THREE.Matrix4[]>();
  private root = new THREE.Matrix4();
  private dummy = new THREE.Object3D();
  private light = new THREE.PointLight(0xffac55, 19, 9, 1.5);
  private flames: THREE.InstancedMesh;
  private embers: THREE.InstancedMesh;
  private glow: THREE.Mesh;
  private group = new THREE.Group();
  private randomState = 613;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.geometries.set("box", new THREE.BoxGeometry(1, 1, 1));
    this.geometries.set("rock", new THREE.IcosahedronGeometry(1, 0));
    this.geometries.set("cone", new THREE.ConeGeometry(1, 1, 7));
    this.geometries.set("cylinder", new THREE.CylinderGeometry(1, 1, 1, 9));
    this.geometries.set("circle", new THREE.CircleGeometry(1, 48));
    this.geometries.set("grass", new THREE.ConeGeometry(1, 1, 3));
    this.geometries.set("log-hit", new THREE.BoxGeometry(.64, .6, 1.9));
    this.materials.set("log-hit", new THREE.MeshBasicMaterial({ visible: false }));
    const triangle = new THREE.Shape(); triangle.moveTo(-1.25, 0); triangle.lineTo(1.25, 0); triangle.lineTo(0, 1.65); triangle.closePath();
    this.geometries.set("tent-door", new THREE.ShapeGeometry(triangle));
    const earth = new THREE.PlaneGeometry(38, 31, 1, 1); this.geometries.set("earth", earth);
    this.floor = new THREE.Mesh(earth, this.material("#53684c")); this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -0.025; this.group.add(this.floor);
    const lake = camp.lake;
    this.part("circle", "#8a8766", lake.x, -.015, lake.z, lake.radius + .29, lake.radius + .29, 1, -Math.PI / 2);
    const water = new THREE.ShaderMaterial({
      uniforms: {
        time: this.waterTime,
        deep: { value: new THREE.Color("#31576c") },
        shallow: { value: new THREE.Color("#679b92") },
        lightWater: { value: new THREE.Color("#a4c8b5") }
      },
      vertexShader: `
        varying vec2 lakeUv;
        void main() {
          lakeUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 lakeUv;
        uniform float time;
        uniform vec3 deep, shallow, lightWater;
        void main() {
          vec2 uv = lakeUv * 2.0 - 1.0;
          float shore = smoothstep(.46, 1.0, length(uv));
          float wake = sin(uv.y * 46.0 + sin(uv.x * 6.0) * 1.35 - time * 1.35);
          float glint = smoothstep(.94, 1.0, wake) * smoothstep(.03, .72, sin(uv.x * 13.0 + uv.y * 4.0));
          vec3 color = mix(deep, shallow, shore);
          color = mix(color, lightWater, glint * .23 + smoothstep(.973, 1.0, length(uv)) * .37);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.materials.set("lake-water", water);
    this.lake = new THREE.Mesh(this.geometries.get("circle"), water);
    this.lake.rotation.x = -Math.PI / 2;
    this.lake.scale.set(lake.radius, lake.radius, 1);
    this.lake.position.set(lake.x, .004, lake.z);
    this.lake.userData.lakeId = "lake";
    this.group.add(this.lake);
    for (let n = 0; n < 6; n += 1) {
      this.part("box", n % 2 ? "#aa8962" : "#bb9b71", lake.x + lake.radius - .28 + n * .23, .021, lake.z, .219, .05, 1.14);
    }
    for (const z of [-.49, .49]) this.part("cylinder", "#6d5541", lake.x + lake.radius - .3, .08, lake.z + z, .07, .26, .07);
    for (let n = 1; n < 13; n += 1) {
      const angle = n * Math.PI * 2 / 13;
      if (Math.cos(angle) > .85) continue;
      const x = lake.x + Math.cos(angle) * (lake.radius + .19);
      const z = lake.z + Math.sin(angle) * (lake.radius + .19);
      this.part("rock", n % 2 ? "#929887" : "#a2a18b", x, .065, z, .16, .10, .11, 0, angle);
      if (n % 3 === 0) for (const offset of [-.12, 0, .12]) {
        this.part("grass", "#758950", x + offset, .18, z + .08, .08, .35 + offset, .08, 0, angle, offset);
      }
    }
    this.part("circle", "#827956", 0, -0.014, 0, 4.3, 3.8, 1, -Math.PI / 2);
    this.part("circle", "#958361", 0, -0.009, 0.15, 2.8, 2.5, 1, -Math.PI / 2);
    for (let n = 0; n < 32; n += 1) {
      const z = -8.5 + n * 0.55; const x = Math.sin(z * 0.48) * 1.5;
      this.part("circle", "#827956", x, -0.018, z, 0.9 + this.random() * 0.18, 0.75, 1, -Math.PI / 2);
    }
    for (let n = 0; n < 76; n += 1) {
      const side = n % 4; const across = this.random() * 2 - 1;
      const x = side < 2 ? across * 15.5 : (side === 2 ? -1 : 1) * (12.3 + this.random() * 3.8);
      const z = side < 2 ? (side === 0 ? -1 : 1) * (9.3 + this.random() * 3.5) : across * 11.8;
      const height = 1.8 + this.random() * 2.4;
      this.part("cylinder", "#66503e", x, height * 0.3, z, 0.12, height * 0.6, 0.12);
      const tint = ["#355a48", "#426b50", "#51734f"][n % 3];
      for (let tier = 0; tier < 3; tier += 1) this.part("cone", tint, x, height * (0.43 + tier * 0.22), z, height * (0.34 - tier * 0.065), height * 0.56, height * (0.34 - tier * 0.065));
    }
    for (let n = 0; n < 200; n += 1) {
      const x = (this.random() - 0.5) * 27; const z = (this.random() - 0.5) * 21;
      if (Math.hypot(x, z) < 4 || Math.hypot(x - lake.x, z - lake.z) < lake.radius + .7
        || camp.obstacles.some((item) => Math.hypot(x - item.x, z - item.z) < item.radius + 0.5)) continue;
      const size = 0.08 + this.random() * 0.09;
      this.part("grass", n % 2 ? "#66805a" : "#82916a", x, size / 2, z, 0.07, size, 0.08, 0, this.random() * 6);
      if (n % 5 === 0) this.part("rock", "#829080", x + 0.3, 0.07, z, 0.12, 0.08, 0.1, 0, this.random() * 6);
    }
    for (const tent of camp.tents) {
      this.root.makeRotationY(tent.rotation); this.root.setPosition(tent.x, 0, tent.z);
      this.part("box", "#685744", 0, 0.035, 0, 3.1, 0.1, 2.8);
      this.part("tent-door", "#293a37", 0, 0.09, 1.2, 1, 1, 1);
      this.part("tent-door", tent.color, 0, 0.09, -1.2, 1, 1, 1, 0, Math.PI);
      for (const side of [-1, 1]) {
        this.part("box", tent.color, side * 0.65, 0.94, 0, 2.12, 0.045, 2.55, 0, 0, side * -0.92);
        this.part("box", tent.trim, side * 0.65, 0.94, 1.3, 2.15, 0.06, 0.055, 0, 0, side * -0.92);
        this.part("box", tent.trim, side * 0.82, 0.57, 1.21, 0.46, 1.1, 0.045, 0, 0, side * -0.24);
      }
      this.part("box", "#c5aa7b", 0, 1.8, 0, 0.075, 0.075, 2.85);
      this.part("box", "#b3976c", 0.1, 0.04, 1.8, 1.5, 0.04, 0.8);
      this.lantern(-1.5, 0.28, 1.5);
      this.root.identity();
    }
    this.root.makeTranslation(camp.picnic.x, 0, camp.picnic.z);
    for (const z of [-0.48, -0.24, 0, 0.24, 0.48]) this.part("box", "#ad8c5f", 0, 0.77, z, 2.1, 0.09, 0.2);
    for (const x of [-0.7, 0.7]) for (const side of [-1, 1]) this.part("box", "#695541", x, 0.39, side * 0.35, 0.1, 0.8, 0.1, side * 0.4);
    for (const z of [-0.87, 0.87]) { this.part("box", "#ad8c5f", 0, 0.4, z, 2.2, 0.09, 0.3); for (const x of [-0.75, 0.75]) this.part("box", "#695541", x, 0.21, z, 0.12, 0.42, 0.12); }
    this.lantern(-0.5, 0.92, 0); this.part("box", "#688f91", 1.8, 0.27, -0.25, 0.6, 0.5, 0.45); this.part("box", "#d3d8bc", 1.8, 0.54, -0.25, 0.65, 0.08, 0.5); this.root.identity();
    this.part("circle", "#454336", 0, 0.005, 0, 0.81, 0.81, 1, -Math.PI / 2);
    for (let n = 0; n < 14; n += 1) { const a = n * Math.PI / 7; this.part("rock", n % 2 ? "#a29e86" : "#7f8779", Math.cos(a) * 0.77, 0.12, Math.sin(a) * 0.77, 0.2, 0.15, 0.17, 0, a); }
    for (const turn of [-0.65, 0.65]) this.part("cylinder", "#624431", 0, 0.15, 0, 0.105, 1.12, 0.105, Math.PI / 2, 0, turn);
    for (const [index, log] of camp.logs.entries()) {
      this.root.makeRotationY(log.rotation); this.root.setPosition(log.x, 0, log.z);
      this.part("cylinder", "#755039", 0, 0.24, 0, 0.24, 1.65, 0.24, Math.PI / 2);
      for (const z of [-0.83, 0.83]) this.part("circle", "#c5a373", 0, 0.24, z, 0.2, 0.2, 1, 0, z < 0 ? Math.PI : 0);
      const hit = new THREE.Mesh(this.geometries.get("log-hit"), this.materials.get("log-hit"));
      hit.position.set(log.x, .3, log.z); hit.rotation.y = log.rotation; hit.userData.logId = `log-${index}`;
      this.logs.push(hit); this.group.add(hit);
      this.root.identity();
    }
    for (const [x, z] of camp.lanterns) { this.part("cylinder", "#80684b", x, 1.45, z, 0.06, 2.9, 0.06); this.lantern(x, 2.7, z); }
    for (const [start, end] of [[camp.lanterns[0], camp.lanterns[1]], [camp.lanterns[0], camp.lanterns[2]], [camp.lanterns[1], camp.lanterns[3]]]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(start[0], 2.9, start[1]), new THREE.Vector3((start[0] + end[0]) / 2, 2.22, (start[1] + end[1]) / 2), new THREE.Vector3(end[0], 2.9, end[1]));
      const key = `rope${this.geometries.size}`; this.geometries.set(key, new THREE.TubeGeometry(curve, 20, 0.016, 4, false)); this.part(key, "#514e3f", 0, 0, 0, 1, 1, 1);
      for (let n = 1; n <= 9; n += 1) { const point = curve.getPoint(n / 10); this.part("rock", "light:#ffdb99", point.x, point.y - 0.05, point.z, 0.055, 0.08, 0.055); }
    }
    for (const [key, matrices] of this.batches) {
      const [geometry, color] = key.split("|"); const mesh = new THREE.InstancedMesh(this.geometries.get(geometry)!, this.material(color), matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix)); mesh.computeBoundingSphere(); this.group.add(mesh);
    }
    this.batches.clear();
    this.light.position.set(0, 1.05, 0); this.group.add(this.light);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffbc68, transparent: true, opacity: 0.13, depthWrite: false }); this.materials.set("glow", glowMaterial);
    this.glow = new THREE.Mesh(this.geometries.get("circle"), glowMaterial); this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.009; this.glow.scale.setScalar(2.2); this.group.add(this.glow);
    const fireMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false }); this.materials.set("fire", fireMaterial);
    this.flames = new THREE.InstancedMesh(this.geometries.get("cone"), fireMaterial, 9); this.flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.flames.frustumCulled = false;
    for (let n = 0; n < 9; n += 1) this.flames.setColorAt(n, new THREE.Color(n < 5 ? "#f48d3f" : "#ffe3a0")); this.group.add(this.flames);
    this.embers = new THREE.InstancedMesh(this.geometries.get("rock"), this.material("light:#ffc579"), 18); this.embers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.embers.frustumCulled = false; this.group.add(this.embers);
    this.animate(0, true);
  }
  private random() { this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0; return this.randomState / 4294967296; }
  private material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, color.startsWith("light:") ? new THREE.MeshBasicMaterial({ color: color.slice(6) }) : new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
    return this.materials.get(color)!;
  }
  private part(geometry: string, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    this.dummy.position.set(x, y, z); this.dummy.rotation.set(rx, ry, rz); this.dummy.scale.set(sx, sy, sz); this.dummy.updateMatrix();
    const key = `${geometry}|${color}`; if (!this.batches.has(key)) this.batches.set(key, []);
    this.batches.get(key)!.push(new THREE.Matrix4().multiplyMatrices(this.root, this.dummy.matrix));
  }
  private lantern(x: number, y: number, z: number) {
    this.part("cylinder", "light:#ffcf80", x, y, z, 0.09, 0.18, 0.09);
    for (const dy of [-0.115, 0.115]) this.part("cylinder", "#384d48", x, y + dy, z, 0.13, 0.05, 0.13);
  }
  animate(time: number, reduced: boolean) {
    const t = reduced ? 0 : time;
    this.waterTime.value = t;
    for (let n = 0; n < 9; n += 1) {
      const angle = n * 2.4; const radius = n < 5 ? 0.22 : 0.1; const height = (n < 5 ? 0.64 : 0.5) + Math.sin(t * 4.1 + n) * 0.12;
      this.dummy.position.set(Math.cos(angle) * radius, 0.17 + height / 2, Math.sin(angle) * radius); this.dummy.rotation.set(Math.sin(t * 2 + n) * 0.12, angle, Math.cos(t * 3 + n) * 0.15); this.dummy.scale.set(n < 5 ? 0.24 : 0.14, height, n < 5 ? 0.21 : 0.13); this.dummy.updateMatrix(); this.flames.setMatrixAt(n, this.dummy.matrix);
    }
    this.flames.instanceMatrix.needsUpdate = true;
    this.embers.visible = !reduced;
    if (!reduced) {
      for (let n = 0; n < 18; n += 1) {
        const progress = (t * 0.28 + n / 18) % 1; const angle = n * 2.4 + progress;
        this.dummy.position.set(Math.sin(angle) * (0.12 + progress * 0.55), 0.5 + progress * 2.1, Math.cos(angle) * (0.15 + progress * 0.5)); this.dummy.rotation.set(0, angle, angle); this.dummy.scale.setScalar((1 - progress) * 0.024); this.dummy.updateMatrix(); this.embers.setMatrixAt(n, this.dummy.matrix);
      }
      this.embers.instanceMatrix.needsUpdate = true;
    }
    this.light.intensity = 19 + Math.sin(t * 3.3) * 1.6 + Math.sin(t * 6.1) * 0.7;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.13 + Math.sin(t * 3.3) * 0.012;
  }
  dispose() { this.group.removeFromParent(); for (const geometry of this.geometries.values()) geometry.dispose(); for (const material of this.materials.values()) material.dispose(); }
}
