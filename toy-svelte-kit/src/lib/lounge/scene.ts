import * as THREE from "three";
import { clampPosition, foodName, loungeRules, loungeWorld, positionAt } from "./shared";
import { nameLabels, speechBubbles } from "./layout";
import { isSkirt, normalizeAppearance } from "./appearance";
import { Campground } from "./campground";
import { planMove } from "./navigation";
import { characterDimensions as anatomy, createCharacterGeometries, hairParts } from "./character";
import type { LoungeAppearance } from "$lib/types/LoungeAppearance";
import type { LoungeActionKind, LoungeFoodKind, LoungeMessage, LoungePoint, LoungeRenderedPlayer, LoungeSnapshot } from "$lib/types/Lounge";
import type { LoungeRig, LoungeRigPart, LoungeSceneActor, LoungeSceneBubble, LoungeSceneController, LoungeSceneFood, LoungeSceneLocalMove, LoungeSceneOptions, LoungeSceneParticle, LoungeScenePick, LoungeScenePrediction, LoungeHeldPrediction } from "$lib/types/LoungeScene";

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
  private headJoint = new THREE.Matrix4();
  private lowerJoint = new THREE.Matrix4();
  private grip = new THREE.Matrix4();
  private shoulder = new THREE.Vector3();
  private elbow = new THREE.Vector3();
  private handGoal = new THREE.Vector3();
  private armDirection = new THREE.Vector3();
  private armBend = new THREE.Vector3();
  private boneDown = new THREE.Vector3(0, -1, 0);
  private toonRamp: THREE.DataTexture | null = null;
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
  private heldPrediction: LoungeHeldPrediction | null = null;
  private camp: Campground | null = null;
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

    this.scene.add(new THREE.HemisphereLight(this.options.preview ? 0xf7fbff : 0xa8c8db, this.options.preview ? 0x8a9c87 : 0x58563e, this.options.preview ? 1.1 : 1.7));
    const light = new THREE.DirectionalLight(this.options.preview ? 0xfff6e7 : 0xd7e7ff, this.options.preview ? 1.5 : 1.35);
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
    this.camp = new Campground(this.scene);
    return this.camp.floor;
  }

  private makeRig(): LoungeRig {
    const rig = {} as LoungeRig;
    const meshes = createCharacterGeometries();
    for (const [name, geometry] of Object.entries(meshes)) this.geometries.set(`character:${name}`, geometry);
    this.toonRamp = new THREE.DataTexture(new Uint8Array([95,95,95,255,163,163,163,255,218,218,218,255,255,255,255,255]), 4, 1, THREE.RGBAFormat);
    this.toonRamp.minFilter = THREE.NearestFilter; this.toonRamp.magFilter = THREE.NearestFilter; this.toonRamp.generateMipmaps = false; this.toonRamp.needsUpdate = true;
    const toon = this.material("character:toon", () => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: this.toonRamp }));
    const face = this.material("character:face", () => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }));
    const add = (part: LoungeRigPart, geometry: THREE.BufferGeometry, material = toon) => {
      const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
      mesh.count = 0; mesh.frustumCulled = false; mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.userData.rig = true;
      rig[part] = mesh; this.scene.add(mesh); if (part !== "shadow") this.pickables.push(mesh);
    };
    add("head", meshes.head); add("neck", meshes.neck);
    for (const part of Object.values(hairParts)) add(part, meshes[part]);
    add("body", meshes.body); add("tankBody", meshes.tank); add("hoodieBody", meshes.hoodie);
    add("shirtDetails", meshes.shirtDetails); add("hoodieDetails", meshes.hoodieDetails);
    add("waist", meshes.waist); add("skirt", meshes.skirt);
    for (const side of ["left", "right"] as const) {
      add(`${side}UpperArm`, meshes.skinLimb); add(`${side}Arm`, meshes.sleeve);
      add(`${side}Forearm`, meshes.skinLimb); add(`${side}Cuff`, meshes.sleeve); add(`${side}Hand`, meshes.hand);
      add(`${side}Leg`, meshes.skinLimb); add(`${side}Shin`, meshes.skinLimb);
      add(`${side}Trouser`, meshes.trouser); add(`${side}LowerTrouser`, meshes.trouser);
      add(`${side}Shoe`, meshes.shoe); add(`${side}Eye`, meshes.eye, face);
    }
    add("mouth", meshes.smile, face); add("mouthOpen", meshes.openMouth, face);
    add("shadow", this.geometry("shadow", () => new THREE.CircleGeometry(1, 20)), this.material("shadow", () => new THREE.MeshBasicMaterial({ color: 0x27392f, transparent: true, opacity: 0.22, depthWrite: false })));
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
      const appearanceKey = JSON.stringify(appearance);
      if (actor.slot !== index || actor.appearanceKey !== appearanceKey) {
        for (const part of ["body", "tankBody", "hoodieBody", "leftArm", "rightArm", "leftCuff", "rightCuff"] as const) this.rig[part].setColorAt(index, this.color.set(appearance.topColor));
        for (const part of Object.values(hairParts)) this.rig[part].setColorAt(index, this.color.set(appearance.hairColor));
        for (const part of ["leftTrouser", "rightTrouser", "leftLowerTrouser", "rightLowerTrouser"] as const) this.rig[part].setColorAt(index, this.color.set(appearance.pantsColor));
        this.rig.skirt.setColorAt(index, this.color.set(appearance.skirtColor));
        this.rig.waist.setColorAt(index, this.color.set(isSkirt(appearance) ? appearance.skirtColor : appearance.pantsColor));
        actor.slot = index; actor.appearanceKey = appearanceKey;
        for (const mesh of Object.values(this.rig)) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      actor.label.style.setProperty("--person-color", player.color);
      actor.label.classList.toggle("mine", player.id === this.options.selfId);
      if (player.action && player.action.endsAt > now && this.lastAction.get(player.id) !== player.action.id) {
        this.lastAction.set(player.id, player.action.id);
        if (player.id !== this.options.selfId || !this.prediction || this.prediction.action.kind !== player.action.kind) this.actionFeedback(player.action.kind, positionAt(player, now));
      }
    }
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
    this.localMove = planMove(actor.point, point, now);
    const to = this.localMove.to;
    this.marker.position.set(worldX(to.x), 0.025, worldZ(to.y)); this.markerAt = now; this.marker.visible = true;
    this.tone(330, 0.035, 0.025);
  }

  position() { const actor = this.actors.get(this.options.selfId); return actor ? { ...actor.point } : null; }
  rejectMove() { this.localMove = null; this.marker.visible = false; }

  predict(kind: LoungeActionKind, commandId: string, foodKind?: LoungeFoodKind, foodId?: string, peerId?: string) {
    const now = this.options.getNow();
    const duration = kind === "eat" ? 1600 : kind === "pickup" ? 450 : kind === "punch" ? 650 : kind === "hug" ? 1800 : 1200;
    this.localMove = null;
    const point = this.position() ?? { x: loungeWorld.width / 2, y: loungeWorld.height / 2 + 200 };
    this.prediction = { commandId, point, hiddenFoodId: kind === "pickup" ? foodId : undefined, action: { id: commandId, kind, startedAt: now, endsAt: now + duration, foodKind, peerId } };
    this.actionFeedback(kind, point);
  }

  settle(commandId: string, accepted: boolean) {
    if (this.heldPrediction?.commandId === commandId) this.heldPrediction = null;
    if (this.prediction?.commandId !== commandId) return;
    if (!accepted) this.prediction = null;
    else {
      const serverAction = this.actors.get(this.options.selfId)?.player.action;
      if (serverAction && serverAction.kind === this.prediction.action.kind) this.prediction.action.endsAt = serverAction.endsAt;
    }
  }
  carry(kind: LoungeFoodKind | null, commandId: string) { this.heldPrediction = { kind, commandId }; this.tone(430, 0.045, 0.025); }

  say(text: string, commandId: string) {
    const self = this.actors.get(this.options.selfId)?.player;
    if (self) this.localMessages.set(commandId, { id: commandId, text, nickname: self.nickname, playerId: self.id, createdAt: this.options.getNow() });
    this.lastOverlay = 0;
  }
  finishSay(commandId: string) { this.localMessages.delete(commandId); this.lastOverlay = 0; }

  private setPart(part: LoungeRigPart, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, parent = this.root) {
    this.dummy.position.set(x, y, z); this.dummy.rotation.set(rx, ry, rz); this.dummy.scale.set(sx, sy, sz); this.dummy.updateMatrix();
    this.matrix.multiplyMatrices(parent, this.dummy.matrix); this.rig[part].setMatrixAt(index, this.matrix); this.rig[part].count = Math.max(this.rig[part].count, index + 1);
  }

  private hidePart(part: LoungeRigPart, index: number) { this.dummy.matrix.makeScale(0, 0, 0); this.rig[part].setMatrixAt(index, this.dummy.matrix); }

  private hairstyle(appearance: LoungeAppearance, index: number) {
    const selected = hairParts[appearance.hairStyle];
    for (const part of Object.values(hairParts)) {
      if (part === selected) this.setPart(part, index, 0, 0, 0, 1, 1, 1, 0, 0, 0, this.headJoint);
      else this.hidePart(part, index);
    }
  }

  private bone(start: THREE.Vector3, end: THREE.Vector3) {
    this.armDirection.subVectors(end, start).normalize();
    this.dummy.position.copy(start); this.dummy.quaternion.setFromUnitVectors(this.boneDown, this.armDirection); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix();
    this.joint.multiplyMatrices(this.root, this.dummy.matrix);
  }

  private arm(index: number, side: "left" | "right", x: number, y: number, z: number, bob: number, appearance: LoungeAppearance) {
    const sign = side === "left" ? -1 : 1;
    const tank = appearance.topStyle === "sleeveless"; const short = appearance.topStyle === "shortSleeve";
    const long = !tank && !short; const width = appearance.topStyle === "hoodie" ? 0.165 : 0.145;
    const upper = anatomy.upperArm; const lower = anatomy.forearm;
    this.shoulder.set(sign * (tank ? 0.238 : 0.28), anatomy.shoulderY + bob, 0);
    this.handGoal.set(x, y + bob, z);
    this.armDirection.subVectors(this.handGoal, this.shoulder);
    const reach = Math.min(upper + lower - 0.002, Math.max(0.03, this.armDirection.length()));
    this.armDirection.normalize(); this.handGoal.copy(this.shoulder).addScaledVector(this.armDirection, reach);
    this.armBend.set(sign * 0.75, -1, 0.12).addScaledVector(this.armDirection, -this.armBend.dot(this.armDirection)).normalize();
    const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    this.elbow.copy(this.shoulder).addScaledVector(this.armDirection, along).addScaledVector(this.armBend, Math.sqrt(Math.max(0, upper * upper - along * along)));
    this.bone(this.shoulder, this.elbow);
    this.setPart(`${side}UpperArm`, index, 0, 0, 0, 0.113, upper, 0.11, 0, 0, 0, this.joint);
    if (tank) this.hidePart(`${side}Arm`, index);
    else this.setPart(`${side}Arm`, index, 0, 0.008, 0, width, short ? upper * 0.57 : upper + 0.012, width, 0, 0, 0, this.joint);
    this.bone(this.elbow, this.handGoal);
    this.setPart(`${side}Forearm`, index, 0, 0, 0, 0.105, lower, 0.10, 0, 0, 0, this.joint);
    if (long) this.setPart(`${side}Cuff`, index, 0, 0.008, 0, width * 0.88, lower - 0.02, width * 0.88, 0, 0, 0, this.joint);
    else this.hidePart(`${side}Cuff`, index);
    this.setPart(`${side}Hand`, index, 0, -lower, 0, 1, 1, 1, 0, side === "left" ? Math.PI : 0, 0, this.joint);
    if (side === "right") {
      this.dummy.position.copy(this.handGoal); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); this.grip.multiplyMatrices(this.root, this.dummy.matrix);
    }
  }

  private leg(index: number, side: "left" | "right", step: number, bob: number, appearance: LoungeAppearance) {
    const sign = side === "left" ? -1 : 1; const swing = step * 0.46; const bend = Math.max(0, -step) * 0.66;
    const trousers = !isSkirt(appearance); const long = appearance.bottomStyle === "longPants";
    this.dummy.position.set(sign * 0.12, anatomy.hipY + bob, 0); this.dummy.rotation.set(swing, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); this.joint.multiplyMatrices(this.root, this.dummy.matrix);
    this.setPart(`${side}Leg`, index, 0, 0, 0, 0.145, anatomy.thigh, 0.14, 0, 0, 0, this.joint);
    if (trousers) this.setPart(`${side}Trouser`, index, 0, 0.015, 0, 0.19, long ? anatomy.thigh + 0.025 : anatomy.thigh * 0.8, 0.18, 0, 0, 0, this.joint);
    else this.hidePart(`${side}Trouser`, index);
    this.dummy.position.set(0, -anatomy.thigh, 0); this.dummy.rotation.set(bend, 0, 0); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); this.lowerJoint.multiplyMatrices(this.joint, this.dummy.matrix);
    this.setPart(`${side}Shin`, index, 0, 0, 0, 0.12, anatomy.shin, 0.12, 0, 0, 0, this.lowerJoint);
    if (long) this.setPart(`${side}LowerTrouser`, index, 0, 0.015, 0, 0.167, anatomy.shin - 0.005, 0.16, 0, 0, 0, this.lowerJoint);
    else this.hidePart(`${side}LowerTrouser`, index);
    this.setPart(`${side}Shoe`, index, 0, -anatomy.shin, 0, 1, 1, 1, -(swing + bend) * 0.65, 0, 0, this.lowerJoint);
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
    const carried = self && this.heldPrediction ? this.heldPrediction.kind : player.inventory.find((food) => food.id === player.heldFoodId)?.kind;
    const foodKind = action?.foodKind ?? carried;
    this.dummy.position.set(worldX(position.x), 0.025, worldZ(position.y));
    this.dummy.rotation.set(punching ? Math.sin(progress * Math.PI) * 0.18 : 0, actor.facing, stunned ? 0.45 + Math.sin(now * 0.02) * 0.07 : 0);
    this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); this.root.copy(this.dummy.matrix);
    const hoodie = appearance.topStyle === "hoodie";
    const tank = appearance.topStyle === "sleeveless";
    const torso = hoodie ? "hoodieBody" : tank ? "tankBody" : "body";
    for (const part of ["body", "tankBody", "hoodieBody"] as const) {
      if (part === torso) this.setPart(part, index, 0, 0.60 + bob, 0, 1, 1, 1);
      else this.hidePart(part, index);
    }
    this.setPart("neck", index, 0, 1.065 + bob, 0, 1, 1, 1);
    if (appearance.topStyle === "shirt") this.setPart("shirtDetails", index, 0, 0.60 + bob, 0, 1, 1, 1);
    else this.hidePart("shirtDetails", index);
    if (hoodie) this.setPart("hoodieDetails", index, 0, 0.60 + bob, 0, 1, 1, 1);
    else this.hidePart("hoodieDetails", index);
    this.dummy.position.set(0, anatomy.headY + bob, 0);
    this.dummy.rotation.set(eating ? Math.sin(now * 0.018) * 0.055 : walking ? step * 0.012 : 0, 0, 0);
    this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); this.headJoint.multiplyMatrices(this.root, this.dummy.matrix);
    this.setPart("head", index, 0, 0, 0, 1, 1, 1, 0, 0, 0, this.headJoint);
    this.hairstyle(appearance, index);
    const blink = stunned || (!this.reducedMotion && (now + player.joinedAt % 1900) % 4400 < 115);
    for (const side of ["left", "right"] as const) this.setPart(`${side}Eye`, index, side === "left" ? -0.105 : 0.105, 0.005, 0.256, 1, blink ? 0.12 : 1, 1, 0, 0, 0, this.headJoint);
    if (eating) {
      this.hidePart("mouth", index);
      this.setPart("mouthOpen", index, 0, -0.15, 0.254, 1, 0.8 + Math.sin(now * 0.025) * 0.2, 1, 0, 0, 0, this.headJoint);
    } else {
      this.hidePart("mouthOpen", index);
      this.setPart("mouth", index, 0, -0.14, 0.256, 1, stunned ? 0.25 : 1, 1, 0, 0, 0, this.headJoint);
    }
    this.setPart("waist", index, 0, 0.60 + bob, 0, 1, 1, 1);
    if (isSkirt(appearance)) this.setPart("skirt", index, 0, 0.63 + bob, 0, 0.345, appearance.bottomStyle === "longSkirt" ? 0.49 : 0.28, 0.27, 0, 0, step * 0.018);
    else this.hidePart("skirt", index);
    this.leg(index, "left", step, bob, appearance); this.leg(index, "right", -step, bob, appearance);
    const handWave = Math.sin(now * 0.024);
    this.arm(index, "left", hugging ? -0.38 : -0.30, hugging ? 1.0 : 0.63, hugging ? 0.31 : step * 0.16, bob, appearance);
    let handX = 0.30; let handY = 0.63; let handZ = -step * 0.16;
    if (eating) { handX = 0.13; handY = 1.21 + Math.sin(now * 0.02) * 0.015; handZ = 0.28; }
    else if (punching) { handX = 0.22; handY = 0.98; handZ = 0.12 + Math.sin(progress * Math.PI) * 0.38; }
    else if (hugging) { handX = 0.38; handY = 1.0; handZ = 0.31; }
    else if (action?.kind === "handshake" || action?.kind === "give") { handX = 0.16; handY = 0.90 + handWave * 0.035; handZ = 0.34; }
    else if (action?.kind === "pickup") { handY = 0.60; handZ = Math.sin(progress * Math.PI) * 0.25; }
    else if (carried) { handX = 0.28; handY = 0.78 + step * 0.012; handZ = 0.22; }
    this.arm(index, "right", handX, handY, handZ, bob, appearance);
    this.dummy.position.set(worldX(position.x), 0.012, worldZ(position.y)); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(0.34, 0.22, 1); this.dummy.updateMatrix(); this.rig.shadow.setMatrixAt(index, this.dummy.matrix); this.rig.shadow.count = Math.max(this.rig.shadow.count, index + 1);
    if (foodKind) {
      if (actor.heldKind !== foodKind) { if (actor.held) this.scene.remove(actor.held); actor.held = this.createFood(foodKind); actor.held.matrixAutoUpdate = false; actor.heldKind = foodKind; this.scene.add(actor.held); }
      this.dummy.position.set(0, 0.005, 0.035);
      this.dummy.rotation.set(0.25, 0, eating ? -0.2 : 0);
      const scale = eating ? Math.max(0.05, 1 - progress * 0.85) : 0.8;
      this.dummy.scale.setScalar(scale); this.dummy.updateMatrix(); actor.held!.matrix.multiplyMatrices(this.grip, this.dummy.matrix); actor.held!.matrixWorldNeedsUpdate = true;
      if (eating && Math.random() < delta * 12) this.burst(position, 0xe4bf7c, 2, 0.75, 1.27);
    } else if (actor.held) { this.scene.remove(actor.held); actor.held = null; actor.heldKind = null; }
    actor.head.set(0, anatomy.labelY + bob, 0).applyMatrix4(this.root).project(this.camera);
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
    if (self && !this.options.preview) this.target.set(worldX(self.point.x), 0, worldZ(self.point.y));
    else this.target.set(0, 0, 0);
    this.look.lerp(this.target, ease(5, delta));
    if (this.options.preview) { this.camera.position.set(2.6, 2.05, 4); this.camera.lookAt(0, 1.0, 0); }
    else { this.camera.position.copy(this.look).add(this.project.set(9, 11, 12)); this.camera.lookAt(this.look.x, 0.35, this.look.z); }
    this.camera.updateMatrixWorld();
    let stars = 0;
    for (const mesh of Object.values(this.rig)) mesh.count = 0;
    for (let index = 0; index < this.actorIds.length; index += 1) {
      const actor = this.actors.get(this.actorIds[index])!;
      if (this.options.preview) actor.facing += (this.previewFacing - actor.facing) * (this.reducedMotion ? 1 : ease(16, delta));
      this.drawActor(actor, index, now, delta);
      if (actor.player.stunnedUntil > now) for (let n = 0; n < 3; n += 1) {
        const angle = (this.reducedMotion ? 0 : this.elapsed * 5) + n * TAU / 3;
        this.dummy.position.set(Math.cos(angle) * 0.34, 2.03 + Math.sin(angle * 2) * 0.05, Math.sin(angle) * 0.25).applyMatrix4(this.root);
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
    this.camp?.animate(this.elapsed, this.reducedMotion);
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
    const span = this.options.preview ? aspect > 1 ? 2.8 : 2.65 : aspect < 0.8 ? 8 : 10;
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
    if (!this.options.preview) {
      const color = dark ? "#253c3c" : "#566e69";
      this.scene.background = new THREE.Color(color); this.scene.fog = new THREE.Fog(color, 24, 43); return;
    }
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
    this.camp?.dispose(); this.toonRamp?.dispose();
    this.renderer.renderLists.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.overlay.remove();
    if (this.audio) void this.audio.close().catch(() => {});
    this.actors.clear(); this.foods.clear(); this.bubbles.clear(); this.particles.length = 0;
  }
}
