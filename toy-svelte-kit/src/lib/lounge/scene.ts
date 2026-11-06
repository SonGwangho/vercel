import { LoungeInsectModels } from "./insect-models";
import { LoungeMonsterModels } from "./monster-models";
import characterModel from "../assets/data/lounge/character-model.json";
import npcSettings from "../assets/data/lounge/npc.json";
import { normalizeNpc } from "./npc";
import { describeMonster, monsterPositionAt, monsterPunchRange, monsterRules } from "./monsters";
import type { LoungeMonsterVisual } from "$lib/types/LoungeMonster";
import { describeInsect, insectHeight, insectHeldScale, insectPositionAt, insectRules } from "./insects";
import type { LoungeInsectVisual } from "$lib/types/LoungeInsect";
import * as THREE from "three";
import { actionDuration, clampPosition, distance, foodName, isLoungeEmote, loungeRules, loungeWorld, positionAt } from "./shared";
import { nameLabels, speechBubbles } from "./layout";
import { normalizeAppearance } from "./appearance";
import { Campground } from "./campground";
import { groundSeatAllowed, loungeBenches, loungeLogs, seatedMove, seatingRules } from "./seating";
import { canFishFrom, catchLabel, describeFish, fishDisplayLength, fishDisplayOffset, fishLength, fishingMotion, lake, lakeCenter } from "./fishing";
import { LoungeFishModels } from "./fish-models";
import { LoungeCharacter, loadLoungeCharacters } from "./avatar";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { LoungeAction, LoungeActionKind, LoungeFishKind, LoungeFoodKind, LoungeMessage, LoungePoint, LoungeRenderedPlayer, LoungeSnapshot } from "$lib/types/Lounge";
import type { LoungeSceneActor, LoungeSceneBubble, LoungeSceneController, LoungeSceneFood, LoungeSceneLocalMove, LoungeSceneOptions, LoungeSceneParticle, LoungeScenePick, LoungeScenePrediction, LoungeHeldPrediction } from "$lib/types/LoungeScene";

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
  private contextPointer: LoungePoint | null = null;
  private dummy = new THREE.Object3D();
  private root = new THREE.Matrix4();
  private grip = new THREE.Matrix4();
  private project = new THREE.Vector3();
  private peerTarget = new THREE.Vector3();
  private rodTip = new THREE.Vector3();
  private waterPoint = new THREE.Vector3();
  private landingPoint = new THREE.Vector3();
  private catchGrip = new THREE.Matrix4();
  private viewDirection = new THREE.Vector3();
  private catchPosition = new THREE.Vector3();
  private target = new THREE.Vector3();
  private look = new THREE.Vector3();
  private color = new THREE.Color();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.Material>();
  private fishModels = new LoungeFishModels();
  private insectModels = new LoungeInsectModels();
  private insects = new Map<string, LoungeInsectVisual>();
  private monsterModels: LoungeMonsterModels;
  private monsters = new Map<string, LoungeMonsterVisual>();
  private actors = new Map<string, LoungeSceneActor>();
  private actorIds: string[] = [];
  private foods = new Map<string, LoungeSceneFood>();
  private bubbles = new Map<string, LoungeSceneBubble>();
  private pickables: THREE.Object3D[] = [];
  private shadows: THREE.InstancedMesh;
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
  private lostContext = false;
  private muted = false;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private audio: AudioContext | null = null;
  private zoomLevel = 1;
  private previewFacing = 0.25;
  private inViewport = true;
  private hover = "";
  private hoverAt = 0;
  private hold: ReturnType<typeof setTimeout> | null = null;
  private down: { x: number; y: number; at: number } | null = null;
  private suppressClick = false;

  constructor(private host: HTMLDivElement, private options: LoungeSceneOptions, private characterAsset: GLTF) {
    const characterHeight = new THREE.Box3().setFromObject(characterAsset.scene).getSize(new THREE.Vector3()).y * characterModel.scale;
    this.monsterModels = new LoungeMonsterModels(Number.isFinite(characterHeight) && characterHeight > 0 ? characterHeight : 1.5);
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
    this.shadows = this.makeShadow();
    this.particleMesh = new THREE.InstancedMesh(this.geometry("crumb", () => new THREE.IcosahedronGeometry(1, 0)), this.material("particle", () => new THREE.MeshBasicMaterial({ color: 0xffffff })), PARTICLES);
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.particleMesh);
    this.stars = new THREE.InstancedMesh(this.geometry("star", () => new THREE.OctahedronGeometry(0.055, 0)), this.material("gold", () => new THREE.MeshBasicMaterial({ color: 0xf5c456 })), (CAPACITY + 1) * 3);
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
    this.host.addEventListener("pointerleave", this.pointerLeave);
    this.host.addEventListener("pointercancel", this.cancelHold);
    this.host.addEventListener("contextmenu", this.contextMenu);
    this.host.addEventListener("wheel", this.wheel, { passive: false });
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.contextRestored);
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

  private makeShadow() {
    const shadow = new THREE.InstancedMesh(this.geometry("shadow", () => new THREE.CircleGeometry(1, 20)), this.material("shadow", () => new THREE.MeshBasicMaterial({ color: 0x27392f, transparent: true, opacity: .22, depthWrite: false })), CAPACITY + 1);
    shadow.count = 0; shadow.frustumCulled = false; shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(shadow);
    return shadow;
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

  private createFish(kind: LoungeFishKind) {
    return this.fishModels.create(kind);
  }

  private createRod() {
    const group = new THREE.Group();
    this.box(group, "#614b37", 0, .026, .018, .055, .053, .25);
    const shaft = this.box(group, "#9b774b", 0, .214, .68, .027, .028, 1.36);
    shaft.rotation.x = -.27;
    this.ball(group, "#5b655c", .043, .013, .15, .046, .043, .052);
    return group;
  }

  private drawCast(actor: LoungeSceneActor, point: LoungePoint, action: LoungeAction, now: number) {
    if (!actor.cast) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(lineGeometry, this.material("fishing-line", () => new THREE.LineBasicMaterial({ color: "#d2d6c0" })));
      line.frustumCulled = false;
      const bobber = this.ball(this.scene, "#e48161", 0, .045, 0, .065, .076, .065);
      this.scene.add(line);
      actor.cast = { line, bobber };
    }
    const { line, bobber } = actor.cast;
    const dx = point.x - lakeCenter.x;
    const dz = point.y - lakeCenter.y;
    const fraction = (lake.radius - .95) / Math.max(1, Math.hypot(dx, dz));
    const bob = this.reducedMotion ? 0 : Math.sin(now / 280) * .018;
    const motion = fishingMotion(action, now);
    const catching = action.kind === "fishCatch";
    this.waterPoint.set(lake.x + dx * fraction, .045 + bob, lake.z + dz * fraction);
    this.rodTip.set(0, .39, 1.33).applyMatrix4(actor.held!.matrix);
    if (catching) {
      actor.visual.grip(this.catchGrip, false, true);
      this.landingPoint.set(0, .005, fishDisplayOffset(actor.player.lastCatch?.sizeCm ?? 100)).applyMatrix4(this.catchGrip);
      bobber.position.lerpVectors(this.waterPoint, this.landingPoint, motion.lift);
      if (!this.reducedMotion) bobber.position.y += Math.sin(motion.lift * Math.PI) * .65;
      const catchFish = actor.player.lastCatch;
      if (catchFish) {
        if (actor.cast.fishKind !== catchFish.kind) {
          actor.cast.fish?.removeFromParent();
          actor.cast.fish = this.createFish(catchFish.kind);
          actor.cast.fishKind = catchFish.kind;
          this.scene.add(actor.cast.fish);
        }
        const fish = actor.cast.fish!;
        fish.visible = motion.lift > 0;
        fish.position.copy(bobber.position);
        fish.rotation.set(.18, actor.facing, this.reducedMotion ? 0 : Math.sin(now / 75) * .14 * (1 - motion.recovery));
        fish.scale.setScalar(fishDisplayLength(catchFish.sizeCm));
      }
      if (motion.lift > 0 && actor.cast.liftedFor !== action.id) {
        actor.cast.liftedFor = action.id;
        this.burst({ x: this.waterPoint.x / SCALE + loungeWorld.width / 2, y: this.waterPoint.z / SCALE + loungeWorld.height / 2 }, 0x9fcad0, 9, .6, .07);
      }
    } else {
      if (actor.cast.fish) actor.cast.fish.visible = false;
      const flight = this.reducedMotion ? Number(motion.flight > 0) : motion.flight;
      bobber.position.lerpVectors(this.rodTip, this.waterPoint, flight);
      if (!this.reducedMotion) bobber.position.y += Math.sin(flight * Math.PI) * .55;
      if (motion.flight >= 1 && actor.cast.landedFor !== action.id) {
        actor.cast.landedFor = action.id;
        if (now - (action.fishing?.readyAt ?? action.startedAt) < 250) {
          this.burst({ x: this.waterPoint.x / SCALE + loungeWorld.width / 2, y: this.waterPoint.z / SCALE + loungeWorld.height / 2 }, 0x9fcad0, 7, .5, .05);
        }
      }
    }
    const vertices = line.geometry.getAttribute("position");
    vertices.setXYZ(0, this.rodTip.x, this.rodTip.y, this.rodTip.z);
    vertices.setXYZ(1, bobber.position.x, bobber.position.y, bobber.position.z);
    vertices.needsUpdate = true;
    line.visible = true;
    bobber.visible = !catching || motion.lift < .8;
  }

  private disposeCast(actor: LoungeSceneActor) {
    if (!actor.cast) return;
    actor.cast.line.removeFromParent();
    actor.cast.line.geometry.dispose();
    actor.cast.bobber.removeFromParent();
    actor.cast.fish?.removeFromParent();
    actor.cast = undefined;
  }

  update(snapshot: LoungeSnapshot) {
    if (this.disposed) return;
    this.state = snapshot;
    const participants = snapshot.players.slice(0, CAPACITY);
    if (!this.options.preview && snapshot.npc) participants.push(normalizeNpc(snapshot.npc));
    const ids = new Set(participants.map((player) => player.id));
    for (const [id, actor] of this.actors) if (!ids.has(id)) {
      this.disposeCast(actor);
      actor.label.remove(); actor.fishLabel.remove(); actor.visual.dispose(); this.pickables = this.pickables.filter((object) => object !== actor.visual.group); if (actor.held) this.scene.remove(actor.held); this.actors.delete(id); this.lastAction.delete(id);
    }
    this.actorIds = participants.map((player) => player.id);
    const now = this.options.getNow();
    for (const player of participants) {
      const isNpc = player.id === npcSettings.id;
      let actor = this.actors.get(player.id);
      if (!actor) {
        const label = document.createElement("button"); label.type = "button"; label.className = "scene-name";
        if (isNpc) { label.dataset.sceneNpc = player.id; label.classList.add("scene-npc-label"); }
        else label.dataset.scenePlayer = player.id;
        label.textContent = player.nickname + (player.id === this.options.selfId ? " · 나" : "");
        label.title = `${player.nickname} · 우클릭 / Space로 행동`;
        label.addEventListener("keydown", (event) => {
          if (!["Enter", " ", "ContextMenu"].includes(event.key)) return;
          if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault(); event.stopPropagation();
          if (event.repeat) return;
          const rect = label.getBoundingClientRect();
          this.options.onContext({ kind: isNpc ? "npc" : "player", id: player.id, x: rect.right, y: rect.bottom });
        });
        this.overlay.appendChild(label);
        const fishLabel = document.createElement("div");
        fishLabel.className = "scene-fish-label";
        fishLabel.hidden = true;
        fishLabel.setAttribute("aria-hidden", "true");
        fishLabel.append(document.createElement("strong"), document.createElement("span"));
        this.overlay.appendChild(fishLabel);
        const visual = new LoungeCharacter(this.characterAsset, normalizeAppearance(player.appearance, player.color));
        visual.group.userData[isNpc ? "npcId" : "playerId"] = player.id; this.scene.add(visual.group); this.pickables.push(visual.group);
        actor = { player, visual, appearance: normalizeAppearance(player.appearance, player.color), point: positionAt(player, now), correction: { x: 0, y: 0 }, facing: 0.58, head: new THREE.Vector3(), label, fishLabel, nameOffset: { x: -45, y: -25 }, nameWidth: 90, actionId: null, held: null, heldKind: null };
        this.actors.set(player.id, actor);
      }
      if (player.sitting && player.sitting.startedAt !== actor.player.sitting?.startedAt) {
        const point = positionAt(player, now);
        actor.correction.x = actor.point.x - point.x; actor.correction.y = actor.point.y - point.y;
        if (player.id === this.options.selfId) { this.localMove = null; this.marker.visible = false; }
      }
      if (player.id !== this.options.selfId && player.move.startedAt !== actor.player.move.startedAt) {
        const point = positionAt(player, now);
        actor.correction.x = actor.point.x - point.x; actor.correction.y = actor.point.y - point.y;
      }
      if (player.lastCatch && player.lastCatch.id !== actor.player.lastCatch?.id) {
        const fish = describeFish(player.lastCatch.kind);
        this.burst(positionAt(player, now), new THREE.Color(fish.color).getHex(), 12, .8, 1.05);
        if (player.id === this.options.selfId) {
          this.tone(660, .07, .035);
          this.tone(990, .12, .03, .09);
        }
      }
      actor.player = player;
      actor.label.title = player.fishHeld && player.lastCatch
        ? `${player.nickname} · ${catchLabel(player.lastCatch)}` : `${player.nickname} · 우클릭 / Space로 행동`;
      if (player.fishHeld && player.lastCatch) {
        const fish = describeFish(player.lastCatch.kind);
        actor.fishLabel.children[0].textContent = `${fish.grade}등급 · ${fish.name}`;
        actor.fishLabel.children[1].textContent = fishLength(player.lastCatch.sizeCm);
      }
      if (player.insectHeld && player.lastInsect) {
        const insect = describeInsect(player.lastInsect.kind);
        actor.fishLabel.children[0].textContent = `${insect.grade}등급 · ${insect.name}`;
        actor.fishLabel.children[1].textContent = `${player.lastInsect.sizeCm} cm`;
      }
      actor.appearance = normalizeAppearance(player.appearance, player.color);
      const appearanceKey = JSON.stringify(actor.appearance);
      if (actor.appearanceKey !== appearanceKey) { actor.visual.appearance(actor.appearance); actor.appearanceKey = appearanceKey; }
      actor.label.style.setProperty("--person-color", player.color);
      actor.label.classList.toggle("mine", player.id === this.options.selfId);
      if (player.action && player.action.endsAt > now && this.lastAction.get(player.id) !== player.action.id) {
        this.lastAction.set(player.id, player.action.id);
        if (player.id !== this.options.selfId || !this.prediction || this.prediction.action.kind !== player.action.kind) this.actionFeedback(player.action.kind, positionAt(player, now));
      }
    }
    const foodIds = new Set(snapshot.foods.map((food) => food.id));
    for (const [id, food] of this.foods) if (!foodIds.has(id)) { this.scene.remove(food.group); this.foods.delete(id); }
    for (const food of snapshot.foods) {
      const existing = this.foods.get(food.id);
      const fresh = !existing || existing.createdAt !== food.createdAt;
      if (existing) { existing.point = food; existing.createdAt = food.createdAt; }
      else {
        const group = this.createFood(food.kind); group.userData.foodId = food.id; this.scene.add(group);
        this.foods.set(food.id, { group, point: food, createdAt: food.createdAt, phase: Math.random() * TAU });
      }
      if (fresh && now - food.createdAt < 2000) this.burst(food, 0xdab66b, food.droppedFrom ? 8 : 16, 0.8, food.droppedFrom ? 0.75 : 0.15);
    }
    const insectIds = new Set((snapshot.insects ?? []).map((insect) => insect.id));
    for (const [id, visual] of this.insects) if (!insectIds.has(id)) { visual.group.removeFromParent(); this.insects.delete(id); }
    for (const insect of snapshot.insects ?? []) {
      const existing = this.insects.get(insect.id);
      if (existing) { existing.insect = insect; continue; }
      const group = this.insectModels.create(insect.kind); group.userData.insectId = insect.id;
      const pick = new THREE.Mesh(this.geometry("insect-hit", () => new THREE.SphereGeometry(1, 8, 6)), this.material("insect-hit", () => new THREE.MeshBasicMaterial({ visible: false })));
      pick.position.y = .25; group.add(pick);
      const species = describeInsect(insect.kind);
      group.scale.setScalar(species.fieldScale * (.85 + .3 * (insect.sizeCm - species.minCm) / Math.max(1, species.maxCm - species.minCm))); this.scene.add(group);
      this.insects.set(insect.id, { group, insect, point: insectPositionAt(insect, now), facing: insect.seed });
    }
    const monsterIds = new Set((snapshot.monsters ?? []).map((monster) => monster.id));
    for (const [id, visual] of this.monsters) if (!monsterIds.has(id)) {
      this.burst(visual.point, 0xe7c98c, 24, 1.2);
      visual.label.remove(); this.monsterModels.release(visual.group); this.monsters.delete(id);
    }
    for (const monster of snapshot.monsters ?? []) {
      let visual = this.monsters.get(monster.id);
      if (!visual) {
        const group = this.monsterModels.create(monster.kind); group.userData.monsterId = monster.id; this.scene.add(group);
        const label = document.createElement("button"); label.type = "button"; label.className = "scene-monster-label"; label.dataset.sceneMonster = monster.id;
        const name = document.createElement("strong"), health = document.createElement("span"), track = document.createElement("span"), bar = document.createElement("i");
        name.textContent = `${describeMonster(monster.kind).grade} · ${describeMonster(monster.kind).name}`;
        health.className = "scene-monster-health"; track.className = "scene-monster-track"; track.setAttribute("aria-hidden", "true"); track.appendChild(bar);
        label.append(name, health, track); this.overlay.appendChild(label);
        label.addEventListener("keydown", (event) => {
          if (!["Enter", " ", "ContextMenu"].includes(event.key) || event.repeat || event.isComposing) return;
          event.preventDefault(); event.stopPropagation(); const rect = label.getBoundingClientRect();
          this.options.onContext({ kind: "monster", id: monster.id, x: rect.right, y: rect.bottom });
        });
        const materials = new Set<THREE.MeshStandardMaterial>();
        group.traverse((object) => { if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) materials.add(object.material); });
        visual = { monster, group, point: monsterPositionAt(monster, now), facing: .6, label, health, bar, materials: [...materials] };
        this.monsters.set(monster.id, visual);
      } else {
        if (monster.hp < visual.monster.hp) this.burst(monsterPositionAt(monster, now), 0xffdba8, 7, .5, describeMonster(monster.kind).scale * .45);
        visual.monster = monster;
      }
      visual.bar.style.transform = `scaleX(${monster.hp / monster.maxHp})`;
      visual.label.setAttribute("aria-label", `${describeMonster(monster.kind).name}, ${describeMonster(monster.kind).grade}등급, 체력 ${monster.hp}/${monster.maxHp}. 우클릭 또는 Space로 펀치`);
    }
    this.lastOverlay = 0;
  }

  move(point: LoungePoint) {
    const actor = this.actors.get(this.options.selfId);
    if (!actor) return;
    const now = this.options.getNow();
    this.localMove = seatedMove(actor.point, this.localMove ? null : actor.player.sitting, point, now);
    const to = this.localMove.to;
    this.marker.position.set(worldX(to.x), 0.025, worldZ(to.y)); this.markerAt = now; this.marker.visible = true;
    this.tone(330, 0.035, 0.025);
  }

  position() { const actor = this.actors.get(this.options.selfId); return actor ? { ...actor.point } : null; }
  facing() { return this.actors.get(this.options.selfId)?.facing ?? null; }
  rejectMove() { this.localMove = null; this.marker.visible = false; }

  predict(kind: LoungeActionKind, commandId: string, foodKind?: LoungeFoodKind, foodId?: string, peerId?: string) {
    const now = this.options.getNow();
    const duration = actionDuration(kind);
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
  stopEmote() { if (this.prediction && isLoungeEmote(this.prediction.action.kind)) this.prediction = null; }
  carry(kind: LoungeFoodKind | null, commandId: string) { this.heldPrediction = { kind, commandId }; this.tone(430, 0.045, 0.025); }

  say(text: string, commandId: string) {
    const self = this.actors.get(this.options.selfId)?.player;
    if (self) this.localMessages.set(commandId, { id: commandId, text, nickname: self.nickname, playerId: self.id, createdAt: this.options.getNow() });
    this.lastOverlay = 0;
  }
  finishSay(commandId: string) { this.localMessages.delete(commandId); this.lastOverlay = 0; }

  private drawActor(actor: LoungeSceneActor, index: number, now: number, delta: number) {
    const player = actor.player;
    const self = player.id === this.options.selfId;
    const serverBusy = Boolean(player.action && player.action.endsAt > now);
    const stunned = player.stunnedUntil > now;
    const predicted = self && this.prediction && this.prediction.action.endsAt > now ? this.prediction.action : null;
    const action = player.action && serverBusy ? (predicted?.kind === player.action.kind ? { ...player.action, startedAt: predicted.startedAt } : player.action) : predicted;
    const fishing = action?.kind === "fish" || action?.kind === "fishCatch";
    const peer = action?.peerId ? this.actors.get(action.peerId)?.player : undefined;
    const peerAction = peer?.action;
    const social = action?.kind === "handshake" || action?.kind === "hug" || action?.kind === "give";
    const paired = Boolean(social && action && peerAction?.kind === action.kind && peerAction.peerId === player.id
      && peerAction.startedAt === action.startedAt && peerAction.endsAt > now);
    const monsterPeer = action?.peerId ? this.monsters.get(action.peerId)?.monster : undefined;
    const peerPosition = peer ? positionAt(peer, now) : monsterPeer ? monsterPositionAt(monsterPeer, now) : null;
    if (self && this.localMove && (stunned || serverBusy)) this.localMove = null;
    const motion = self && this.localMove ? this.localMove : player.move;
    const position = predicted && !serverBusy && !stunned ? this.prediction!.point : positionAt({ move: motion }, now);
    if (paired) {
      actor.correction.x = 0;
      actor.correction.y = 0;
    } else {
      const decay = Math.exp(-(player.sitting ? 4000 / seatingRules.settleMs : stunned ? 40 : 28) * delta);
      actor.correction.x *= decay; actor.correction.y *= decay;
      if (!self || !predicted && !this.localMove) { position.x += actor.correction.x; position.y += actor.correction.y; }
    }
    const dx = position.x - actor.point.x;
    const dy = position.y - actor.point.y;
    const walking = motion.endsAt > now && !action && !stunned;
    const progress = action ? THREE.MathUtils.clamp((now - action.startedAt) / Math.max(1, action.endsAt - action.startedAt), 0, 1) : 0;
    const holdingFish = Boolean(player.fishHeld && player.lastCatch && !action && !stunned);
    const holdingInsect = Boolean(player.insectHeld && player.lastInsect && !action && !stunned);
    const sitting = !stunned && (!action || action.kind === "eat") && !(self && this.localMove) ? player.sitting : null;
    if (sitting) {
      actor.facing += Math.atan2(Math.sin(sitting.facing - actor.facing), Math.cos(sitting.facing - actor.facing)) * ease(18, delta);
    } else if (holdingFish || holdingInsect) {
      this.camera.getWorldDirection(this.viewDirection).negate();
      const desired = Math.atan2(this.viewDirection.x, this.viewDirection.z);
      actor.facing += Math.atan2(Math.sin(desired - actor.facing), Math.cos(desired - actor.facing)) * ease(24, delta);
    } else if (walking && Math.hypot(dx, dy) > 0.02) {
      const desired = Math.atan2(dx, dy);
      actor.facing += Math.atan2(Math.sin(desired - actor.facing), Math.cos(desired - actor.facing)) * ease(18, delta);
    } else if (fishing) {
      const desired = Math.atan2(lakeCenter.x - position.x, lakeCenter.y - position.y);
      actor.facing += Math.atan2(Math.sin(desired - actor.facing), Math.cos(desired - actor.facing)) * ease(20, delta);
    } else if (peerPosition) {
      const turn = paired && (action?.kind === "handshake" || action?.kind === "give")
        ? .6 * THREE.MathUtils.smoothstep(progress, 0, .23) * (1 - THREE.MathUtils.smoothstep(progress, .76, 1)) : 0;
      const desired = Math.atan2(peerPosition.x - position.x, peerPosition.y - position.y) + turn;
      actor.facing += Math.atan2(Math.sin(desired - actor.facing), Math.cos(desired - actor.facing)) * ease(22, delta);
    } else if (player.id === npcSettings.id && !action && !stunned) {
      const desired = Math.atan2(loungeWorld.width / 2 - position.x, loungeWorld.height / 2 - position.y);
      actor.facing += Math.atan2(Math.sin(desired - actor.facing), Math.cos(desired - actor.facing)) * ease(12, delta);
    }
    // Position is predicted locally and only constrained immediately by authoritative stun/action states.
    actor.point.x = position.x; actor.point.y = position.y;
    if (self && this.localMove && now >= this.localMove.endsAt && Math.hypot(positionAt(player, now).x - position.x, positionAt(player, now).y - position.y) < 4) this.localMove = null;
    const eating = action?.kind === "eat";
    const carried = self && this.heldPrediction ? this.heldPrediction.kind : player.inventory.find((food) => food.id === player.heldFoodId)?.kind;
    const gift = action?.kind === "give";
    const giftInHand = gift && ((action.giveRole === "receiver" && progress >= .5)
      || (action.giveRole === "giver" && progress < .5));
    const foodKind = gift ? giftInHand ? action?.foodKind : null : action?.foodKind ?? carried;
    const fish = player.fishHeld && (!action || paired) && !stunned ? player.lastCatch : undefined;
    const insect = !foodKind && !fish && player.insectHeld && (!action || action.kind === "collectInsect" && progress > .65) && !stunned ? player.lastInsect : undefined;
    const heldKind = fishing ? "rod" : foodKind ?? fish?.kind ?? insect?.kind;
    const visual = actor.visual;
    visual.group.position.set(worldX(position.x), .025, worldZ(position.y));
    visual.group.rotation.y = actor.facing;
    const speed = walking && !sitting ? Math.min(loungeWorld.speed * SCALE, Math.hypot(dx, dy) * SCALE / delta) : 0;
    const pairTarget = (paired || action?.kind === "punch") && peerPosition
      ? this.peerTarget.set(worldX(peerPosition.x), .025, worldZ(peerPosition.y)) : null;
    visual.pose({ now, delta, speed, stunned, reducedMotion: this.reducedMotion, action, peer: pairTarget, carried, carryingFish: Boolean(fish), carryingInsect: Boolean(insect), sitting });
    visual.grip(this.grip, paired && Boolean(carried || fish) && !giftInHand, holdingFish || Boolean(insect));
    this.root.makeRotationY(actor.facing); this.root.setPosition(worldX(position.x), .025, worldZ(position.y));
    this.dummy.position.set(worldX(position.x), .012, worldZ(position.y)); this.dummy.rotation.set(-Math.PI / 2, 0, 0); this.dummy.scale.set(.40, .29, 1); this.dummy.updateMatrix(); this.shadows.setMatrixAt(index, this.dummy.matrix);
    if (heldKind) {
      if (actor.heldKind !== heldKind) {
        actor.held?.removeFromParent();
        actor.held = fishing ? this.createRod() : foodKind ? this.createFood(foodKind) : insect ? this.insectModels.create(insect.kind) : this.createFish(fish!.kind);
        actor.held.matrixAutoUpdate = false;
        actor.heldKind = heldKind;
        this.scene.add(actor.held);
      }
      this.dummy.position.set(0, .005, fish && !foodKind ? fishDisplayOffset(fish.sizeCm) : .035);
      const rod = fishingMotion(action, now);
      const motionScale = this.reducedMotion ? .3 : 1;
      const rodPitch = (-1.85 * rod.windup + .2 * rod.release - 1.05 * rod.pull * (1 - .57 * rod.recovery)) * motionScale;
      const rodYaw = (-.13 * rod.windup - .28 * rod.pull) * motionScale;
      this.dummy.rotation.set(fishing ? rodPitch : .25, fishing ? rodYaw : insect ? Math.PI / 2 : fish && !foodKind ? .12 : 0, eating ? -.2 : 0);
      const scale = fishing ? 1 : eating ? Math.max(.05, 1 - progress * .85)
        : insect ? insectHeldScale(insect.sizeCm) : fish && !foodKind ? fishDisplayLength(fish.sizeCm) : .8;
      this.dummy.scale.setScalar(scale); this.dummy.updateMatrix(); actor.held!.matrix.multiplyMatrices(this.grip, this.dummy.matrix); actor.held!.matrixWorldNeedsUpdate = true;
      if (insect) this.insectModels.animate(actor.held!, insect.kind, now, this.reducedMotion, false);
      if (fishing && action) this.drawCast(actor, position, action, now);
      if (eating && Math.random() < delta * 12) this.burst(position, 0xe4bf7c, 2, 0.75, 1.27);
    } else if (actor.held) { this.scene.remove(actor.held); actor.held = null; actor.heldKind = null; }
    if (!fishing && actor.cast) {
      actor.cast.line.visible = false;
      actor.cast.bobber.visible = false;
      if (actor.cast.fish) actor.cast.fish.visible = false;
    }
    actor.fishLabel.hidden = !(holdingFish && fish || holdingInsect && insect);
    if ((holdingFish && fish || holdingInsect && insect) && actor.held) {
      this.catchPosition.set(0, -.13, .25).applyMatrix4(actor.held.matrix).project(this.camera);
      actor.fishLabel.style.transform = `translate3d(${(this.catchPosition.x * .5 + .5) * this.width}px,${(-this.catchPosition.y * .5 + .5) * this.height}px,0) translate(-50%,0)`;
    }
    visual.label(actor.head); actor.head.project(this.camera);
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
      visual.offset.y = bubble.y + bubble.height - (-actor.head.y * 0.5 + 0.5) * this.height;
      visual.element.style.width = `${bubble.width}px`;
      visual.element.style.zIndex = String(bubble.zIndex);
      visual.element.style.setProperty("--speech-tail-x", `${Math.max(12, Math.min(bubble.width - 12, bubble.anchorX - bubble.x))}px`);
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
    if (isLoungeEmote(kind)) {
      if (kind === "dance") { this.burst(point, 0x82bca0, 8, 0.6, 0.8); this.tone(520, 0.06, 0.025); this.tone(650, 0.08, 0.02, 0.09); }
      else if (kind === "laugh") { this.tone(580, 0.045, 0.02); this.tone(700, 0.06, 0.018, 0.09); }
      else this.tone(360, 0.045, 0.018);
      return;
    }
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
    if (this.disposed || this.lostContext || document.hidden || !this.inViewport || !this.state) return;
    const now = this.options.getNow();
    const previewActor = this.options.preview ? this.actors.get(this.options.selfId) : null;
    const turning = previewActor && Math.abs(previewActor.facing - this.previewFacing) > 0.001;
    const npc = this.actors.get(npcSettings.id)?.player;
    const ambientMoving = Boolean(npc && npc.move.endsAt > now) || [...this.monsters.values()].some(({ monster }) => monster.move.endsAt > now);
    const active = Boolean(npc && (npc.stunnedUntil > now || npc.action && npc.action.endsAt > now)) || [...this.monsters.values()].some(({ monster }) => monster.attack || monster.targetId || now - monster.lastHitAt < 200) || [...this.insects.values()].some(({ insect }) => insect.kind === "bee" || insect.kind === "butterfly" || insect.move.endsAt > now) || turning || this.localMove || this.prediction || this.particles.length || this.state.players.some((player) => player.move.endsAt > now || player.stunnedUntil > now || (player.action && player.action.endsAt > now) || player.sitting && now - player.sitting.startedAt < 400);
    if (at - this.lastFrame < 1000 / (active ? 60 : ambientMoving ? 30 : 24) - 1) return;
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
    this.shadows.count = this.actorIds.length;
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
    this.shadows.instanceMatrix.needsUpdate = true;
    for (const [id, food] of this.foods) {
      food.group.visible = this.prediction?.hiddenFoodId !== id;
      const age = Math.max(0, (now - food.createdAt) / 1000);
      const origin = food.point.droppedFrom;
      const duration = Math.max(1, loungeRules.foodDropMs) / 1000;
      const fall = this.reducedMotion ? 1 : Math.min(1, age / duration);
      const x = origin ? origin.x + (food.point.x - origin.x) * fall : food.point.x;
      const y = origin ? origin.y + (food.point.y - origin.y) * fall : food.point.y;
      const afterLanding = Math.max(0, age - duration);
      const flight = origin ? (1 - fall) * 0.7 + Math.sin(fall * Math.PI) * 0.22 : Math.max(0, 1 - age * 2) * 0.8;
      const bounce = origin && fall === 1 ? Math.max(0, 1 - afterLanding / 0.28) * Math.abs(Math.sin(afterLanding * Math.PI / 0.14)) * 0.1 : 0;
      food.group.position.set(worldX(x), 0.13 + (this.reducedMotion ? 0 : Math.sin(this.elapsed * 2 + food.phase) * 0.035 + flight + bounce), worldZ(y));
      food.group.rotation.y = 0.58 + (this.reducedMotion ? 0 : Math.sin(this.elapsed + food.phase) * 0.15 + (origin ? fall * TAU : 0));
      food.group.rotation.z = origin && !this.reducedMotion ? Math.sin(fall * Math.PI) * 1.2 : 0;
    }
    for (const visual of this.insects.values()) {
      const { insect, group } = visual;
      group.visible = now < insect.expiresAt;
      if (!group.visible) continue;
      const point = insectPositionAt(insect, now);
      const moving = insect.move.endsAt > now;
      if (moving) {
        const desired = Math.atan2(insect.move.to.x - insect.move.from.x, insect.move.to.y - insect.move.from.y);
        visual.facing += Math.atan2(Math.sin(desired - visual.facing), Math.cos(desired - visual.facing)) * ease(insect.kind === "butterfly" ? 32 : 14, delta);
      }
      visual.point = point; group.position.set(worldX(point.x), insectHeight(insect, now, this.reducedMotion), worldZ(point.y)); group.rotation.y = visual.facing;
      this.insectModels.animate(group, insect.kind, now + insect.seed * 100, this.reducedMotion, moving);
    }
    for (const visual of this.monsters.values()) {
      const { monster, group } = visual;
      const point = monsterPositionAt(monster, now);
      const moving = monster.move.endsAt > now && monster.move.startedAt <= now;
      const attack = monster.attack;
      const winding = attack ? Math.max(0, Math.min(1, (now - attack.startedAt) / monsterRules.windupMs)) * Number(now < attack.startedAt + monsterRules.windupMs) : 0;
      const dx = attack ? attack.to.x - attack.from.x : monster.move.to.x - monster.move.from.x, dy = attack ? attack.to.y - attack.from.y : monster.move.to.y - monster.move.from.y;
      if (Math.hypot(dx, dy) > 1) {
        const desired = Math.atan2(dx, dy);
        visual.facing += Math.atan2(Math.sin(desired - visual.facing), Math.cos(desired - visual.facing)) * ease(attack ? 24 : 12, delta);
      }
      visual.point = point;
      const floating = monster.kind === "easternDragon" && !this.reducedMotion ? Math.sin(now / 600) * .055 : 0;
      group.position.set(worldX(point.x), .025 + floating, worldZ(point.y)); group.rotation.y = visual.facing;
      if (!this.reducedMotion && winding) { group.position.x -= Math.sin(visual.facing) * winding * .12; group.position.z -= Math.cos(visual.facing) * winding * .12; }
      this.monsterModels.animate(group, monster.kind, now, moving, winding, this.reducedMotion);
      const flash = Math.max(0, 1 - (now - monster.lastHitAt) / 160);
      for (const material of visual.materials) { material.emissive.setHex(0xffa95c); material.emissiveIntensity = flash * .65; }
      visual.label.classList.toggle("winding", winding > 0);
      const status = `${monster.hp} / ${monster.maxHp}${winding ? " · 돌진 준비" : ""}`;
      if (visual.health.textContent !== status) visual.health.textContent = status;
      this.project.set(group.position.x, group.position.y + Number(group.userData.height) + .15, group.position.z).project(this.camera);
      const x = (this.project.x * .5 + .5) * this.width, y = (-this.project.y * .5 + .5) * this.height;
      visual.label.hidden = this.project.z < -1 || this.project.z > 1 || x < -80 || x > this.width + 80 || y < -60 || y > this.height + 60;
      visual.label.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;
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
      bubble.element.style.transform = `translate3d(${(actor.head.x * 0.5 + 0.5) * this.width + bubble.offset.x}px,${(-actor.head.y * 0.5 + 0.5) * this.height + bubble.offset.y}px,0) translateY(-100%)`;
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

  interact() {
    if (this.disposed || this.options.preview || !this.inViewport) return;
    const self = this.actors.get(this.options.selfId);
    if (!self) return;
    this.unlockAudio(); this.cancelHold();
    if (this.contextPointer) {
      const { x, y } = this.contextPointer;
      const element = document.elementFromPoint(x, y);
      if (element && this.host.contains(element)) {
        if (element.closest(".scene-speech")) return;
        const picked = this.pick({ clientX: x, clientY: y, target: element });
        if (picked) { this.options.onContext({ ...picked, x, y }); return; }
      }
    }
    let chosen: LoungeScenePick = { kind: "player", id: self.player.id };
    let point = self.point;
    let nearest = loungeRules.socialRange;
    for (const actor of this.actors.values()) {
      if (actor === self) continue;
      const gap = distance(self.point, actor.point);
      if (gap <= nearest) { nearest = gap; chosen = { kind: actor.player.id === npcSettings.id ? "npc" : "player", id: actor.player.id }; point = actor.point; }
    }
    for (const food of this.foods.values()) {
      if (!food.group.visible) continue;
      const gap = distance(self.point, food.point);
      if (gap <= loungeRules.interactionRange && gap < nearest) {
        nearest = gap; chosen = { kind: "food", id: food.point.id }; point = food.point;
      }
    }
    for (const visual of this.insects.values()) {
      if (!visual.group.visible || visual.insect.expiresAt <= this.options.getNow()) continue;
      const gap = distance(self.point, visual.point);
      if (gap <= insectRules.captureRange && gap < nearest) { nearest = gap; chosen = { kind: "insect", id: visual.insect.id }; point = visual.point; }
    }
    const shoreGap = distance(self.point, lakeCenter) - lake.radius * 100;
    for (const [kind, fixtures] of [["log", loungeLogs], ["bench", loungeBenches]] as const) for (const fixture of fixtures) {
      const center = { x: loungeWorld.width / 2 + fixture.x * 100, y: loungeWorld.height / 2 + fixture.z * 100 };
      const gap = distance(self.point, center);
      if (gap <= seatingRules.interactRange && gap < nearest) { nearest = gap; chosen = { kind, id: fixture.id }; point = center; }
    }
    for (const visual of this.monsters.values()) {
      const gap = distance(self.point, visual.point);
      if (gap <= monsterPunchRange(visual.monster) && gap - describeMonster(visual.monster.kind).radius < nearest) {
        nearest = Math.max(0, gap - describeMonster(visual.monster.kind).radius); chosen = { kind: "monster", id: visual.monster.id }; point = visual.point;
      }
    }
    if (canFishFrom(self.point) && shoreGap < nearest) {
      chosen = { kind: "lake", id: "lake" };
      const radius = lake.radius * 100 / distance(self.point, lakeCenter);
      point = { x: lakeCenter.x + (self.point.x - lakeCenter.x) * radius, y: lakeCenter.y + (self.point.y - lakeCenter.y) * radius };
    }
    const head = chosen.kind === "player" || chosen.kind === "npc" ? this.actors.get(chosen.id)?.head : null;
    if (head) this.project.copy(head);
    else this.project.set(worldX(point.x), .2, worldZ(point.y)).project(this.camera);
    const rect = this.host.getBoundingClientRect();
    this.options.onContext({ ...chosen, x: rect.left + (this.project.x * .5 + .5) * this.width, y: rect.top + (-this.project.y * .5 + .5) * this.height });
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
  private pickLabel(element: Element | null): LoungeScenePick | null {
    const label = element?.closest<HTMLElement>("[data-scene-player],[data-scene-npc],[data-scene-monster]");
    if (!label || label.hidden || !this.overlay.contains(label)) return null;
    if (label.dataset.scenePlayer) return { kind: "player", id: label.dataset.scenePlayer };
    if (label.dataset.sceneNpc) return { kind: "npc", id: label.dataset.sceneNpc };
    if (label.dataset.sceneMonster) return { kind: "monster", id: label.dataset.sceneMonster };
    return null;
  }
  private pick(event: { clientX: number; clientY: number; target: EventTarget | null }, allowGround = false): LoungeScenePick | null {
    const direct = this.pickLabel(event.target instanceof Element ? event.target : null);
    let own: LoungeScenePick | null = null;
    if (direct) {
      if (direct.kind !== "player" || direct.id !== this.options.selfId) return direct;
      own = direct;
      for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
        const label = this.pickLabel(element);
        if (label && (label.kind !== "player" || label.id !== this.options.selfId)) return label;
      }
    }
    this.ray(event);
    const foodObjects = [...this.foods.values()].filter((food) => food.group.visible).map((food) => food.group);
    const insectObjects = [...this.insects.values()].filter((visual) => visual.group.visible && visual.insect.expiresAt > this.options.getNow()).map((visual) => visual.group);
    const surroundings: THREE.Object3D[] = this.camp ? [...this.camp.logs, ...this.camp.benches, this.camp.lake] : [];
    const hits = this.raycaster.intersectObjects([...this.pickables, ...foodObjects, ...insectObjects, ...[...this.monsters.values()].map((visual) => visual.group), ...surroundings], true);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (object.userData.playerId) {
          const id = String(object.userData.playerId);
          if (id === this.options.selfId) { own = { kind: "player", id }; break; }
          return { kind: "player", id };
        }
        if (object.userData.npcId) return { kind: "npc", id: object.userData.npcId };
        if (object.userData.foodId) return { kind: "food", id: object.userData.foodId };
        if (object.userData.insectId) return { kind: "insect", id: object.userData.insectId };
        if (object.userData.monsterId) return { kind: "monster", id: object.userData.monsterId };
        if (object.userData.logId) return { kind: "log", id: object.userData.logId };
        if (object.userData.benchId) return { kind: "bench", id: object.userData.benchId };
        if (object.userData.lakeId) return { kind: "lake", id: object.userData.lakeId };
        object = object.parent;
      }
    }
    if (own) return own;
    if (allowGround) {
      const hit = this.raycaster.intersectObject(this.floor)[0];
      if (hit) {
        const raw = { x: hit.point.x / SCALE + loungeWorld.width / 2, y: hit.point.z / SCALE + loungeWorld.height / 2 };
        const point = clampPosition(raw);
        if (distance(raw, point) < 1 && groundSeatAllowed(point)) return { kind: "ground", id: "ground", point };
      }
    }
    return null;
  }
  private pointerDown = (event: PointerEvent) => {
    if (this.options.preview) return;
    this.contextPointer = { x: event.clientX, y: event.clientY };
    if (event.target instanceof Element && event.target.closest(".scene-speech")) { this.down = null; return; }
    if (event.button !== 0) return;
    this.unlockAudio(); this.down = { x: event.clientX, y: event.clientY, at: performance.now() }; this.suppressClick = false;
    if (event.pointerType === "touch") {
      const target = this.pick(event, true);
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
    this.contextPointer = { x: event.clientX, y: event.clientY };
    if (this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 8) this.cancelHold();
    if (performance.now() - this.hoverAt < 70) return; this.hoverAt = performance.now();
    const target = this.pick(event);
    const person = target?.kind === "player" || target?.kind === "npc" ? this.actors.get(target.id)?.player : null;
    const label = person ? person.nickname + (person.fishHeld && person.lastCatch ? ` · ${catchLabel(person.lastCatch)}` : "")
      : target?.kind === "food" ? foodName(this.state?.foods.find((food) => food.id === target.id)?.kind ?? "")
      : target?.kind === "monster" ? describeMonster(this.monsters.get(target.id)!.monster.kind).name : target?.kind === "insect" ? describeInsect(this.insects.get(target.id)!.insect.kind).name : target?.kind === "log" ? "통나무" : target?.kind === "bench" ? "테이블 의자" : target?.kind === "lake" ? "호수" : "";
    if (label !== this.hover) { this.hover = label; this.host.style.cursor = label ? "context-menu" : "crosshair"; this.options.onHover(label); }
  };
  private pointerLeave = () => {
    this.contextPointer = null;
    if (this.hover) { this.hover = ""; this.host.style.cursor = "crosshair"; this.options.onHover(""); }
  };
  private contextMenu = (event: MouseEvent) => {
    if (this.options.preview) { event.preventDefault(); return; }
    if (event.target instanceof Element && event.target.closest(".scene-speech")) return;
    event.preventDefault(); this.cancelHold(); this.unlockAudio(); const target = this.pick(event, true);
    if (target) this.options.onContext({ ...target, x: event.clientX, y: event.clientY });
  };
  private cancelHold = () => { if (this.hold) clearTimeout(this.hold); this.hold = null; };
  private wheel = (event: WheelEvent) => {
    if (this.options.preview) return;
    if (event.target instanceof Element && event.target.closest(".scene-speech")) return;
    event.preventDefault(); this.zoom(event.deltaY > 0 ? -0.07 : 0.07);
  };
  private visibility = () => { this.renderer.setAnimationLoop(this.disposed || this.lostContext || document.hidden || !this.inViewport ? null : this.frame); this.lastFrame = 0; };
  private contextLost = (event: Event) => { event.preventDefault(); this.lostContext = true; this.renderer.setAnimationLoop(null); this.options.onError("3D 화면을 복구하고 있어요. 잠시만 기다려 주세요."); };
  private contextRestored = () => {
    if (this.disposed) return;
    this.lostContext = false; this.lastOverlay = 0;
    this.options.onError(""); this.visibility();
  };

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.renderer.setAnimationLoop(null); this.observer.disconnect(); this.themeObserver.disconnect(); this.cancelHold();
    this.host.removeEventListener("pointerdown", this.pointerDown); this.host.removeEventListener("pointerup", this.pointerUp); this.host.removeEventListener("pointermove", this.pointerMove);
    this.host.removeEventListener("pointerleave", this.pointerLeave);
    this.host.removeEventListener("pointercancel", this.cancelHold); this.host.removeEventListener("contextmenu", this.contextMenu); this.host.removeEventListener("wheel", this.wheel);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost); document.removeEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.contextRestored);
    for (const actor of this.actors.values()) {
      actor.visual.dispose();
      this.disposeCast(actor);
    }
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const visual of this.monsters.values()) this.monsterModels.release(visual.group);
    this.monsterModels.dispose(); this.monsters.clear();
    this.fishModels.dispose(); this.insectModels.dispose();
    this.camp?.dispose();
    this.renderer.renderLists.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.overlay.remove();
    if (this.audio) void this.audio.close().catch(() => {});
    this.actors.clear(); this.foods.clear(); this.insects.clear(); this.bubbles.clear(); this.particles.length = 0;
  }
}

export async function createLoungeScene(host: HTMLDivElement, options: LoungeSceneOptions): Promise<LoungeSceneController> {
  const asset = await loadLoungeCharacters();
  if (options.signal?.aborted || !host.isConnected) throw new DOMException("Scene was closed", "AbortError");
  return new LoungeScene(host, options, asset);
}
