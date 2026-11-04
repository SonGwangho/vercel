import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { LoungeInsectKind, LoungeInsectVertex } from "$lib/types/LoungeInsect";

export class LoungeInsectModels {
  private templates = new Map<LoungeInsectKind, THREE.Group>();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72 });
  private sphere = new THREE.SphereGeometry(1, 10, 7);

  create(kind: LoungeInsectKind) {
    let template = this.templates.get(kind);
    if (!template) {
      template = new THREE.Group();
      const body = new THREE.Group(); body.name = "body"; template.add(body);
      if (kind === "caterpillar") this.caterpillar(body);
      else if (kind === "mantis") this.mantis(body);
      else if (kind === "grasshopper") this.grasshopper(body);
      else if (kind === "rhinoBeetle") this.beetle(body);
      else this.flier(body, template, kind);
      this.merge(body);
      this.templates.set(kind, template);
    }
    return template.clone(true);
  }

  private material(color: string) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .75 }));
    return this.materials.get(color)!;
  }
  private oval(parent: THREE.Group, color: string, at: LoungeInsectVertex, size: LoungeInsectVertex) {
    const mesh = new THREE.Mesh(this.sphere, this.material(color)); mesh.position.set(...at); mesh.scale.set(...size); parent.add(mesh); return mesh;
  }
  private line(parent: THREE.Group, color: string, points: LoungeInsectVertex[], width = .018) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), Math.max(6, points.length * 3), width, 4, false);
    this.geometries.add(geometry); parent.add(new THREE.Mesh(geometry, this.material(color)));
  }
  private merge(group: THREE.Group) {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const parts: THREE.BufferGeometry[] = [];
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      source.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld)); source.deleteAttribute("uv");
      const shade = (object.material as THREE.MeshStandardMaterial).color;
      const colors = new Float32Array(source.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = shade.r; colors[i + 1] = shade.g; colors[i + 2] = shade.b; }
      source.setAttribute("color", new THREE.BufferAttribute(colors, 3)); parts.push(source);
    });
    const geometry = mergeGeometries(parts, false)!;
    for (const part of parts) part.dispose();
    this.geometries.add(geometry); group.clear(); group.add(new THREE.Mesh(geometry, this.surface));
  }
  private eyes(body: THREE.Group, x: number, y: number, z: number, size = .035) {
    for (const side of [-1, 1]) {
      this.oval(body, "#233324", [side * x, y, z], [size, size * 1.1, size * .8]);
      this.oval(body, "#f1eacb", [side * x, y + size * .3, z + size * .65], [size * .25, size * .25, size * .2]);
    }
  }
  private antennae(body: THREE.Group, color: string, y: number, z: number, length = .22) {
    for (const side of [-1, 1]) this.line(body, color, [[side * .06, y, z], [side * .12, y + length * .6, z + .09], [side * .16, y + length, z + .17]], .008);
  }
  private caterpillar(body: THREE.Group) {
    for (let i = 0; i < 7; i += 1) {
      const z = -.38 + i * .12, radius = .115 + Math.sin(i / 6 * Math.PI) * .024;
      this.oval(body, i % 2 ? "#abc56b" : "#8da94f", [0, .13, z], [radius, .12, .105]);
      for (const side of [-1, 1]) this.oval(body, "#647a40", [side * .074, .032, z], [.034, .033, .035]);
    }
    this.oval(body, "#d0ca77", [0, .15, .46], [.115, .12, .1]);
    this.eyes(body, .055, .18, .54, .022); this.antennae(body, "#667b3f", .23, .48, .09);
  }
  private mantis(body: THREE.Group) {
    this.oval(body, "#809c4f", [0, .2, -.21], [.11, .09, .29]);
    this.oval(body, "#a2b861", [0, .25, .12], [.047, .06, .23]);
    const head = new THREE.ConeGeometry(.17, .12, 3); head.rotateX(Math.PI / 2); head.rotateZ(Math.PI); head.translate(0, .32, .37);
    this.geometries.add(head); body.add(new THREE.Mesh(head, this.material("#a1bd68")));
    this.eyes(body, .13, .34, .4, .044); this.antennae(body, "#6e8443", .37, .39, .27);
    for (const side of [-1, 1]) {
      this.line(body, "#8fa953", [[side * .055, .27, .22], [side * .19, .12, .41], [side * .13, .33, .48], [side * .1, .2, .4]], .022);
      for (const z of [-.25, -.07]) this.line(body, "#647e3e", [[side * .06, .2, z], [side * .32, .2, z - .15], [side * .46, .025, z + .02]], .017);
    }
  }
  private grasshopper(body: THREE.Group) {
    this.oval(body, "#9daa50", [0, .19, -.17], [.12, .12, .32]);
    this.oval(body, "#bec870", [0, .23, .23], [.12, .14, .12]); this.eyes(body, .096, .28, .31, .039);
    this.antennae(body, "#6e753a", .33, .29, .28);
    for (const side of [-1, 1]) {
      this.line(body, "#7d923f", [[side * .09, .19, -.1], [side * .32, .4, -.4], [side * .42, .045, -.06], [side * .54, .02, -.31]], .035);
      for (const z of [.04, .19]) this.line(body, "#727e35", [[side * .07, .18, z], [side * .23, .13, z + .06], [side * .3, .02, z + .17]], .016);
      this.line(body, "#c6cc80", [[side * .07, .26, .06], [side * .065, .21, -.35]], .009);
    }
  }
  private beetle(body: THREE.Group) {
    this.oval(body, "#634432", [0, .2, -.16], [.22, .19, .29]);
    this.oval(body, "#8a6346", [0, .22, .14], [.19, .16, .17]);
    this.oval(body, "#463b2c", [0, .19, .32], [.12, .11, .12]);
    this.line(body, "#342a21", [[0, .37, -.35], [0, .39, -.12], [0, .32, .07]], .008);
    this.line(body, "#70513a", [[0, .23, .36], [0, .38, .48], [0, .56, .5], [0, .59, .63]], .033);
    for (const side of [-1, 1]) {
      this.line(body, "#70513a", [[0, .55, .52], [side * .06, .62, .58]], .018);
      for (let i = 0; i < 3; i += 1) {
        const z = -.25 + i * .2;
        this.line(body, "#40372c", [[side * .15, .15, z], [side * .29, .09, z - .07], [side * .37, .02, z + (i - 1) * .12]], .021);
      }
    }
    this.eyes(body, .095, .21, .4, .025);
  }
  private flier(body: THREE.Group, root: THREE.Group, kind: "bee" | "butterfly") {
    const bee = kind === "bee";
    this.oval(body, bee ? "#d7ac3e" : "#4c3c32", [0, .18, -.12], [bee ? .17 : .045, bee ? .15 : .06, .29]);
    this.oval(body, "#463d2b", [0, .21, .21], [bee ? .125 : .064, bee ? .115 : .065, bee ? .13 : .07]);
    if (bee) for (const [z, width] of [[-.29, .12], [-.12, .173], [.04, .15]]) this.oval(body, "#3a342b", [0, .18, z], [width, width * .86, .035]);
    this.eyes(body, bee ? .093 : .038, .24, bee ? .31 : .27, bee ? .037 : .02);
    this.antennae(body, "#40372c", .29, .23, bee ? .1 : .22);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) this.line(body, "#4b4531", [[side * .05, .14, .04 - i * .1], [side * .15, .03, .12 - i * .13]], .009);
      const wing = new THREE.Group(); wing.name = side < 0 ? "wing-left" : "wing-right"; wing.position.set(side * .04, .24, .03); root.add(wing);
      if (bee) {
        for (const z of [-.1, .12]) this.oval(wing, "#d6e2d6", [side * .2, .015, z], [.23, .013, .12]);
      } else {
        for (const [x, z, sx, sz] of [[.28, .14, .3, .29], [.23, -.21, .25, .24]]) {
          this.oval(wing, "#433e39", [side * x, 0, z], [sx, .018, sz]);
          this.oval(wing, "#d99355", [side * x, .017, z], [sx * .87, .009, sz * .87]);
          this.line(wing, "#7d5139", [[side * .06, .027, 0], [side * x, .028, z], [side * (x + sx * .68), .027, z + .03]], .008);
          this.oval(wing, "#f1d896", [side * (x + sx * .48), .03, z + sz * .36], [.037, .006, .037]);
        }
      }
      this.merge(wing);
    }
  }
  animate(group: THREE.Group, kind: LoungeInsectKind, now: number, reduced: boolean, moving: boolean) {
    const body = group.getObjectByName("body");
    if (body) {
      body.scale.set(1, 1, kind === "caterpillar" && !reduced ? 1 + Math.sin(now / 230) * .055 : 1);
      body.rotation.x = reduced ? 0 : kind === "caterpillar" ? Math.sin(now / 310) * .025 : moving && kind === "mantis" ? Math.sin(now / 100) * .025 : 0;
    }
    const flap = reduced ? .2 : Math.sin(now * (kind === "bee" ? .064 : .019)) * .8;
    const left = group.getObjectByName("wing-left"), right = group.getObjectByName("wing-right");
    if (left) left.rotation.z = flap; if (right) right.rotation.z = -flap;
  }
  dispose() { this.sphere.dispose(); this.surface.dispose(); for (const geometry of this.geometries) geometry.dispose(); for (const material of this.materials.values()) material.dispose(); this.templates.clear(); }
}
