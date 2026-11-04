import * as THREE from "three";
import type { LoungeAppearance, LoungeHairStyle } from "../types/LoungeAppearance";

const skin = new THREE.Color("#efc49c");
const shoe = new THREE.Color("#454757");
const hairShapes: Record<LoungeHairStyle, [number, number, number]> = {
  short: [1.28, 1.69, 1.05],
  bob: [1.19, 2.46, 1.45],
  long: [1.21, 2.65, 1.66],
  ponytail: [1.16, 1.86, 1.04],
  bun: [1.13, 1.8, 1.02],
  twintails: [1.23, 1.84, 1.12],
  spiky: [1.3, 1.66, 1.1],
  buzz: [1.17, 1.49, .3]
};

// Fit each cap to the supplied head silhouette in bind coordinates once.
const caps = new WeakMap<THREE.BufferGeometry, Map<LoungeHairStyle, THREE.BufferGeometry>>();
const heads = new WeakMap<THREE.BufferGeometry, THREE.Triangle[]>();
function headTriangles(body: THREE.BufferGeometry) {
  const cached = heads.get(body);
  if (cached) return cached;
  const source = body.getAttribute("position");
  const index = body.getIndex()!;
  const triangles: THREE.Triangle[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(source, index.getX(i));
    const b = new THREE.Vector3().fromBufferAttribute(source, index.getX(i + 1));
    const c = new THREE.Vector3().fromBufferAttribute(source, index.getX(i + 2));
    if (Math.min(a.y, b.y, c.y) > 20) triangles.push(new THREE.Triangle(a, b, c));
  }
  heads.set(body, triangles);
  return triangles;
}

function hairCap(body: THREE.BufferGeometry, style: LoungeHairStyle) {
  let byStyle = caps.get(body);
  if (!byStyle) caps.set(body, byStyle = new Map());
  const cached = byStyle.get(style);
  if (cached) return cached;
  const [front, back, thickness] = hairShapes[style];
  const geometry = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * .9);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const center = new THREE.Vector3(0, 34.5, .25);
  const ray = new THREE.Ray(center, new THREE.Vector3());
  const hit = new THREE.Vector3();
  const triangles = headTriangles(body);
  for (let i = 0; i < position.count; i += 1) {
    const phi = uv.getX(i) * Math.PI * 2;
    const v = 1 - uv.getY(i);
    const facing = Math.cos(phi);
    const edge = THREE.MathUtils.lerp(front, back, THREE.MathUtils.smoothstep(1 - facing, .2, 1.12));
    const theta = v * (edge + .055 * Math.sin(phi * 3) * Math.max(0, facing));
    ray.direction.set(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * facing);
    let distance = Infinity;
    for (const tri of triangles) {
      if (ray.intersectTriangle(tri.a, tri.b, tri.c, false, hit)) distance = Math.min(distance, hit.distanceTo(center));
    }
    if (!Number.isFinite(distance)) distance = 13;
    const spike = style === "spiky" ? Math.max(0, Math.cos(phi * 7)) * Math.sin(theta * 2) ** 2 * 3.4 : 0;
    ray.at(distance + thickness + spike, hit);
    if (style === "long") hit.y -= v ** 4 * (1 - facing) * 3.1;
    position.setXYZ(i, hit.x, hit.y, hit.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  byStyle.set(style, geometry);
  return geometry;
}

const tuft = new THREE.SphereGeometry(1, 12, 8);
const skirtShort = new THREE.CylinderGeometry(8, 11, 4.6, 20);
const skirtLong = new THREE.CylinderGeometry(8, 11.5, 7.1, 20);
const collarShape = new THREE.TorusGeometry(2.8, .4, 6, 20);
const mouthInk = new THREE.MeshBasicMaterial({ color: "#513230", side: THREE.DoubleSide });
const tonguePink = new THREE.MeshBasicMaterial({ color: "#d77986", side: THREE.DoubleSide });
const gestureSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: .77 });
const faces = new WeakMap<THREE.BufferGeometry, THREE.ShapeGeometry[]>();

function mouthShapes(body: THREE.BufferGeometry) {
  const cached = faces.get(body);
  if (cached) return cached;
  const smile = new THREE.Shape();
  smile.moveTo(-2.2, 25.8);
  smile.quadraticCurveTo(0, 23.8, 2.2, 25.8);
  smile.quadraticCurveTo(0, 24.7, -2.2, 25.8);
  const laugh = new THREE.Shape();
  laugh.absellipse(0, 25.3, 2.25, 1.42, 0, Math.PI * 2, false);
  const tongue = new THREE.Shape();
  tongue.absellipse(0, 24.45, 1.1, 1.3, 0, Math.PI * 2, false);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  const point = new THREE.Vector3();
  const shapes = [smile, laugh, tongue].map((shape, index) => {
    const geometry = new THREE.ShapeGeometry(shape, 16);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      ray.origin.set(x, y, 30);
      let front = 0;
      for (const tri of headTriangles(body)) {
        if (ray.intersectTriangle(tri.a, tri.b, tri.c, false, point)) front = Math.max(front, point.z);
      }
      position.setXYZ(i, x, y, front + .18 + (index === 2 ? .16 : 0));
    }
    return geometry;
  });
  faces.set(body, shapes);
  return shapes;
}

export class ChibiWardrobe {
  private top = { value: new THREE.Color() };
  private bottom = { value: new THREE.Color() };
  private sleeve = { value: 0 };
  private hem = { value: 0 };
  private gesture = { value: 0 };
  private bodyMaterial: THREE.MeshStandardMaterial;
  private hairMaterial = new THREE.MeshStandardMaterial({ roughness: .88, side: THREE.DoubleSide });
  private skirtMaterial = new THREE.MeshStandardMaterial({ roughness: .96 });
  private trim = new THREE.MeshStandardMaterial({ color: "#f4ede1", roughness: .94 });
  private hoodMaterial = new THREE.MeshStandardMaterial({ roughness: .96 });
  private cap: THREE.Mesh;
  private tails: THREE.Mesh[];
  private skirt: THREE.Mesh;
  private collar: THREE.Mesh;
  private hood: THREE.Mesh;
  private face: THREE.Mesh[];
  private finger: THREE.Group;
  topY = 48;

  constructor(private body: THREE.SkinnedMesh, rig: THREE.Group, head: THREE.Bone, hips: THREE.Bone, chest: THREE.Bone, rightHand: THREE.Bone) {
    this.bodyMaterial = (body.material as THREE.MeshStandardMaterial).clone();
    this.bodyMaterial.color.set(0xffffff);
    this.bodyMaterial.customProgramCacheKey = () => "lounge-chibi-clothes";
    this.bodyMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { chibiTop: this.top, chibiBottom: this.bottom, chibiSleeve: this.sleeve,
        chibiHem: this.hem, chibiGesture: this.gesture, chibiSkin: { value: skin }, chibiShoe: { value: shoe } });
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 chibiRest;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nchibiRest = position;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 chibiRest;
uniform vec3 chibiTop, chibiBottom, chibiSkin, chibiShoe;
uniform float chibiSleeve, chibiHem, chibiGesture;`).replace("#include <color_fragment>", `#include <color_fragment>
if (chibiGesture > .5 && chibiRest.x < -16.5) discard;
float chibiX = abs(chibiRest.x);
float chibiY = chibiRest.y;
vec3 outfit = chibiSkin;
if (chibiY >= 9.4 && chibiY < 20.05 && (chibiY < 19.15 || chibiX > 3.2) && chibiX < chibiSleeve) outfit = chibiTop;
else if (chibiY < 2.0) outfit = chibiShoe;
else if (chibiY < 9.4 && chibiY >= chibiHem) outfit = chibiBottom;
diffuseColor.rgb *= outfit;`);
    };
    body.material = this.bodyMaterial;
    const attach = (mesh: THREE.Mesh, bone: THREE.Bone) => {
      rig.add(mesh);
      bone.attach(mesh);
      return mesh;
    };
    this.cap = attach(new THREE.Mesh(hairCap(body.geometry, "short"), this.hairMaterial), head);
    this.tails = [new THREE.Mesh(tuft, this.hairMaterial), new THREE.Mesh(tuft, this.hairMaterial)];
    this.skirt = new THREE.Mesh(skirtShort, this.skirtMaterial);
    this.skirt.position.set(0, 6.8, .55);
    attach(this.skirt, hips);
    this.collar = new THREE.Mesh(collarShape, this.trim);
    this.collar.position.set(0, 19.1, 3.3);
    this.collar.rotation.x = Math.PI / 2;
    attach(this.collar, chest);
    this.hood = new THREE.Mesh(tuft, this.hoodMaterial);
    this.hood.position.set(0, 17.8, -3.9);
    this.hood.scale.set(4.5, 3.2, 3.1);
    attach(this.hood, chest);
    // Keep tail coordinates in the same bind space as the cap.
    this.cap.add(...this.tails);
    this.face = mouthShapes(body.geometry).map((geometry, index) =>
      attach(new THREE.Mesh(geometry, index === 2 ? tonguePink : mouthInk), head));
    this.finger = new THREE.Group();
    const knuckles = new THREE.Mesh(tuft, gestureSkin);
    knuckles.position.set(-16.9, 17.45, -.4);
    knuckles.scale.set(1.7, 1.7, 2.6);
    const middle = new THREE.Mesh(tuft, gestureSkin);
    middle.position.set(-19.3, 17.85, -.55);
    middle.scale.set(2.8, .82, .86);
    this.finger.add(knuckles, middle);
    rig.add(this.finger);
    rightHand.attach(this.finger);
    this.expression(false, false, false);
  }

  apply(value: LoungeAppearance) {
    this.top.value.set(value.topColor);
    this.bottom.value.set(value.pantsColor);
    this.sleeve.value = value.topStyle === "sleeveless" ? 5.7 : value.topStyle === "shortSleeve" ? 9.3 : 13.25;
    const skirt = value.bottomStyle === "longSkirt" || value.bottomStyle === "shortSkirt";
    this.hem.value = skirt ? 10 : value.bottomStyle === "shortPants" ? 4.8 : 2;
    this.skirt.visible = skirt;
    this.skirt.geometry = value.bottomStyle === "longSkirt" ? skirtLong : skirtShort;
    this.skirtMaterial.color.set(value.skirtColor);
    this.collar.visible = value.topStyle === "shirt";
    this.hood.visible = value.topStyle === "hoodie";
    this.hoodMaterial.color.copy(this.top.value).multiplyScalar(.86);
    this.hairMaterial.color.set(value.hairColor);
    this.cap.geometry = hairCap(this.body.geometry, value.hairStyle);
    this.topY = this.cap.geometry.boundingBox!.max.y;
    const [first, second] = this.tails;
    first.visible = value.hairStyle === "ponytail" || value.hairStyle === "bun" || value.hairStyle === "twintails";
    second.visible = value.hairStyle === "twintails";
    if (value.hairStyle === "bun") {
      first.position.set(0, 46.5, -6);
      first.scale.set(5, 5, 5);
      first.rotation.set(0, 0, 0);
      this.topY = Math.max(this.topY, 51.5);
    } else if (value.hairStyle === "ponytail") {
      first.position.set(0, 32.4, -14.3);
      first.scale.set(4.2, 9.5, 4.1);
      first.rotation.set(.45, 0, 0);
    } else {
      first.position.set(-12.5, 30, -5);
      second.position.set(12.5, 30, -5);
      first.scale.set(4, 8, 4.6);
      second.scale.copy(first.scale);
      first.rotation.set(.15, 0, -.27);
      second.rotation.set(.15, 0, .27);
    }
  }

  dispose() {
    for (const material of [this.bodyMaterial, this.hairMaterial, this.skirtMaterial, this.trim, this.hoodMaterial]) material.dispose();
  }

  expression(open: boolean, tongue: boolean, finger: boolean) {
    this.face[0].visible = !open;
    this.face[1].visible = open;
    this.face[2].visible = tongue;
    this.finger.visible = finger;
    this.gesture.value = Number(finger);
  }
}
