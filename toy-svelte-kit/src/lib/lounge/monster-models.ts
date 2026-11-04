import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { describeMonster } from "./monsters";
import type { LoungeMonsterKind } from "../types/LoungeMonster";

export class LoungeMonsterModels {
  private templates = new Map<LoungeMonsterKind, THREE.Group>();
  private geometries = new Set<THREE.BufferGeometry>();
  private colors = new Map<string, THREE.MeshStandardMaterial>();
  private sphere = new THREE.SphereGeometry(1, 12, 9);
  private cone = new THREE.ConeGeometry(1, 1, 9);
  private surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86 });

  constructor(private characterHeight = 1.5) {}

  create(kind: LoungeMonsterKind) {
    let template = this.templates.get(kind);
    if (!template) {
      template = new THREE.Group();
      const body = new THREE.Group(); body.name = "body"; template.add(body);
      if (kind === "hornRabbit") this.rabbit(body);
      else if (kind === "easternDragon") this.dragon(body);
      else this.beast(body, template, kind);
      for (const part of [...template.children]) this.merge(part as THREE.Group);
      const bounds = new THREE.Box3().setFromObject(template);
      const height = bounds.max.y - bounds.min.y;
      const ratio = this.characterHeight * describeMonster(kind).scale / height;
      for (const part of template.children) {
        part.position.y -= bounds.min.y;
        part.position.multiplyScalar(ratio); part.scale.setScalar(ratio);
      }
      template.userData.height = height * ratio;
      this.templates.set(kind, template);
    }
    const result = template.clone(true);
    const material = this.surface.clone();
    result.traverse((object) => { if (object instanceof THREE.Mesh) object.material = material; });
    return result;
  }

  private color(value: string) {
    if (!this.colors.has(value)) this.colors.set(value, new THREE.MeshStandardMaterial({ color: value }));
    return this.colors.get(value)!;
  }
  private oval(parent: THREE.Group, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = new THREE.Mesh(this.sphere, this.color(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }
  private spike(parent: THREE.Group, color: string, x: number, y: number, z: number, radius: number, height: number, tilt = 0) {
    const mesh = new THREE.Mesh(this.cone, this.color(color));
    mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); mesh.rotation.x = tilt; parent.add(mesh); return mesh;
  }
  private tube(parent: THREE.Group, color: string, points: THREE.Vector3[], radius: number) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(8, points.length * 4), radius, 6, false);
    this.geometries.add(geometry); parent.add(new THREE.Mesh(geometry, this.color(color)));
  }
  private eyes(parent: THREE.Group, x: number, y: number, z: number, size = .045) {
    for (const side of [-1, 1]) {
      this.oval(parent, "#f5edd8", side * x, y, z, size * 1.25, size * 1.4, size * .75);
      this.oval(parent, "#253335", side * x, y - size * .05, z + size * .6, size * .68, size * .95, size * .5);
      this.oval(parent, "#ffffff", side * x - size * .15, y + size * .35, z + size * .95, size * .22, size * .25, size * .15);
    }
  }
  private merge(group: THREE.Group) {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(), parts: THREE.BufferGeometry[] = [];
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld)); geometry.deleteAttribute("uv");
      const color = (object.material as THREE.MeshStandardMaterial).color;
      const colors = new Float32Array(geometry.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
    });
    if (!parts.length) return;
    const geometry = mergeGeometries(parts, false)!;
    for (const part of parts) part.dispose();
    this.geometries.add(geometry); group.clear(); group.add(new THREE.Mesh(geometry, this.surface));
  }
  private rabbit(body: THREE.Group) {
    const fur = "#e2d4b7";
    this.oval(body, fur, 0, .3, -.08, .22, .27, .34);
    this.oval(body, "#fff0d6", 0, .43, .21, .21, .21, .2);
    this.oval(body, "#f5e7d0", 0, .31, -.39, .12, .12, .11);
    for (const side of [-1, 1]) {
      const ear = this.oval(body, fur, side * .12, .78, .14, .065, .24, .065); ear.rotation.z = side * -.16;
      const inside = this.oval(body, "#d9a7a0", side * .12, .79, .193, .034, .175, .02); inside.rotation.z = side * -.16;
      this.oval(body, fur, side * .18, .09, -.16, .1, .09, .19);
      this.oval(body, "#f5e7d0", side * .115, .07, .24, .065, .06, .13);
    }
    this.spike(body, "#d6b86b", 0, .65, .3, .05, .25, .3);
    this.eyes(body, .095, .47, .38, .035);
    this.oval(body, "#ae7b77", 0, .39, .415, .033, .024, .02);
  }
  private beast(body: THREE.Group, root: THREE.Group, kind: "wolf" | "bear" | "tiger" | "griffin") {
    const bear = kind === "bear", griffin = kind === "griffin", tiger = kind === "tiger";
    const fur = describeMonster(kind).color, cream = bear ? "#c09a6b" : griffin ? "#e9dfc7" : "#e8dec9";
    this.oval(body, fur, 0, bear ? .54 : .49, -.06, bear ? .36 : .25, bear ? .39 : .28, bear ? .48 : .52);
    this.oval(body, cream, 0, .45, .25, bear ? .22 : .18, .24, .2);
    this.oval(body, griffin ? cream : fur, 0, bear ? .8 : .73, .39, bear ? .29 : .22, .25, .26);
    this.oval(body, cream, 0, bear ? .74 : .66, .61, bear ? .18 : .135, .12, kind === "wolf" ? .24 : .14);
    this.oval(body, "#303735", 0, bear ? .77 : .69, kind === "wolf" ? .83 : .735, .07, .045, .035);
    this.eyes(body, bear ? .14 : .11, bear ? .85 : .78, .59, .04);
    for (const side of [-1, 1]) {
      if (bear) {
        this.oval(body, fur, side * .23, 1.0, .32, .1, .105, .07);
        this.oval(body, cream, side * .23, 1.01, .38, .055, .06, .02);
      } else if (!griffin) {
        this.spike(body, fur, side * .16, .98, .3, .095, .25, -.15);
        this.spike(body, "#bdaba0", side * .16, .985, .34, .05, .15, -.15);
      }
      for (const z of [-.36, .28]) {
        const front = z > 0;
        const leg = new THREE.Group(); leg.name = `leg-${side}-${front ? "front" : "back"}`;
        leg.position.set(side * .19, .42, z); root.add(leg);
        this.oval(leg, griffin && front ? "#d2ad62" : fur, 0, -.17, 0, bear ? .13 : .08, .25, .095);
        this.oval(leg, griffin && front ? "#d2ad62" : cream, 0, -.355, .04, bear ? .14 : .09, .07, .14);
        if (bear || griffin) for (let claw = -1; claw <= 1; claw += 1) this.spike(leg, "#f4e4c4", claw * .035, -.36, .19, .018, .09, Math.PI / 2);
      }
    }
    const tail = [new THREE.Vector3(0, .55, -.5), new THREE.Vector3(.1, .48, -.76), new THREE.Vector3(.23, .62, -.99), new THREE.Vector3(.29, .76, -1.04)];
    if (!bear) this.tube(body, fur, tail, kind === "wolf" ? .11 : .045);
    if (kind === "wolf") {
      for (const side of [-1, 1]) for (let i = 0; i < 3; i += 1) this.spike(body, "#677981", side * (.19 + i * .02), .6 - i * .07, .17, .06, .18, .9);
    }
    if (tiger) {
      for (let i = 0; i < 6; i += 1) {
        const z = -.4 + i * .135;
        for (const side of [-1, 1]) this.tube(body, "#40392e", [new THREE.Vector3(0, .77, z), new THREE.Vector3(side * .18, .69, z + .035), new THREE.Vector3(side * .245, .5, z + .07)], .022);
      }
      for (const side of [-1, 1]) for (let i = 0; i < 3; i += 1) this.tube(body, "#40392e", [new THREE.Vector3(side * .1, .9 - i * .07, .51), new THREE.Vector3(side * .2, .86 - i * .07, .49)], .015);
    }
    if (griffin) {
      this.spike(body, "#d5ad52", 0, .68, .78, .11, .3, Math.PI / 2);
      for (let i = 0; i < 4; i += 1) this.spike(body, cream, 0, 1.01 + i * .01, .31 - i * .06, .07, .18, -.55);
      for (const side of [-1, 1]) {
        const wing = new THREE.Group(); wing.name = side < 0 ? "wing-left" : "wing-right"; wing.position.set(side * .2, .7, -.06); root.add(wing);
        const plume = this.oval(wing, "#ba9565", side * .28, .15, -.08, .38, .1, .24); plume.rotation.z = side * .3;
        for (let i = 0; i < 6; i += 1) {
          const feather = this.oval(wing, i % 2 ? "#e6d2a6" : "#f3e6c9", side * (.47 + i * .075), .2 + i * .035, -.18 - i * .07, .3, .045, .075);
          feather.rotation.y = side * (.25 + i * .1); feather.rotation.z = side * .18;
        }
      }
    }
  }
  private dragon(body: THREE.Group) {
    const skin = "#548f85", gold = "#d4b576";
    const spine: THREE.Vector3[] = [];
    for (let i = 0; i < 23; i += 1) {
      const t = i / 22;
      const point = new THREE.Vector3(Math.sin(t * Math.PI * 2.2) * .38 * (1 - t * .25), .18 + t * 1.23, -.6 + t * .9);
      spine.push(point);
      if (i % 2 === 0) {
        this.oval(body, gold, point.x, point.y - .055, point.z + .095, .11, .1, .08);
        this.spike(body, gold, point.x, point.y + .13, point.z - .065, .045, .19, -.5);
      }
    }
    this.tube(body, skin, spine, .145);
    const head = spine[spine.length - 1];
    this.oval(body, skin, head.x, head.y + .05, head.z + .07, .23, .2, .25);
    this.oval(body, "#c9be83", head.x, head.y - .025, head.z + .31, .18, .085, .2);
    this.oval(body, "#436b64", head.x, head.y + .015, head.z + .46, .13, .06, .055);
    const face = new THREE.Group(); face.position.copy(head); body.add(face);
    this.eyes(face, .125, .11, .24, .042);
    for (const side of [-1, 1]) {
      const antler = [new THREE.Vector3(head.x + side * .15, head.y + .18, head.z), new THREE.Vector3(head.x + side * .23, head.y + .37, head.z - .12), new THREE.Vector3(head.x + side * .28, head.y + .52, head.z - .06)];
      this.tube(body, gold, antler, .032);
      this.tube(body, gold, [antler[1], new THREE.Vector3(head.x + side * .4, head.y + .43, head.z - .15)], .025);
      this.tube(body, "#e8d6a7", [new THREE.Vector3(head.x + side * .1, head.y - .02, head.z + .4), new THREE.Vector3(head.x + side * .34, head.y, head.z + .56), new THREE.Vector3(head.x + side * .51, head.y + .14, head.z + .5)], .013);
      for (const t of [.29, .7]) {
        const point = spine[Math.round(t * 22)];
        const paw = new THREE.Vector3(point.x + side * .34, point.y - .14, point.z + .1);
        this.tube(body, skin, [point, new THREE.Vector3(point.x + side * .28, point.y + .04, point.z), paw], .055);
        for (let claw = 0; claw < 3; claw += 1) this.spike(body, gold, paw.x + (claw - 1) * .04, paw.y, paw.z + .07, .018, .12, Math.PI / 2);
      }
      for (let i = 0; i < 6; i += 1) this.spike(body, "#6c9e8b", head.x + side * .19, head.y + .12 - i * .06, head.z - .07 - i * .045, .06, .2, -.85);
    }
    this.spike(body, gold, spine[0].x, .22, -.77, .1, .35, -Math.PI / 2);
  }

  animate(group: THREE.Group, kind: LoungeMonsterKind, now: number, moving: boolean, winding: number, reduced: boolean) {
    const body = group.getObjectByName("body");
    if (body) {
      body.rotation.x = reduced ? 0 : -winding * .12;
      body.rotation.z = reduced || !moving ? 0 : Math.sin(now / 95) * .035;
    }
    for (const part of group.children) if (part.name.startsWith("leg-")) {
      const phase = Number(part.name.startsWith("leg--1-")) + Number(part.name.endsWith("front"));
      part.rotation.x = !reduced && moving ? Math.sin(now / 110 + phase * Math.PI) * .35 : 0;
    }
    if (kind === "griffin") for (const side of [-1, 1]) {
      const wing = group.getObjectByName(side < 0 ? "wing-left" : "wing-right");
      if (wing) wing.rotation.z = reduced ? side * .08 : side * (.12 + Math.sin(now / 380) * .12);
    }
  }
  release(group: THREE.Group) {
    const materials = new Set<THREE.Material>();
    group.traverse((object) => { if (object instanceof THREE.Mesh && !Array.isArray(object.material)) materials.add(object.material); });
    for (const material of materials) material.dispose();
    group.removeFromParent();
  }
  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.colors.values()) material.dispose();
    this.sphere.dispose(); this.cone.dispose(); this.surface.dispose(); this.templates.clear();
  }
}
