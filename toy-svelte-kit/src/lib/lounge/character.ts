import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import model from "../assets/data/lounge/character.json";
import type { LoungeCharacterGeometries, LoungeHairParts, LoungeModelPoint, LoungeModelProfile } from "../types/LoungeCharacter";

export const characterDimensions = model;
export const hairParts = model.hairParts as LoungeHairParts;
const colors = model.palette;
const white = "#ffffff";
const section = [[-0.65,1],[0.65,1],[1,0.5],[1,-0.5],[0.65,-1],[-0.65,-1],[-1,-0.5],[-1,0.5]];

function paint(source: THREE.BufferGeometry, tint: string) {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  geometry.deleteAttribute("uv");
  const color = new THREE.Color(tint); const count = geometry.getAttribute("position").count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) color.toArray(data, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(data, 3));
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  return geometry;
}
function combine(parts: THREE.BufferGeometry[]) {
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!result) throw new Error("Character mesh attributes do not match");
  result.computeBoundingSphere(); return result;
}
function profile(rings: LoungeModelProfile, tint = white, smooth = true) {
  const vertices: number[] = []; const indices: number[] = [];
  for (const [y, width, depth, shift = 0] of rings) for (const [x, z] of section) vertices.push(x * width, y, z * depth + shift);
  for (let row = 0; row < rings.length - 1; row += 1) for (let n = 0; n < 8; n += 1) {
    const a = row * 8 + n; const b = row * 8 + (n + 1) % 8; const c = b + 8; const d = a + 8;
    indices.push(a, b, c, a, c, d);
  }
  const bottom = vertices.length / 3; vertices.push(0, rings[0][0], rings[0][3] ?? 0);
  const top = vertices.length / 3; vertices.push(0, rings.at(-1)![0], rings.at(-1)![3] ?? 0);
  for (let n = 0; n < 8; n += 1) { indices.push(bottom, (n + 1) % 8, n); indices.push(top, (rings.length - 1) * 8 + n, (rings.length - 1) * 8 + (n + 1) % 8); }
  let geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
  if (!smooth) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
  geometry.computeVertexNormals(); return paint(geometry, tint);
}
function block(width: number, height: number, depth: number, tint = white, bevel = 0.12) {
  return profile([[-height / 2, width * (0.5 - bevel), depth * (0.5 - bevel)],[-height * (0.5 - bevel), width / 2, depth / 2],[height * (0.5 - bevel), width / 2, depth / 2],[height / 2, width * (0.5 - bevel), depth * (0.5 - bevel)]], tint, false);
}
function oval(rx: number, ry: number, tint: string, x = 0, y = 0, z = 0) { return paint(new THREE.CircleGeometry(1, 16).scale(rx, ry, 1).translate(x, y, z), tint); }
function patch(points: LoungeModelPoint[], tint = white, thickness = 0.008) {
  const vertices: number[] = [];
  const faces = THREE.ShapeUtils.triangulateShape(points.map(([x,y]) => new THREE.Vector2(x,y)), []);
  for (const [a,b,c] of faces) {
    for (const index of [a,b,c]) { const [x,y,z] = points[index]; vertices.push(x,y,z + thickness); }
    for (const index of [c,b,a]) vertices.push(...points[index]);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals(); return paint(geometry,tint);
}
function strand(start: LoungeModelPoint, end: LoungeModelPoint, width: number, depth: number, tint = white, bend = 0) {
  const a = new THREE.Vector3(...start); const b = new THREE.Vector3(...end); const direction = b.clone().sub(a); const length = direction.length();
  const geometry = profile([[0,width * 0.14,depth * 0.2],[length * 0.14,width * 0.8,depth * 0.8],[length * 0.64,width,depth,bend],[length,width * 0.56,depth * 0.6]], tint, false);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), direction.normalize()));
  return geometry.translate(...end).translate(-direction.x * length, -direction.y * length, -direction.z * length);
}

function head() {
  const parts = [profile(model.head, colors.skin)];
  for (const side of [-1, 1]) {
    parts.push(block(0.09, 0.15, 0.105, colors.skin, 0.2).translate(side * 0.303, -0.04, 0.008));
    parts.push(oval(0.028, 0.046, colors.ear, side * 0.32, -0.045, 0.065));
    parts.push(oval(0.048, 0.019, colors.cheek, side * 0.177, -0.095, 0.253));
    parts.push(patch([[side * 0.065,0.105,0.258],[side * 0.15,0.12,0.258],[side * 0.15,0.106,0.258],[side * 0.065,0.092,0.258]], colors.ink, 0.004));
  }
  parts.push(profile([[-0.09,0.023,0.012,0.252],[-0.055,0.026,0.024,0.266],[-0.025,0.012,0.012,0.251]], colors.skin, false));
  return combine(parts);
}
function eye() {
  return combine([
    oval(0.039, 0.049, colors.ivory), oval(0.025, 0.038, colors.eye, 0, -0.002, 0.002),
    oval(0.016, 0.028, colors.ink, 0, -0.001, 0.003), oval(0.009, 0.012, white, -0.008, 0.018, 0.004),
    oval(0.004, 0.005, colors.ivory, 0.011, -0.018, 0.004)
  ]);
}
function hairCap(style: string) {
  const vertices: number[] = []; const indices: number[] = []; const steps = 24; const rows = 7;
  const buzz = style === "buzz";
  for (let row = 0; row <= rows; row += 1) for (let n = 0; n <= steps; n += 1) {
    const angle = n / steps * Math.PI * 2; const front = Math.max(0, Math.cos(angle));
    const length = 1.92 - front * (buzz ? 0.73 : 0.61);
    const theta = 0.025 + row / rows * (length - 0.025);
    const wave = buzz ? 0 : Math.sin(angle * 5 + 0.7) * 0.011 * Math.sin(theta);
    const y = 0.035 + Math.cos(theta) * (buzz ? 0.304 : 0.34) + wave;
    let width = Math.sin(theta) * (buzz ? 0.311 : 0.332);
    let depth = Math.sin(theta) * (buzz ? 0.264 : 0.28); let shift = -0.015;
    const ring = model.head.findIndex(([height]) => height >= y);
    if (ring >= 0) {
      const lower = model.head[Math.max(0, ring - 1)]; const upper = model.head[ring];
      const mix = (y - lower[0]) / Math.max(0.001, upper[0] - lower[0]);
      width = Math.max(width, lower[1] + (upper[1] - lower[1]) * mix + (buzz ? 0.008 : 0.018));
      depth = Math.max(depth, lower[2] + (upper[2] - lower[2]) * mix + (buzz ? 0.010 : 0.022));
      shift = lower[3] + (upper[3] - lower[3]) * mix;
    }
    const x = Math.sin(angle); const z = Math.cos(angle);
    const contour = 1 / Math.max(Math.abs(x), Math.abs(z), (Math.abs(x) * 0.5 + Math.abs(z) * 0.35) / 0.675);
    vertices.push(x * contour * width, y, z * contour * depth + shift);
  }
  for (let row = 0; row < rows; row += 1) for (let n = 0; n < steps; n += 1) { const a = row * (steps + 1) + n; const b = a + steps + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
  const crown = vertices.length / 3; vertices.push(0, buzz ? 0.339 : 0.375, -0.015);
  for (let n = 0; n < steps; n += 1) indices.push(crown, n, n + 1);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return paint(geometry, white);
}
function hair(style: string) {
  const parts = [hairCap(style)];
  if (style !== "buzz") {
    const locks = style === "bob" ? 6 : 4;
    for (let n = 0; n < locks; n += 1) {
      const x = -0.23 + n / (locks - 1) * 0.46;
      const tip = style === "bob" ? 0.11 + (n % 2) * 0.008 : 0.075 + (n / locks) * 0.085;
      parts.push(strand([x + (style === "short" ? -0.055 : 0),tip,0.273 - Math.abs(x) * 0.11], [x * 0.72,0.285,0.16], 0.068, 0.035, n % 2 ? "#dddddd" : white));
    }
    for (const side of [-1,1]) parts.push(strand([side * 0.285,-0.12,0.08],[side * 0.28,0.16,0.045],0.044,0.065,"#e2e2e2"));
  }
  if (style === "bob" || style === "long") {
    const bottom = style === "long" ? -0.64 : -0.28;
    for (let n = 0; n < 9; n += 1) {
      const angle = Math.PI * 0.45 + n / 8 * Math.PI * 1.1;
      const x = Math.sin(angle) * 0.285; const z = Math.cos(angle) * 0.245 - 0.035;
      parts.push(strand([x * (style === "long" ? 1.17 : 0.98),bottom + Math.cos(n * 2) * 0.025,z - 0.045],[x,0.16,z],0.083,0.055,n % 2 ? "#dddddd" : white,0.016));
    }
    for (const side of [-1,1]) parts.push(strand([side * 0.27,style === "long" ? -0.4 : -0.23,0.13],[side * 0.26,0.19,0.07],0.055,0.045,white));
  }
  if (style === "ponytail" || style === "twintails") {
    for (const side of style === "twintails" ? [-1,1] : [0]) {
      const x = side * 0.28;
      parts.push(block(0.13,0.08,0.14,"#b3b3b3").translate(x,0.10,-0.25));
      for (let n = 0; n < 3; n += 1) parts.push(strand([x + side * 0.13 + (n - 1) * 0.044,-0.51 + Math.abs(n - 1) * 0.04,-0.36],[x + (n - 1) * 0.04,0.12,-0.27],0.069,0.06,n === 1 ? white : "#d3d3d3",0.025));
    }
  }
  if (style === "bun") {
    parts.push(profile([[-0.08,0.075,0.09],[0,0.145,0.135],[0.11,0.12,0.11],[0.16,0.045,0.045]],white,false).translate(0,0.29,-0.15));
    parts.push(paint(new THREE.TorusGeometry(0.11,0.018,4,12).rotateX(Math.PI / 2).translate(0,0.28,-0.15),"#bcbcbc"));
  }
  if (style === "spiky") {
    for (const [x, y, z] of [[-0.2,0.43,0.02],[-0.08,0.57,0.01],[0.07,0.51,-0.01],[0.21,0.40,-0.04],[0,0.45,-0.19]]) parts.push(strand([x,y,z],[x * 0.7,0.23,z * 0.7],0.095,0.075,x < 0 ? "#e6e6e6" : white));
  }
  return combine(parts);
}
function torso(kind: "body" | "tank" | "hoodie") {
  const bulk = kind === "hoodie" ? 1.1 : kind === "tank" ? 0.88 : 1;
  const parts = [profile(model.torso.map(([y,w,d,z]) => [y,w * bulk,d * (kind === "hoodie" ? 1.1 : 1),z]))];
  parts.push(profile([[0,0.215 * bulk,0.138],[0.034,0.235 * bulk,0.153]],"#d0d0d0"));
  parts.push(paint(new THREE.TorusGeometry(0.097,kind === "hoodie" ? 0.021 : 0.012,4,16).rotateX(Math.PI / 2).scale(1,1,0.86).translate(0,0.51,0),"#cccccc"));
  if (kind === "hoodie") {
    parts.push(profile([[0.36,0.13,0.075,-0.17],[0.48,0.19,0.09,-0.17],[0.59,0.16,0.07,-0.16],[0.64,0.09,0.035,-0.15]],"#dadada"));
    parts.push(patch([[-0.13,0.10,0.169],[0.13,0.10,0.169],[0.12,0.24,0.169],[0.07,0.28,0.169],[-0.07,0.28,0.169],[-0.12,0.24,0.169]],"#dedede"));
  } else if (kind === "body") parts.push(block(0.09,0.075,0.008,"#ededed",0.05).translate(-0.10,0.32,0.15));
  return combine(parts);
}
function shirtDetails() {
  const parts = [patch([[-0.105,0.51,0.10],[-0.015,0.46,0.155],[-0.07,0.365,0.16],[-0.15,0.45,0.13]],colors.ivory),patch([[0.105,0.51,0.10],[0.015,0.46,0.155],[0.07,0.365,0.16],[0.15,0.45,0.13]],colors.ivory)];
  for (let n = 0; n < 4; n += 1) parts.push(oval(0.011,0.011,colors.ivory,0,0.1 + n * 0.09,0.157));
  return combine(parts);
}
function hoodieDetails() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1,1]) { parts.push(block(0.012,0.16,0.012,colors.ivory).rotateZ(side * 0.08).translate(side * 0.055,0.40,0.166)); parts.push(block(0.016,0.025,0.016,colors.ink).translate(side * 0.06,0.31,0.166)); }
  return combine(parts);
}
function limb(tint: string, hem = false) {
  const parts = [profile([[-1,0.42,0.42],[-0.94,0.49,0.49],[-0.12,0.51,0.5],[0,0.42,0.42]],tint)];
  if (hem) parts.push(profile([[-1.02,0.43,0.43],[-0.98,0.51,0.51],[-0.86,0.51,0.51]],"#c7c7c7",false));
  return combine(parts);
}
function hand() {
  const parts = [block(0.095,0.115,0.075,colors.skin,0.2).translate(0,-0.045,0)];
  parts.push(block(0.038,0.068,0.044,colors.skin,0.2).rotateZ(-0.38).translate(-0.048,-0.02,0.021));
  for (const x of [-0.022,0,0.022]) parts.push(block(0.003,0.025,0.003,colors.ear,0).translate(x,-0.073,0.039));
  return combine(parts);
}
function shoe() {
  const parts = [block(0.205,0.045,0.33,colors.sole,0.12).translate(0,-0.075,0.05),block(0.19,0.12,0.295,colors.shoe,0.15).translate(0,-0.005,0.035),block(0.19,0.065,0.12,colors.ivory,0.17).translate(0,-0.035,0.15),block(0.10,0.045,0.13,colors.shoe).translate(0,0.067,0.035)];
  for (let n = 0; n < 3; n += 1) parts.push(block(0.10,0.008,0.014,colors.ivory).translate(0,0.065,0.025 + n * 0.028));
  parts.push(block(0.045,0.06,0.016,"#bf946b").translate(0,0.04,-0.115));
  return combine(parts);
}
function skirt() {
  const vertices: number[] = []; const count = 32;
  for (let n = 0; n < count; n += 1) {
    const a = n * Math.PI * 2 / count; const b = (n + 1) * Math.PI * 2 / count; const ra = n % 2 ? 0.94 : 1; const rb = n % 2 ? 1 : 0.94;
    const a0 = [Math.sin(a) * 0.65,0,Math.cos(a) * 0.65]; const b0 = [Math.sin(b) * 0.65,0,Math.cos(b) * 0.65]; const a1 = [Math.sin(a) * ra,-1,Math.cos(a) * ra]; const b1 = [Math.sin(b) * rb,-1,Math.cos(b) * rb];
    vertices.push(...a0,...a1,...b0,...b0,...a1,...b1);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3)); geometry.computeVertexNormals(); return paint(geometry,white);
}

export function createCharacterGeometries(): LoungeCharacterGeometries {
  return {
    head: head(), eye: eye(), smile: paint(new THREE.TorusGeometry(0.031,0.006,4,12,Math.PI).rotateZ(Math.PI),colors.ink),
    openMouth: combine([oval(0.027,0.034,colors.ink),oval(0.017,0.010,"#dd9b95",0,-0.019,0.002)]),
    neck: profile([[0,0.073,0.063],[0.15,0.078,0.067]],colors.skin),
    body: torso("body"), tank: torso("tank"), hoodie: torso("hoodie"), shirtDetails: shirtDetails(), hoodieDetails: hoodieDetails(),
    skinLimb: limb(colors.skin), sleeve: limb(white,true), trouser: limb(white,true), hand: hand(), shoe: shoe(),
    waist: profile([[-0.04,0.205,0.13],[0.04,0.215,0.14]],"#d3d3d3"), skirt: skirt(),
    hairShort: hair("short"), hairBob: hair("bob"), hairLong: hair("long"), hairPonytail: hair("ponytail"), hairBun: hair("bun"), hairTwintails: hair("twintails"), hairSpiky: hair("spiky"), hairBuzz: hair("buzz")
  };
}
