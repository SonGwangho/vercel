import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { describeFish } from "./fishing";
import type { LoungeFishKind, LoungeFishSection, LoungeFishVertex } from "$lib/types/Lounge";

export class LoungeFishModels {
  private geometries = new Map<LoungeFishKind, THREE.BufferGeometry>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .025 });
  private parts: THREE.BufferGeometry[] = [];

  create(kind: LoungeFishKind) {
    let geometry = this.geometries.get(kind);
    if (!geometry) {
      this.parts = [];
      if (kind === "carp") this.carp();
      else if (kind === "flounder") this.flounder();
      else if (kind === "snapper") this.snapper();
      else if (kind === "eel") this.eel();
      else if (kind === "whale") this.whale();
      else this.shark();
      geometry = mergeGeometries(this.parts, false)!;
      for (const part of this.parts) part.dispose();
      this.parts = [];
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const length = box.max.x - box.min.x;
      geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, 0);
      geometry.scale(1 / length, 1 / length, 1 / length);
      geometry.computeBoundingSphere();
      this.geometries.set(kind, geometry);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, this.material));
    return group;
  }

  private part(source: THREE.BufferGeometry, color?: string) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute("uv");
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (color) {
      const shade = new THREE.Color(color);
      const colors = new Float32Array(geometry.getAttribute("position").count * 3);
      for (let i = 0; i < colors.length; i += 3) shade.toArray(colors, i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    this.parts.push(geometry);
  }

  private body(sections: readonly LoungeFishSection[], back: string, belly: string) {
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const segments = 18;
    const dark = new THREE.Color(back), pale = new THREE.Color(belly), shade = new THREE.Color();
    for (let row = 0; row < sections.length; row += 1) {
      const [x, y, height, depth, z = 0] = sections[row];
      for (let column = 0; column <= segments; column += 1) {
        const angle = column / segments * Math.PI * 2;
        vertices.push(x, y + height * Math.cos(angle), z + depth * Math.sin(angle));
        shade.copy(pale).lerp(dark, THREE.MathUtils.smoothstep(Math.cos(angle), -.65, .6));
        colors.push(shade.r, shade.g, shade.b);
        if (row && column < segments) {
          const a = (row - 1) * (segments + 1) + column, b = row * (segments + 1) + column;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    for (const row of [0, sections.length - 1]) {
      const [x, y, , , z = 0] = sections[row];
      const center = vertices.length / 3;
      vertices.push(x, y, z); colors.push(pale.r, pale.g, pale.b);
      for (let column = 0; column < segments; column += 1) {
        const a = row * (segments + 1) + column;
        indices.push(...(row === 0 ? [center, a + 1, a] : [center, a, a + 1]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    this.part(geometry);
  }

  private fin(points: readonly LoungeFishVertex[], color: string, thickness = .006) {
    const normal = new THREE.Vector3();
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i], b = points[(i + 1) % points.length];
      normal.x += (a[1] - b[1]) * (a[2] + b[2]);
      normal.y += (a[2] - b[2]) * (a[0] + b[0]);
      normal.z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    normal.normalize();
    const projection = Math.abs(normal.y) > Math.abs(normal.x) && Math.abs(normal.y) > Math.abs(normal.z) ? 1
      : Math.abs(normal.x) > Math.abs(normal.z) ? 0 : 2;
    const outline = points.map(([x, y, z]) => projection === 0 ? new THREE.Vector2(y, z)
      : projection === 1 ? new THREE.Vector2(x, z) : new THREE.Vector2(x, y));
    const faces = THREE.ShapeUtils.triangulateShape(outline, []);
    const vertices: number[] = [], indices: number[] = [];
    for (const side of [-1, 1]) for (const point of points) {
      vertices.push(point[0] + normal.x * thickness * side, point[1] + normal.y * thickness * side, point[2] + normal.z * thickness * side);
    }
    const count = points.length;
    for (const [a, b, c] of faces) {
      const ab = new THREE.Vector3(...points[b]).sub(new THREE.Vector3(...points[a]));
      const ac = new THREE.Vector3(...points[c]).sub(new THREE.Vector3(...points[a]));
      if (ab.cross(ac).dot(normal) > 0) indices.push(a, c, b, a + count, b + count, c + count);
      else indices.push(a, b, c, a + count, c + count, b + count);
    }
    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count;
      indices.push(i, next, next + count, i, next + count, i + count);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    this.part(geometry, color);
  }

  private oval(color: string, at: LoungeFishVertex, size: LoungeFishVertex) {
    const geometry = new THREE.SphereGeometry(1, 10, 7);
    geometry.scale(...size).translate(...at);
    this.part(geometry, color);
  }

  private curve(points: readonly LoungeFishVertex[], color: string, radius = .004) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    this.part(new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 4, false), color);
  }

  private eyes(x: number, y: number, depth: number, radius = .016, rim = "#d3c78e", centerZ = 0) {
    for (const side of [-1, 1]) {
      this.oval(rim, [x, y, centerZ + side * depth], [radius * 1.3, radius * 1.3, radius * .48]);
      this.oval("#18252b", [x + radius * .16, y, centerZ + side * (depth + radius * .35)], [radius * .8, radius * .9, radius * .25]);
      this.oval("#f5efe0", [x + radius * .3, y + radius * .35, centerZ + side * (depth + radius * .55)], [radius * .22, radius * .22, radius * .12]);
    }
  }

  private carp() {
    const color = describeFish("carp").color;
    const sections: LoungeFishSection[] = [
      [-.34, -.005, .025, .026], [-.24, .005, .076, .05], [-.12, .018, .133, .087],
      [.04, .02, .15, .105], [.19, .005, .126, .094], [.31, -.01, .082, .07],
      [.42, -.033, .04, .034], [.46, -.039, .02, .02]
    ];
    this.body(sections, color, "#e3d3a7");
    this.fin([[-.33, .02, 0], [-.51, .17, 0], [-.45, 0, 0], [-.51, -.14, 0], [-.33, -.026, 0]], "#a47540");
    this.fin([[-.23, .083, 0], [-.19, .18, 0], [.13, .244, 0], [.19, .145, 0], [.01, .15, 0]], "#9c783f");
    for (const side of [-1, 1]) {
      this.fin([[.18, -.025, side * .083], [.02, -.14, side * .19], [-.04, -.1, side * .115], [.08, -.04, side * .07]], "#ba8950");
      this.fin([[-.08, -.09, side * .04], [-.21, -.169, side * .065], [-.22, -.065, side * .035]], "#ad7a41");
      this.curve([[.445, -.05, side * .022], [.396, -.103, side * .05], [.34, -.12, side * .058]], "#d5b373", .005);
      this.curve([[.45, -.045, side * .013], [.422, -.089, side * .025], [.398, -.106, side * .018]], "#d5b373", .004);
      this.curve([[.28, .052, side * .064], [.249, -.014, side * .085], [.281, -.076, side * .057]], "#8b683f", .003);
      for (let row = 0; row < 2; row += 1) for (let column = 0; column < 5; column += 1) {
        const x = -.12 + column * .064 + row * .026;
        const y = .058 - row * .064;
        const z = side * (.097 - Math.abs(x - .035) * .105);
        this.curve([[x + .016, y + .023, z * .94], [x - .008, y, z + side * .004], [x + .016, y - .021, z * .97]], "#a57b46", .0024);
      }
    }
    const lips = new THREE.TorusGeometry(.023, .006, 5, 12);
    lips.rotateY(Math.PI / 2).translate(.463, -.039, 0); this.part(lips, "#d5ae75");
    this.eyes(.333, .025, .062, .016, "#d6b65e");
  }

  private flounder() {
    const color = describeFish("flounder").color;
    this.body([
      [-.33, 0, .012, .05], [-.25, 0, .025, .14], [-.1, 0, .034, .215],
      [.08, 0, .039, .225], [.24, 0, .032, .159], [.36, -.002, .02, .085], [.445, -.004, .008, .022]
    ], color, "#e3ddd0");
    for (const side of [-1, 1]) {
      this.fin([[-.32, 0, side * .045], [-.29, -.004, side * .146], [-.17, -.004, side * .23],
        [.015, -.003, side * .275], [.19, -.002, side * .224], [.34, 0, side * .09],
        [.23, .002, side * .145], [.07, .003, side * .2], [-.11, .003, side * .19]], "#aa9a77", .003);
      for (let i = 0; i < 7; i += 1) {
        const x = -.22 + i * .065, outer = .24 - Math.abs(x - .03) * .38;
        this.curve([[x, .003, side * (outer - .041)], [x - .018, .002, side * outer]], "#8b7f60", .0018);
      }
    }
    this.fin([[-.31, 0, .035], [-.48, 0, .111], [-.51, 0, .065], [-.5, 0, -.066], [-.47, 0, -.112], [-.31, 0, -.035]], "#a18e68", .004);
    const spots: LoungeFishVertex[] = [[-.21, .029, -.055], [-.13, .034, .106], [-.03, .04, -.115],
      [.015, .042, .025], [.12, .035, .13], [.17, .038, -.065], [.25, .032, .021]];
    for (const [i, spot] of spots.entries()) {
      this.oval("#645f4a", spot, [.019 + i % 2 * .006, .002, .017]);
      this.oval("#b8a781", [spot[0] + .002, spot[1] + .002, spot[2]], [.01, .0015, .008]);
    }
    for (const [x, z] of [[.296, -.041], [.237, .021]]) {
      this.oval("#bcae7d", [x, .034, z], [.026, .012, .025]);
      this.oval("#17252a", [x + .004, .046, z], [.012, .006, .012]);
      this.oval("#eee8d1", [x + .008, .051, z - .003], [.0035, .002, .0035]);
    }
    this.curve([[.422, .007, -.026], [.397, .017, .008], [.416, .008, .035]], "#655b45", .0035);
  }

  private snapper() {
    const color = describeFish("snapper").color;
    this.body([
      [-.33, 0, .025, .025], [-.22, 0, .086, .05], [-.08, .006, .154, .082],
      [.08, .012, .178, .091], [.22, -.003, .15, .082], [.32, -.028, .087, .057],
      [.44, -.044, .032, .026], [.47, -.045, .018, .014]
    ], color, "#f2c4ac");
    this.fin([[-.32, .022, 0], [-.5, .169, 0], [-.439, .005, 0], [-.5, -.151, 0], [-.32, -.024, 0]], "#bf534b");
    this.fin([[-.23, .09, 0], [-.21, .17, 0], [-.15, .236, 0], [-.127, .176, 0],
      [-.073, .277, 0], [-.052, .19, 0], [.005, .29, 0], [.026, .2, 0],
      [.083, .3, 0], [.105, .194, 0], [.16, .265, 0], [.183, .165, 0], [.235, .13, 0]], "#d45f56", .004);
    this.fin([[-.2, -.072, 0], [-.242, -.235, 0], [-.047, -.166, 0], [.016, -.15, 0]], "#cc6359");
    for (const side of [-1, 1]) {
      this.fin([[.16, -.035, side * .072], [-.02, -.167, side * .16], [-.01, -.08, side * .074]], "#df8871", .004);
      this.curve([[.273, .062, side * .055], [.238, -.017, side * .081], [.268, -.105, side * .049]], "#ae554c", .003);
      this.curve([[.446, -.044, side * .017], [.384, -.065, side * .034]], "#93483f", .003);
      for (let i = 0; i < 6; i += 1) this.oval("#edb7a0", [-.15 + i * .061, .038 + i % 2 * .02, side * (.076 - Math.abs(i - 3) * .007)], [.009, .009, .003]);
    }
    this.eyes(.332, .015, .054, .018, "#e3ae61");
  }

  private eel() {
    const sections: LoungeFishSection[] = [
      [-.51, -.01, .002, .002, .086], [-.42, -.003, .017, .018, .108],
      [-.3, .01, .029, .026, .064], [-.17, .017, .039, .033, -.015],
      [0, .003, .046, .038, -.064], [.16, .008, .051, .043, -.035],
      [.3, .013, .052, .046, .005], [.42, .008, .034, .034, .022], [.5, -.003, .008, .014, .022]
    ];
    this.body(sections, describeFish("eel").color, "#d0c9a5");
    const top: LoungeFishVertex[] = sections.slice(0, 7).map(([x, y, height, , z = 0]) => [x, y + height, z]);
    const ridge: LoungeFishVertex[] = sections.slice(0, 7).reverse().map(([x, y, height, , z = 0]) => [x, y + height + (x < -.45 ? 0 : .028), z]);
    this.fin([...top, ...ridge], "#84917b", .002);
    const bottom: LoungeFishVertex[] = sections.slice(0, 6).map(([x, y, height, , z = 0]) => [x, y - height, z]);
    const fringe: LoungeFishVertex[] = sections.slice(0, 6).reverse().map(([x, y, height, , z = 0]) => [x, y - height - (x < -.45 ? 0 : .018), z]);
    this.fin([...bottom, ...fringe], "#acb496", .002);
    for (const side of [-1, 1]) {
      this.fin([[.292, -.002, .006 + side * .035], [.19, -.041, side * .094], [.239, .021, side * .049]], "#9aa788", .003);
      this.curve([[.485, -.011, .022 + side * .009], [.411, -.017, .022 + side * .029]], "#3b4448", .0025);
    }
    this.eyes(.407, .027, .029, .011, "#b8b290", .022);
  }

  private whale() {
    this.body([
      [-.38, .006, .018, .023], [-.26, .016, .041, .042], [-.12, .022, .086, .082],
      [.06, .018, .133, .123], [.22, .008, .143, .142], [.355, -.009, .113, .12],
      [.445, -.025, .065, .071], [.487, -.032, .024, .024]
    ], describeFish("whale").color, "#c6d8dc");
    this.fin([[-.35, .007, .023], [-.414, .019, .184], [-.53, .01, .259], [-.48, .006, .075],
      [-.495, .004, 0], [-.48, .006, -.075], [-.53, .01, -.259], [-.414, .019, -.184], [-.35, .007, -.023]], "#4b6e89");
    this.fin([[-.205, .082, 0], [-.18, .192, 0], [-.128, .125, 0], [-.055, .108, 0]], "#426783");
    for (const side of [-1, 1]) {
      this.fin([[.179, -.047, side * .116], [.037, -.139, side * .353], [-.061, -.147, side * .38],
        [-.017, -.102, side * .214], [.075, -.047, side * .105]], "#527d98");
      this.fin([[.015, -.141, side * .334], [-.061, -.148, side * .379], [-.028, -.127, side * .289]], "#c8d9dc", .002);
      this.curve([[.462, -.048, side * .045], [.369, -.079, side * .096], [.227, -.087, side * .12]], "#375769", .004);
    }
    for (const z of [-.065, -.033, 0, .033, .065]) this.curve([[.379, -.09, z * .7], [.23, -.135, z], [.055, -.107, z * .76]], "#9bb8c4", .0025);
    this.oval("#2e4d62", [.282, .14, 0], [.025, .002, .012]);
    this.eyes(.355, -.013, .122, .012, "#7195aa");
  }

  private shark() {
    this.body([
      [-.36, -.002, .019, .021], [-.265, .002, .041, .041], [-.14, .005, .079, .072],
      [.01, .009, .105, .098], [.17, .002, .104, .104], [.29, -.005, .077, .087],
      [.391, -.019, .045, .054], [.5, -.028, .002, .002]
    ], describeFish("shark").color, "#e3e4d9");
    this.fin([[-.345, .016, 0], [-.485, .259, 0], [-.461, .102, 0], [-.412, .014, 0],
      [-.48, -.187, 0], [-.407, -.137, 0], [-.34, -.019, 0]], "#677e8a");
    this.fin([[-.205, .073, 0], [-.082, .337, 0], [-.064, .163, 0], [.079, .105, 0]], "#6c8492");
    this.fin([[-.293, .034, 0], [-.252, .109, 0], [-.207, .063, 0]], "#728995");
    for (const side of [-1, 1]) {
      this.fin([[.172, -.029, side * .083], [-.127, -.095, side * .329], [-.028, -.048, side * .142], [.043, -.04, side * .075]], "#6d8591");
      this.fin([[-.173, -.044, side * .046], [-.286, -.07, side * .128], [-.236, -.038, side * .04]], "#82939b", .004);
      for (let i = 0; i < 5; i += 1) {
        const x = .202 - i * .023;
        this.curve([[x, .044, side * .089], [x - .008, .002, side * .104], [x + .002, -.057, side * .08]], "#4c626b", .003);
      }
      this.curve([[.434, -.044, side * .023], [.369, -.063, side * .043], [.319, -.049, side * .06]], "#4e5e64", .0035);
    }
    this.eyes(.349, .006, .068, .012, "#9aabb0");
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.material.dispose();
  }
}
