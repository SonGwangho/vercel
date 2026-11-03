import * as THREE from "three";
import { clampPosition, foodName, loungeRules, loungeWorld, positionAt } from "./shared";
import { nameLabels, speechBubbles } from "./layout";
import { isSkirt, normalizeAppearance } from "./appearance";
import type { LoungeAppearance } from "$lib/types/LoungeAppearance";
import type { LoungeActionKind, LoungeFoodKind, LoungeMessage, LoungePoint, LoungeRenderedPlayer, LoungeSnapshot } from "$lib/types/Lounge";
import type { LoungeRig, LoungeRigPart, LoungeSceneActor, LoungeSceneBubble, LoungeSceneController, LoungeSceneFood, LoungeSceneLocalMove, LoungeSceneOptions, LoungeSceneParticle, LoungeScenePick, LoungeScenePrediction } from "$lib/types/LoungeScene";

const SCALE = 0.01;
const CAPACITY = 16;
const PARTICLES = 120;
const TAU = Math.PI * 2;
const ease = (rate: number, delta: number) => 1 - Math.exp(-rate * delta);
const worldX = (x: number) => (x - loungeWorld.width / 2) * SCALE;
const worldZ = (y: number) => (y - loungeWorld.height / 2) * SCALE;

/** An imperative renderer: animation never writes Svelte component state. */
export class LoungeScene implements LoungeSceneController {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dummy = new THREE.Object3D();
  private root = new THREE.Matrix4();
  private joint = new THREE.Matrix4();
  private matrix = new THREE.Matrix4();
  private project = new THREE.Vector3();
  private target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private color = new THREE.Color();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.Material>();
  private actors = new Map<string, LoungeSceneActor>();
  private actorIds: string[] = [];
  private foods = new Map<string, LoungeSceneFood>();
  private bubbles = new Map<string, LoungeSceneBubble>();
  private pickables: THREE.Object3D[] = [];
  private rig: LoungeRig;
  private particles: LoungeSceneParticle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private stars: THREE.InstancedMesh;
  private floor: THREE.Mesh;
  private marker: THREE.Mesh;
  private markerAt = -1000;
  private overlay: HTMLDivElement;
  private observer: ResizeObserver;
  private themeObserver: MutationObserver;
  private state: LoungeSnapshot | null = null;
  private localMove: LoungeSceneLocalMove | null = null;
  private prediction: LoungeScenePrediction | null = null;
  private localMessages = new Map<string, LoungeMessage>();
  private lastAction = new Map<string, string>();
  private width = 1;
  private height = 1;
  private lastFrame = 0;
  private lastOverlay = 0;
  private elapsed = 0;
  private disposed = false;
  private muted = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private audio: AudioContext | null = null;
  private zoomLevel = 1;
  private previewFacing = 0.58;
  private inViewport = true;
  private hover = "";
  private hoverAt = 0;
  private hold: ReturnType<typeof setTimeout> | null = null;
  private down: { x: number; y: number; at: number } | null = null;
  private suppressClick = false;

  constructor(private host: HTMLDivElement, private options: LoungeSceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = "lounge-webgl";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.host.appendChild(this.renderer.domElement);
    this.overlay = document.createElement("div");
    this.overlay.className = "scene-label-layer";
    this.host.appendChild(this.overlay);

    this.scene.add(new THREE.HemisphereLight(0xf7fbff, 0x8a9c87, 2));
    const light = new THREE.DirectionalLight(0xfff6e7, 2.6);
    light.position.set(4, 9, 7);
    this.scene.add(light);
    this.floor = this.makeRoom();
    this.rig = this.makeRig();
    this.particleMesh = new THREE.InstancedMesh(this.geometry("crumb", () => new THREE.IcosahedronGeometry(1, 0)), this.material("particle", () => new THREE.MeshBasicMaterial({ color: 0xffffff })), PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.particleMesh);
    this.stars = new THREE.InstancedMesh(this.geometry("star", () => new THREE.OctahedronGeometry(0.055, 0)), this.material("gold", () => new THREE.MeshBasicMaterial({ color: 0xf5c456 })), CAPACITY * 3);
    this.stars.count = 0;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    this.marker = new THREE.Mesh(this.geometry("marker", () => new THREE.RingGeometry(0.19, 0.235, 28)), this.material("marker", () => new THREE.MeshBasicMaterial({ color: 0x4778d8, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.setTheme(document.documentElement.dataset.theme === "dark");
    this.camera.position.set(9, 11, 12);
    this.camera.lookAt(0, 0.35, 0);
    this.camera.updateMatrixWorld();

    this.observer = new ResizeObserver(([entry]) => this.resize(entry.contentRect.width, entry.contentRect.height));
    this.observer.observe(host);
    this.themeObserver = new MutationObserver(() => this.setTheme(document.documentElement.dataset.theme === "dark"));
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.host.addEventListener("pointerdown", this.pointerDown);
    this.host.addEventListener("pointerup", this.pointerUp);
    this.host.addEventListener("pointermove", this.pointerMove);
    this.host.addEventListener("pointercancel", this.cancelHold);
    this.host.addEventListener("contextmenu", this.contextMenu);
    this.host.addEventListener("wheel", this.wheel, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    document.addEventListener("visibilitychange", this.visibility);
    this.renderer.setAnimationLoop(this.frame);
  }

  private geometry(key: string, create: () => THREE.BufferGeometry) {
    if (!this.geometries.has(key)) this.geometries.set(key, create());
    return this.geometries.get(key)!;
  }

  private material(key: string, create: () => THREE.Material) {
    if (!this.materials.has(key)) this.materials.set(key, create());
    return this.materials.get(key)!;
  }

  private solid(color: string | number) {
    return this.material(`solid:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
  }

  private box(parent: THREE.Object3D, color: string | number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = new THREE.Mesh(this.geometry("box", () => new THREE.BoxGeometry(1, 1, 1)), this.solid(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh);
    return mesh;
  }

  private ball(parent: THREE.Object3D, color: string | number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const mesh = new THREE.Mesh(this.geometry("sphere", () => new THREE.SphereGeometry(1, 10, 7)), this.solid(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh);
    return mesh;
  }

  private makeRoom() {
    if (this.options.preview) {
      const podium = new THREE.Mesh(this.geometry("podium", () => new THREE.CylinderGeometry(0.62, 0.67, 0.08, 32)), this.solid("#dce8df"));
      podium.position.y = -0.055; this.scene.add(podium); return podium;
    }
    const ground = this.box(this.scene, "#dce8df", 0, -0.12, 0, 10, 0.24, 6.4);
    ground.name = "room-floor";
    this.box(this.scene, "#becfc4", 0, -0.27, 0, 10.12, 0.12, 6.52);
    this.box(this.scene, "#e8eee7", 0, 0.67, -3.15, 10, 1.35, 0.14);
    this.box(this.scene, "#d1ded5", -4.97, 0.38, 0, 0.14, 0.76, 6.4);
    for (const x of [-3, -0.8, 1.4]) {
      this.box(this.scene, "#faf9f2", x, 0.9, -3.04, 1.55, 0.84, 0.12);
      this.box(this.scene, "#a0c7cc", x, 0.9, -2.965, 1.35, 0.65, 0.04);
      this.box(this.scene, "#faf9f2", x, 0.9, -2.93, 0.055, 0.68, 0.04);
    }
    const rug = new THREE.Mesh(this.geometry("rug", () => new THREE.CircleGeometry(1, 48)), this.solid("#bdd2c8"));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.2, 0.008, 0.35); rug.scale.set(3.1, 1.85, 1); this.scene.add(rug);
    for (const side of [-1, 1]) {
      const x = side * 4.63;
      this.box(this.scene, "#c9a47d", x, 0.29, 0.5, 0.38, 0.14, 1.55);
      this.box(this.scene, "#b88e67", x + side * 0.12, 0.56, 0.5, 0.1, 0.4, 1.55);
      for (const z of [-0.04, 1.04]) this.box(this.scene, "#826f5b", x, 0.12, z, 0.12, 0.24, 0.14);
      const potX = side * 4.55;
      this.box(this.scene, "#b5a089", potX, 0.22, 2.65, 0.37, 0.44, 0.37);
      this.ball(this.scene, "#6c9278", potX, 0.62, 2.65, 0.3, 0.45, 0.27);
      this.ball(this.scene, "#85a68b", potX - side * 0.15, 0.72, 2.65, 0.2, 0.3, 0.2);
    }
    this.box(this.scene, "#bfa180", 3.9, 0.52, -2.87, 0.9, 1.04, 0.32);
    for (let i = 0; i < 3; i += 1) this.box(this.scene, ["#7d9f9b", "#d8ae7b", "#b2909d"][i], 3.65 + i * 0.2, 1.12, -2.85, 0.13, 0.2, 0.15);
    return ground;
  }

  private makeRig(): LoungeRig {
    const rig = {} as LoungeRig;
    const sphere = this.geometry("sphere", () => new THREE.SphereGeometry(1, 10, 7));
    const capsule = this.geometry("capsule", () => new THREE.CapsuleGeometry(1, 1, 2, 8));
    const box = this.geometry("box", () => new THREE.BoxGeometry(1, 1, 1));
    const skin = this.solid("#f1c9a4");
    const cloth = this.solid("#ffffff");
    const add = (part: LoungeRigPart, geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.rig = true;
      rig[part] = mesh; this.scene.add(mesh);
      if (part !== "shadow") this.pickables.push(mesh);
    };
    add("head", sphere, skin);
    add("hair", this.geometry("hair", () => new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI * 0.53)), cloth);
    for (const part of ["hairBack", "hairLeft", "hairRight", "hairTail", "hairLeftTail", "hairRightTail"] as const) add(part, sphere, cloth);
    add("hairCrown", this.geometry("hairCrown", () => {
      const positions: number[] = [];
      for (const [x, height] of [[-0.13, 0.13], [0, 0.2], [0.13, 0.12]]) {
        for (let n = 0; n < 5; n += 1) {
          const a = n * TAU / 5; const b = (n + 1) * TAU / 5;
          positions.push(x + Math.cos(b) * 0.085, 0, Math.sin(b) * 0.08, x + Math.cos(a) * 0.085, 0, Math.sin(a) * 0.08, x + 0.025, height, 0);
        }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); return geometry;
    }), cloth);
    add("body", capsule, cloth);
    add("hood", this.geometry("hood", () => new THREE.TorusGeometry(1, 0.25, 5, 12)), cloth);
    add("collar", this.geometry("collar", () => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.11,0.035,0,-0.018,-0.09,0.016,-0.005,0.04,0,0.11,0.035,0,0.005,0.04,0,0.018,-0.09,0.016], 3));
      geometry.computeVertexNormals(); return geometry;
    }), this.solid("#f5f0e3"));
    add("topTrim", box, this.solid("#f5f0e3"));
    add("waist", box, cloth);
    add("skirt", this.geometry("skirt", () => new THREE.CylinderGeometry(0.72, 1, 1, 12)), cloth);
    for (const side of ["left", "right"] as const) {
      add(`${side}Arm`, capsule, cloth); add(`${side}Forearm`, capsule, skin); add(`${side}Hand`, sphere, skin);
      add(`${side}Leg`, capsule, skin); add(`${side}Trouser`, capsule, cloth); add(`${side}Shoe`, box, this.solid("#2f3a4d"));
      add(`${side}Eye`, sphere, this.solid("#343746"));
    }
    add("mouth", box, this.solid("#b07865"));
    add("shadow", this.geometry("shadow", () => new THREE.CircleGeometry(1, 20)), this.material("shadow", () => new THREE.MeshBasicMaterial({ color: 0x334a3a, transparent: true, opacity: 0.16, depthWrite: false })));
    return rig;
  }

  private createFood(kind: LoungeFoodKind) {
    const group = new THREE.Group();
    const triangle = this.geometry("food-triangle", () => {
      const shape = new THREE.Shape(); shape.moveTo(-0.15, 0); shape.lineTo(0.15, 0); shape.lineTo(0, 0.27); shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, steps: 1 });
    });
    if (kind === "rice") {
      group.add(new THREE.Mesh(triangle, this.solid("#f7f5e8")));
      this.box(group, "#35584b", 0, 0.055, 0.045, 0.14, 0.12, 0.1);
    } else if (kind === "chicken") {
      this.ball(group, "#d38b42", 0.03, 0.17, 0.02, 0.13, 0.16, 0.1);
      const bone = this.box(group, "#faf5df", -0.09, 0.045, 0, 0.07, 0.19, 0.07); bone.rotation.z = -0.6;
      this.ball(group, "#faf5df", -0.15, -0.02, 0.01, 0.047);
      this.ball(group, "#faf5df", -0.1, -0.04, 0.01, 0.047);
    } else {
      const slice = new THREE.Mesh(triangle, this.solid("#f0cb76")); slice.rotation.z = Math.PI; slice.position.y = 0.27; group.add(slice);
      this.box(group, "#bc874e", 0, 0.27, 0.035, 0.33, 0.055, 0.1);
      for (const [x, y] of [[-0.065, 0.2], [0.06, 0.19], [0, 0.1]]) this.ball(group, "#bf594c", x, y, 0.088, 0.035, 0.035, 0.012);
    }
    group.rotation.y = 0.58;
    return group;
  }

  update(snapshot: LoungeSnapshot) {
    if (this.disposed) return;
    this.state = snapshot;
    const ids = new Set(snapshot.players.map((player) => player.id));
    for (const [id, actor] of this.actors) if (!ids.has(id)) {
      actor.label.remove(); if (actor.held) this.scene.remove(actor.held); this.actors.delete(id); this.lastAction.delete(id);
    }
    this.actorIds = snapshot.players.slice(0, CAPACITY).map((player) => player.id);
    const now = this.options.getNow();
    for (const player of snapshot.players.slice(0, CAPACITY)) {
      let actor = this.actors.get(player.id);
      if (!actor) {
        const label = document.createElement("button"); label.type = "button"; label.className = "scene-name";
        label.dataset.scenePlayer = player.id; label.textContent = player.nickname + (player.id === this.options.selfId ? " · 나" : "");
        label.title = `${player.nickname} · 우클릭으로 행동`;
        label.addEventListener("keydown", (event) => {
          if (!["Enter", " ", "ContextMenu"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const rect = label.getBoundingClientRect();
          this.options.onContext({ kind: "player", id: player.id, x: rect.right, y: rect.bottom });
        });
        this.overlay.appendChild(label);
        actor = { player, appearance: normalizeAppearance(player.appearance, player.color), point: positionAt(player, now), correction: { x: 0, y: 0 }, facing: 0.58, head: new THREE.Vector3(), label, nameOffset: { x: -45, y: -25 }, nameWidth: 90, actionId: null, held: null, heldKind: null };
        this.actors.set(player.id, actor);
      }
      if (player.id !== this.options.selfId && player.move.startedAt !== actor.player.move.startedAt) {
        const point = positionAt(player, now);
        actor.correction.x = actor.point.x - point.x; actor.correction.y = actor.point.y - point.y;
      }
      actor.player = player;
      actor.appearance = normalizeAppearance(player.appearance, player.color);
      const index = this.actorIds.indexOf(player.id);
      const appearance = actor.appearance;
      for (const part of ["body", "leftArm", "rightArm", "hood"] as const) this.rig[part].setColorAt(index, this.color.set(appearance.topColor));
      for (const part of ["hair", "hairBack", "hairLeft", "hairRight", "hairTail", "hairLeftTail", "hairRightTail", "hairCrown"] as const) this.rig[part].setColorAt(index, this.color.set(appearance.hairColor));
      for (const part of ["leftTrouser", "rightTrouser"] as const) this.rig[part].setColorAt(index, this.color.set(appearance.pantsColor));
      this.rig.skirt.setColorAt(index, this.color.set(appearance.skirtColor));
      this.rig.waist.setColorAt(index, this.color.set(isSkirt(appearance) ? appearance.skirtColor : appearance.pantsColor));
      actor.label.style.setProperty("--person-color", player.color);
      actor.label.classList.toggle("mine", player.id === this.options.selfId);
      if (player.action && player.action.endsAt > now && this.lastAction.get(player.id) !== player.action.id) {
        this.lastAction.set(player.id, player.action.id);
        if (player.id !== this.options.selfId || !this.prediction || this.prediction.action.kind !== player.action.kind) this.actionFeedback(player.action.kind, positionAt(player, now));
      }
    }
    for (const mesh of Object.values(this.rig)) { mesh.count = this.actorIds.length; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    const foodIds = new Set(snapshot.foods.map((food) => food.id));
    for (const [id, food] of this.foods) if (!foodIds.has(id)) { this.scene.remove(food.group); this.foods.delete(id); }
    for (const food of snapshot.foods) if (!this.foods.has(food.id)) {
      const group = this.createFood(food.kind); group.userData.foodId = food.id; this.scene.add(group);
      this.foods.set(food.id, { group, point: food, createdAt: food.createdAt, phase: Math.random() * TAU });
      if (now - food.createdAt < 2000) this.burst(food, 0xdab66b, 16, 0.8);
    }
    this.lastOverlay = 0;
  }

  move(point: LoungePoint) {
    const actor = this.actors.get(this.options.selfId);
    if (!actor) return;
    const now = this.options.getNow();
    const to = clampPosition(point);
    this.localMove = { from: { ...actor.point }, to, startedAt: now, endsAt: now + Math.hypot(to.x - actor.point.x, to.y - actor.point.y) / loungeWorld.speed * 1000 };
    this.marker.position.set(worldX(to.x), 0.025, worldZ(to.y)); this.markerAt = now; this.marker.visible = true;
    this.tone(330, 0.035, 0.025);
  }

  position() { const actor = this.actors.get(this.options.selfId); return actor ? { ...actor.point } : null; }
  rejectMove() { this.localMove = null; this.marker.visible = false; }

  predict(kind: LoungeActionKind, commandId: string, foodKind?: LoungeFoodKind, foodId?: string, peerId?: string) {
    const now = this.options.getNow();
    const duration = kind === "eat" ? 1600 : kind === "pickup" ? 450 : kind === "punch" ? 650 : kind === "hug" ? 1800 : 1200;
    this.localMove = null;
    this.prediction = { commandId, point: this.position() ?? { x: 500, y: 400 }, hiddenFoodId: kind === "pickup" ? foodId : undefined, action: { id: commandId, kind, startedAt: now, endsAt: now + duration, foodKind, peerId } };
    this.actionFeedback(kind, this.position() ?? { x: 500, y: 400 });
  }

  settle(commandId: string, accepted: boolean) {
    if (this.prediction?.commandId !== commandId) return;
    if (!accepted) this.prediction = null;
    else {
      const serverAction = this.actors.get(this.options.selfId)?.player.action;
      if (serverAction && serverAction.kind === this.prediction.action.kind) this.prediction.action.endsAt = serverAction.endsAt;
    }
  }

  say(text: string, commandId: string) {
    const self = this.actors.get(this.options.selfId)?.player;
    if (self) this.localMessages.set(commandId, { id: commandId, text, nickname: self.nickname, playerId: self.id, createdAt: this.options.getNow() });
    this.lastOverlay = 0;
  }
  finishSay(commandId: string) { this.localMessages.delete(commandId); this.lastOverlay = 0; }

  private setPart(part: LoungeRigPart, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, parent = this.root) {
    this.dummy.position.set(x, y, z); this.dummy.rotation.set(rx, ry, rz); this.dummy.scale.set(sx, sy, sz); this.dummy.updateMatrix();
    this.matrix.multiplyMatrices(parent, this.dummy.matrix); this.rig[part].setMatrixAt(index, this.matrix);
  }

  private hidePart(part: LoungeRigPart, index: number) { this.dummy.matrix.makeScale(0, 0, 0); this.rig[part].setMatrixAt(index, this.dummy.matrix); }

  private hairstyle(appearance: LoungeAppearance, index: number, bob: number, step: number) {
    const style = appearance.hairStyle;
    for (const part of ["hairBack", "hairLeft", "hairRight", "hairTail", "hairLeftTail", "hairRightTail", "hairCrown"] as const) this.hidePart(part, index);
    this.setPart("hair", index, 0, 0.98 + bob, -0.015, style === "buzz" ? 0.227 : 0.236, style === "buzz" ? 0.222 : 0.232, style === "buzz" ? 0.207 : 0.218);
    if (style === "bob" || style === "long") {
      const long = style === "long";
      this.setPart("hairBack", index, 0, (long ? 0.76 : 0.9) + bob, -0.13, 0.238, long ? 0.34 : 0.205, long ? 0.125 : 0.17);
      for (const side of ["left", "right"] as const) this.setPart(side === "left" ? "hairLeft" : "hairRight", index, side === "left" ? -0.205 : 0.205, (long ? 0.76 : 0.86) + bob, 0.01, 0.075, long ? 0.26 : 0.15, 0.095);
    } else if (style === "ponytail") this.setPart("hairTail", index, 0, 0.84 + bob, -0.29, 0.095, 0.235, 0.105, 0.2 + step * 0.13);
    else if (style === "bun") this.setPart("hairTail", index, 0, 1.15 + bob, -0.17, 0.135, 0.13, 0.125);
    else if (style === "twintails") {
      for (const side of ["left", "right"] as const) this.setPart(side === "left" ? "hairLeftTail" : "hairRightTail", index, side === "left" ? -0.255 : 0.255, 0.82 + bob, -0.09, 0.09, 0.23, 0.105, 0, 0, (side === "left" ? -1 : 1) * (0.12 + step * 0.08));
    } else if (style === "spiky") this.setPart("hairCrown", index, 0, 1.13 + bob, 0, 1, 1, 1);
  }

  private limb(index: number, side: "left" | "right", arm: boolean, swing: number, spread: number, bob: number, appearance: LoungeAppearance) {
    const sign = side === "left" ? -1 : 1;
    this.dummy.position.set(sign * (arm ? 0.205 : 0.087), (arm ? 0.69 : 0.33) + bob, 0);
    this.dummy.rotation.set(swing, 0, spread); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix();
    this.joint.multiplyMatrices(this.root, this.dummy.matrix);
    if (arm) {
      const tank = appearance.topStyle === "sleeveless";
      const short = appearance.topStyle === "shortSleeve";
      const hoodie = appearance.topStyle === "hoodie";
      if (tank) this.hidePart(`${side}Arm`, index);
      else this.setPart(`${side}Arm`, index, 0, short ? -0.04 : -0.12, 0, hoodie ? 0.07 : 0.061, short ? 0.04 : 0.087, hoodie ? 0.07 : 0.061, 0, 0, 0, this.joint);
      this.setPart(`${side}Forearm`, index, 0, tank ? -0.12 : short ? -0.17 : -0.24, 0, 0.056, tank ? 0.085 : short ? 0.053 : 0.018, 0.056, 0, 0, 0, this.joint);
      this.setPart(`${side}Hand`, index, 0, -0.27, 0, 0.067, 0.067, 0.067, 0, 0, 0, this.joint);
    } else {
      this.setPart(`${side}Leg`, index, 0, -0.11, 0, 0.067, 0.08, 0.067, 0, 0, 0, this.joint);
      if (isSkirt(appearance)) this.hidePart(`${side}Trouser`, index);
      else this.setPart(`${side}Trouser`, index, 0, appearance.bottomStyle === "shortPants" ? -0.035 : -0.1, 0, 0.074, appearance.bottomStyle === "shortPants" ? 0.045 : 0.09, 0.074, 0, 0, 0, this.joint);
      this.setPart(`${side}Shoe`, index, 0, -0.24, 0.025, 0.14, 0.08, 0.21, 0, 0, 0, this.joint);
    }
  }

  private drawActor(actor: LoungeSceneActor, index: number, now: number, delta: number) {
    const player = actor.player;
    const appearance = actor.appearance;
    const self = player.id === this.options.selfId;
    const serverBusy = Boolean(player.action && player.action.endsAt > now);
    const stunned = player.stunnedUntil > now;
    const predicted = self && this.prediction && this.prediction.action.endsAt > now ? this.prediction.action : null;
    const action = player.action && serverBusy ? (predicted?.kind === player.action.kind ? { ...player.action, startedAt: predicted.startedAt } : player.action) : predicted;
    if (self && this.localMove && (stunned || serverBusy)) this.localMove = null;
    const motion = self && this.localMove ? this.localMove : player.move;
    const position = predicted && !serverBusy && !stunned ? this.prediction!.point : positionAt({ move: motion }, now);
    if (!self) {
      const decay = Math.exp(-(stunned ? 40 : 28) * delta);
      actor.correction.x *= decay; actor.correction.y *= decay;
      position.x += actor.correction.x; position.y += actor.correction.y;
    }
    const dx = position.x - actor.point.x;
    const dy = position.y - actor.point.y;
    const walking = motion.endsAt > now && !action && !stunned;
    if (walking && Math.hypot(dx, dy) > 0.02) {
      const desired = Math.atan2(dx, dy);
      actor.facing += Math.atan2(Math.sin(desired - actor.facing), Math.cos(desired - actor.facing)) * ease(18, delta);
    } else if (action?.peerId) {
      const peer = this.actors.get(action.peerId);
      if (peer) actor.facing = Math.atan2(peer.point.x - position.x, peer.point.y - position.y);
    }
    // Position is predicted locally and only constrained immediately by authoritative stun/action states.
    actor.point.x = position.x; actor.point.y = position.y;
    if (self && this.localMove && now >= this.localMove.endsAt && Math.hypot(positionAt(player, now).x - position.x, positionAt(player, now).y - position.y) < 4) this.localMove = null;
    const step = walking ? Math.sin(now * 0.016) : 0;
    const bob = walking && !this.reducedMotion ? Math.abs(step) * 0.035 : 0;
    const progress = action ? Math.min(1, (now - action.startedAt) / Math.max(1, action.endsAt - action.startedAt)) : 0;
    const eating = action?.kind === "eat";
    const punching = action?.kind === "punch";
    const hugging = action?.kind === "hug";
    this.dummy.position.set(worldX(position.x), 0.025, worldZ(position.y));
    this.dummy.rotation.set(punching ? Math.sin(progress * Math.PI) * 0.18 : 0, actor.facing, stunned ? 0.45 + Math.sin(now * 0.02) * 0.07 : 0);
    this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); this.root.copy(this.dummy.matrix);
    const hoodie = appearance.topStyle === "hoodie";
    const tank = appearance.topStyle === "sleeveless";
    this.setPart("body", index, 0, 0.54 + bob, 0, hoodie ? 0.18 : tank ? 0.137 : 0.16, hoodie ? 0.165 : 0.155, hoodie ? 0.15 : 0.13);
    this.setPart("head", index, 0, 0.95 + bob, 0, 0.225, 0.24, 0.205, eating ? Math.sin(now * 0.018) * 0.09 : 0);
    this.hairstyle(appearance, index, bob, step);
    if (hoodie) this.setPart("hood", index, 0, 0.74 + bob, -0.11, 0.155, 0.13, 0.1);
    else this.hidePart("hood", index);
    if (appearance.topStyle === "shirt") this.setPart("collar", index, 0, 0.72 + bob, 0.13, 1, 1, 1);
    else this.hidePart("collar", index);
    if (hoodie || appearance.topStyle === "shirt") this.setPart("topTrim", index, 0, 0.59 + bob, hoodie ? 0.153 : 0.133, 0.012, hoodie ? 0.13 : 0.23, 0.014);
    else this.hidePart("topTrim", index);
    this.setPart("waist", index, 0, 0.36 + bob, 0, 0.31, 0.085, 0.25);
    if (isSkirt(appearance)) this.setPart("skirt", index, 0, (appearance.bottomStyle === "longSkirt" ? 0.255 : 0.345) + bob, 0, 0.25, appearance.bottomStyle === "longSkirt" ? 0.35 : 0.17, 0.225, 0, 0, step * 0.025);
    else this.hidePart("skirt", index);
    this.setPart("leftEye", index, -0.078, 0.95 + bob, 0.191, 0.018, stunned ? 0.006 : 0.025, 0.012);
    this.setPart("rightEye", index, 0.078, 0.95 + bob, 0.191, 0.018, stunned ? 0.006 : 0.025, 0.012);
    this.setPart("mouth", index, 0, 0.86 + bob, 0.196, eating ? 0.045 + Math.sin(now * 0.025) * 0.012 : 0.045, 0.012, 0.012);
    this.limb(index, "left", false, step * 0.45, 0, bob, appearance);
    this.limb(index, "right", false, -step * 0.45, 0, bob, appearance);
    let rightSwing = -step * 0.35;
    if (eating) rightSwing = -1.7 + Math.sin(now * 0.02) * 0.17;
    else if (punching) rightSwing = -Math.sin(Math.min(1, progress * 2) * Math.PI) * 1.8;
    else if (action?.kind === "handshake" || action?.kind === "give") rightSwing = -1.05 + Math.sin(now * 0.024) * 0.16;
    this.limb(index, "left", true, hugging ? -1.1 : step * 0.35, hugging ? -0.55 : 0.08, bob, appearance);
    this.limb(index, "right", true, hugging ? -1.1 : rightSwing, hugging ? 0.55 : -0.08, bob, appearance);
    this.dummy.position.set(worldX(position.x), 0.012, worldZ(position.y)); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(0.26, 0.16, 1); this.dummy.updateMatrix(); this.rig.shadow.setMatrixAt(index, this.dummy.matrix);
    if (action?.foodKind) {
      if (actor.heldKind !== action.foodKind) { if (actor.held) this.scene.remove(actor.held); actor.held = this.createFood(action.foodKind); actor.held.matrixAutoUpdate = false; actor.heldKind = action.foodKind; this.scene.add(actor.held); }
      this.dummy.position.set(eating ? 0.11 : 0.25, eating ? 0.79 + Math.sin(now * 0.02) * 0.025 : 0.48, eating ? 0.24 : 0.2);
      this.dummy.rotation.set(0.25, 0, eating ? -0.2 : 0);
      const scale = eating ? Math.max(0.05, 1 - progress * 0.85) : 0.8;
      this.dummy.scale.setScalar(scale); this.dummy.updateMatrix(); actor.held!.matrix.multiplyMatrices(this.root, this.dummy.matrix); actor.held!.matrixWorldNeedsUpdate = true;
      if (eating && Math.random() < delta * 12) this.burst(position, 0xe4bf7c, 2, 0.75, 0.65);
    } else if (actor.held) { this.scene.remove(actor.held); actor.held = null; actor.heldKind = null; }
    actor.head.set(worldX(position.x), 1.3 + bob, worldZ(position.y)).project(this.camera);
  }

  private layoutLabels(now: number) {
    const screenPlayers: LoungeRenderedPlayer[] = [];
    for (const actor of this.actors.values()) {
      screenPlayers.push({ ...actor.player, x: (actor.head.x * 0.5 + 0.5) * this.width, y: (-actor.head.y * 0.5 + 0.5) * this.height + 77, walking: false, stunned: actor.player.stunnedUntil > now, busy: false });
    }
    const labels = nameLabels(screenPlayers, this.options.selfId, { x: 0, y: 0 }, { x: this.width, y: this.height }, { x: 0, y: 0 });
    const visible = new Set(labels.map((label) => label.playerId));
    for (const actor of this.actors.values()) actor.label.hidden = !visible.has(actor.player.id);
    for (const label of labels) {
      const actor = this.actors.get(label.playerId)!;
      actor.nameOffset = { x: label.x - (actor.head.x * 0.5 + 0.5) * this.width, y: label.y - (-actor.head.y * 0.5 + 0.5) * this.height };
      actor.nameWidth = label.width; actor.label.style.width = `${label.width}px`;
    }
    for (const [id, message] of this.localMessages) if (now - message.createdAt > loungeRules.bubbleMs) this.localMessages.delete(id);
    const messages = [...(this.state?.messages ?? []), ...this.localMessages.values()];
    const placed = speechBubbles(messages, labels, { x: this.width, y: this.height }, now);
    const bubbleIds = new Set(placed.map((bubble) => bubble.id));
    for (const [id, bubble] of this.bubbles) if (!bubbleIds.has(id)) { bubble.element.remove(); this.bubbles.delete(id); }
    for (const bubble of placed) {
      const actor = this.actors.get(bubble.playerId);
      if (!actor) continue;
      let visual = this.bubbles.get(bubble.id);
      if (!visual) {
        const element = document.createElement("div"); element.className = "scene-speech"; element.setAttribute("aria-hidden", "true");
        const name = document.createElement("strong"); name.textContent = bubble.nickname;
        const text = document.createElement("p"); text.textContent = bubble.text;
        element.append(name, text); this.overlay.appendChild(element);
        visual = { element, playerId: bubble.playerId, offset: { x: 0, y: 0 } }; this.bubbles.set(bubble.id, visual);
      }
      visual.offset.x = bubble.x - (actor.head.x * 0.5 + 0.5) * this.width;
      visual.offset.y = bubble.y - (-actor.head.y * 0.5 + 0.5) * this.height;
      visual.element.style.width = `${bubble.width}px`;
      visual.element.style.maxHeight = `${bubble.height}px`;
    }
  }

  private burst(point: LoungePoint, color: number, count: number, life = 0.65, height = 0.15) {
    if (this.reducedMotion) return;
    for (let i = 0; i < count && this.particles.length < PARTICLES; i += 1) {
      const angle = Math.random() * TAU; const speed = 0.3 + Math.random() * 0.8;
      this.particles.push({ x: worldX(point.x), y: height, z: worldZ(point.y), vx: Math.cos(angle) * speed, vy: 0.6 + Math.random() * 1.1, vz: Math.sin(angle) * speed, life, age: 0, color, size: 0.025 + Math.random() * 0.025 });
    }
  }

  private actionFeedback(kind: LoungeActionKind, point: LoungePoint) {
    const color = kind === "eat" || kind === "pickup" ? 0xe5bb6c : kind === "punch" || kind === "hit" ? 0xe49977 : kind === "hug" ? 0xe89aaa : 0x82bca0;
    this.burst(point, color, kind === "eat" ? 14 : 10, 0.7, kind === "hit" ? 0.8 : 0.45);
    if (kind === "eat") { this.tone(440, 0.07, 0.06); this.tone(660, 0.09, 0.045, 0.11); this.tone(880, 0.08, 0.035, 0.22); }
    else if (kind === "punch" || kind === "hit") this.tone(95, 0.1, 0.07);
    else if (kind === "pickup") { this.tone(550, 0.06, 0.045); this.tone(820, 0.08, 0.035, 0.08); }
    else this.tone(520, 0.08, 0.03);
  }

  unlockAudio = () => {
    if (this.muted || this.disposed) return;
    try { this.audio ??= new AudioContext(); if (this.audio.state === "suspended") void this.audio.resume().catch(() => {}); } catch { /* Visual feedback remains available without audio. */ }
  };
  setMuted(muted: boolean) { this.muted = muted; }

  private tone(frequency: number, duration: number, volume: number, delay = 0) {
    if (this.muted || !this.audio || this.audio.state !== "running") return;
    const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain();
    const start = this.audio.currentTime + delay; oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.78), start + duration);
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(start); oscillator.stop(start + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private animateParticles(delta: number) {
    let retained = 0;
    for (const particle of this.particles) {
      particle.age += delta; if (particle.age >= particle.life) continue;
      particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.z += particle.vz * delta; particle.vy -= delta * 2.3;
      const size = particle.size * (1 - particle.age / particle.life);
      this.dummy.position.set(particle.x, Math.max(0.03, particle.y), particle.z); this.dummy.rotation.set(particle.age * 3, particle.age * 5, 0); this.dummy.scale.setScalar(size); this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(retained, this.dummy.matrix); this.particleMesh.setColorAt(retained, this.color.setHex(particle.color)); this.particles[retained++] = particle;
    }
    this.particles.length = retained; this.particleMesh.count = retained; this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private frame = (at: number) => {
    if (this.disposed || document.hidden || !this.inViewport || !this.state) return;
    const now = this.options.getNow();
    const previewActor = this.options.preview ? this.actors.get(this.options.selfId) : null;
    const turning = previewActor && Math.abs(previewActor.facing - this.previewFacing) > 0.001;
    const active = turning || this.localMove || this.prediction || this.particles.length || this.state.players.some((player) => player.move.endsAt > now || player.stunnedUntil > now || (player.action && player.action.endsAt > now));
    if (at - this.lastFrame < 1000 / (active ? 60 : 24) - 1) return;
    const delta = Math.min(0.05, Math.max(0.001, (at - this.lastFrame) / 1000)); this.lastFrame = at; this.elapsed += delta;
    if (this.prediction && this.prediction.action.endsAt < now) this.prediction = null;
    const self = this.actors.get(this.options.selfId);
    if (this.width / this.height < 1.15 && self) this.target.set(worldX(self.point.x) * 0.7, 0, worldZ(self.point.y) * 0.7);
    else this.target.set(0, 0, 0);
    this.look.lerp(this.target, ease(5, delta));
    if (this.options.preview) { this.camera.position.set(2.6, 1.8, 4); this.camera.lookAt(0, 0.65, 0); }
    else { this.camera.position.copy(this.look).add(this.project.set(9, 11, 12)); this.camera.lookAt(this.look.x, 0.35, this.look.z); }
    this.camera.updateMatrixWorld();
    let stars = 0;
    for (let index = 0; index < this.actorIds.length; index += 1) {
      const actor = this.actors.get(this.actorIds[index])!;
      if (this.options.preview) actor.facing += (this.previewFacing - actor.facing) * (this.reducedMotion ? 1 : ease(16, delta));
      this.drawActor(actor, index, now, delta);
      if (actor.player.stunnedUntil > now) for (let n = 0; n < 3; n += 1) {
        const angle = (this.reducedMotion ? 0 : this.elapsed * 5) + n * TAU / 3;
        this.dummy.position.set(worldX(actor.point.x) + Math.cos(angle) * 0.28, 1.29 + Math.sin(angle * 2) * 0.05, worldZ(actor.point.y) + Math.sin(angle) * 0.2);
        this.dummy.rotation.set(0, angle, Math.PI / 4); this.dummy.scale.set(1, 1, 0.4); this.dummy.updateMatrix(); this.stars.setMatrixAt(stars++, this.dummy.matrix);
      }
    }
    this.stars.count = stars; this.stars.instanceMatrix.needsUpdate = true;
    for (const mesh of Object.values(this.rig)) mesh.instanceMatrix.needsUpdate = true;
    for (const [id, food] of this.foods) {
      food.group.visible = this.prediction?.hiddenFoodId !== id;
      const age = (now - food.createdAt) / 1000;
      food.group.position.set(worldX(food.point.x), 0.13 + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 2 + food.phase) * 0.035 + Math.max(0, 1 - age * 2) * 0.8), worldZ(food.point.y));
      food.group.rotation.y = 0.58 + (this.reducedMotion ? 0 : Math.sin(this.elapsed + food.phase) * 0.15);
    }
    if (this.marker.visible) {
      const life = (now - this.markerAt) / 850;
      this.marker.visible = life < 1; this.marker.scale.setScalar(0.7 + life * 0.8); (this.marker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - life);
    }
    this.animateParticles(delta);
    if (!this.options.preview && now - this.lastOverlay > 100) { this.layoutLabels(now); this.lastOverlay = now; }
    for (const actor of this.actors.values()) {
      const x = (actor.head.x * 0.5 + 0.5) * this.width; const y = (-actor.head.y * 0.5 + 0.5) * this.height;
      actor.label.style.transform = `translate3d(${x + actor.nameOffset.x}px,${y + actor.nameOffset.y}px,0)`;
    }
    for (const bubble of this.bubbles.values()) {
      const actor = this.actors.get(bubble.playerId); if (!actor) continue;
      bubble.element.style.transform = `translate3d(${(actor.head.x * 0.5 + 0.5) * this.width + bubble.offset.x}px,${(-actor.head.y * 0.5 + 0.5) * this.height + bubble.offset.y}px,0)`;
    }
    this.renderer.render(this.scene, this.camera);
  };

  private resize(width: number, height: number) {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    const aspect = this.width / this.height;
    const span = this.options.preview ? aspect > 1 ? 2.35 : 2.05 : aspect < 0.8 ? 7.2 : 8.6;
    this.camera.left = -span * aspect / 2; this.camera.right = span * aspect / 2; this.camera.top = span / 2; this.camera.bottom = -span / 2;
    this.camera.zoom = this.zoomLevel; this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false); this.lastOverlay = 0;
  }
  zoom(delta: number) { this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel + delta, 0.55, 1.8); this.resize(this.width, this.height); }
  rotate(delta: number) { this.previewFacing += delta; }
  setVisible(visible: boolean) { this.inViewport = visible; this.visibility(); }
  selfScreen() {
    const rect = this.host.getBoundingClientRect(); const actor = this.actors.get(this.options.selfId);
    return actor ? { x: rect.left + (actor.head.x * 0.5 + 0.5) * this.width, y: rect.top + (-actor.head.y * 0.5 + 0.5) * this.height } : { x: rect.left + this.width / 2, y: rect.top + this.height / 2 };
  }

  setTheme(dark: boolean) {
    this.scene.background = new THREE.Color(dark ? "#222b30" : "#edf1eb");
    const ground = this.materials.get("solid:#dce8df") as THREE.MeshStandardMaterial | undefined;
    if (ground) ground.color.set(dark ? "#556a61" : "#dce8df");
    const wall = this.materials.get("solid:#e8eee7") as THREE.MeshStandardMaterial | undefined;
    if (wall) wall.color.set(dark ? "#718279" : "#e8eee7");
  }

  private ray(event: { clientX: number; clientY: number }) {
    const rect = this.host.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
  private pick(event: { clientX: number; clientY: number; target: EventTarget | null }): LoungeScenePick | null {
    const label = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-scene-player]") : null;
    if (label?.dataset.scenePlayer) return { kind: "player", id: label.dataset.scenePlayer };
    this.ray(event);
    const foodObjects = [...this.foods.values()].filter((food) => food.group.visible).map((food) => food.group);
    const hits = this.raycaster.intersectObjects([...this.pickables, ...foodObjects], true);
    for (const hit of hits) {
      if (hit.object.userData.rig && hit.instanceId !== undefined) {
        const id = this.actorIds[hit.instanceId]; if (id) return { kind: "player", id };
      }
      let object: THREE.Object3D | null = hit.object;
      while (object) { if (object.userData.foodId) return { kind: "food", id: object.userData.foodId }; object = object.parent; }
    }
    return null;
  }
  private pointerDown = (event: PointerEvent) => {
    if (this.options.preview) return;
    if (event.target instanceof Element && event.target.closest(".scene-speech")) { this.down = null; return; }
    if (event.button !== 0) return;
    this.unlockAudio(); this.down = { x: event.clientX, y: event.clientY, at: performance.now() }; this.suppressClick = false;
    if (event.pointerType === "touch") {
      const target = this.pick(event);
      if (target) this.hold = setTimeout(() => { this.suppressClick = true; this.options.onContext({ ...target, x: event.clientX, y: event.clientY }); }, 450);
    }
  };
  private pointerUp = (event: PointerEvent) => {
    const down = this.down; this.cancelHold(); this.down = null;
    if (!down || event.button !== 0 || this.suppressClick || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    this.ray(event); const hit = this.raycaster.intersectObject(this.floor)[0];
    if (hit) this.options.onMove(clampPosition({ x: hit.point.x / SCALE + loungeWorld.width / 2, y: hit.point.z / SCALE + loungeWorld.height / 2 }));
  };
  private pointerMove = (event: PointerEvent) => {
    if (this.options.preview) return;
    if (this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 8) this.cancelHold();
    if (performance.now() - this.hoverAt < 70) return; this.hoverAt = performance.now();
    const target = this.pick(event);
    const label = target?.kind === "player" ? this.actors.get(target.id)?.player.nickname ?? "" : target?.kind === "food" ? foodName(this.state?.foods.find((food) => food.id === target.id)?.kind ?? "") : "";
    if (label !== this.hover) { this.hover = label; this.host.style.cursor = label ? "context-menu" : "crosshair"; this.options.onHover(label); }
  };
  private contextMenu = (event: MouseEvent) => {
    if (this.options.preview) { event.preventDefault(); return; }
    if (event.target instanceof Element && event.target.closest(".scene-speech")) return;
    event.preventDefault(); this.cancelHold(); this.unlockAudio(); const target = this.pick(event);
    if (target) this.options.onContext({ ...target, x: event.clientX, y: event.clientY });
  };
  private cancelHold = () => { if (this.hold) clearTimeout(this.hold); this.hold = null; };
  private wheel = (event: WheelEvent) => {
    if (this.options.preview) return;
    if (event.target instanceof Element && event.target.closest(".scene-speech")) return;
    event.preventDefault(); this.zoom(event.deltaY > 0 ? -0.07 : 0.07);
  };
  private visibility = () => { this.renderer.setAnimationLoop(document.hidden || !this.inViewport ? null : this.frame); this.lastFrame = 0; };
  private contextLost = (event: Event) => { event.preventDefault(); this.renderer.setAnimationLoop(null); this.options.onError("3D 화면 연결이 끊겼어요. 화면을 다시 불러와 주세요."); };

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.renderer.setAnimationLoop(null); this.observer.disconnect(); this.themeObserver.disconnect(); this.cancelHold();
    this.host.removeEventListener("pointerdown", this.pointerDown); this.host.removeEventListener("pointerup", this.pointerUp); this.host.removeEventListener("pointermove", this.pointerMove);
    this.host.removeEventListener("pointercancel", this.cancelHold); this.host.removeEventListener("contextmenu", this.contextMenu); this.host.removeEventListener("wheel", this.wheel);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost); document.removeEventListener("visibilitychange", this.visibility);
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.renderer.renderLists.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.overlay.remove();
    if (this.audio) void this.audio.close().catch(() => {});
    this.actors.clear(); this.foods.clear(); this.bubbles.clear(); this.particles.length = 0;
  }
}
