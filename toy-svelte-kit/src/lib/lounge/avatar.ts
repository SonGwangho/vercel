import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { base } from "$app/paths";
import model from "../assets/data/lounge/character-model.json";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { LoungeAppearance } from "../types/LoungeAppearance";
import type { LoungeBodyUniforms, LoungeCharacterPose, LoungeCharacterVisual } from "../types/LoungeCharacter";

let source: Promise<GLTF> | null = null;
export function loadLoungeCharacters(): Promise<GLTF> {
  if (!source) source = new GLTFLoader().loadAsync(`${base}${model.url}`).catch((error) => { source = null; throw error; });
  return source;
}

export class LoungeCharacter implements LoungeCharacterVisual {
  readonly group: THREE.Group;
  private parts = new Map<string, THREE.SkinnedMesh>();
  private mixer: THREE.AnimationMixer;
  private clips: Map<string, THREE.AnimationClip>;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = "";
  private head: THREE.Bone;
  private torso: THREE.Bone;
  private right: THREE.Bone;
  private left: THREE.Bone;
  private root: THREE.Bone;
  private skeleton: THREE.Skeleton;
  private top: THREE.MeshStandardMaterial;
  private body: THREE.MeshStandardMaterial;
  private skirt: THREE.MeshStandardMaterial;
  private hair: THREE.MeshStandardMaterial;
  private offset = new THREE.Matrix4().makeTranslation(...model.gripOffset as [number, number, number]);
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3(1, 1, 1);
  private direction = new THREE.Vector3();
  private rightAxis = new THREE.Vector3(-1, 0, 0);
  private leftAxis = new THREE.Vector3(1, 0, 0);
  private basePositions: THREE.Vector3[];
  private baseRotations: THREE.Quaternion[];
  private labelOffset = new THREE.Vector3(...model.labelOffset as [number, number, number]);
  private labelOffsets = new Map<string, THREE.Vector3>();
  private uniforms: LoungeBodyUniforms = {
    uLoungeTop: { value: new THREE.Color() }, uLoungePants: { value: new THREE.Color() }, uLoungeSkirt: { value: new THREE.Color() }, uLoungeSkin: { value: new THREE.Color("#efc49c") },
    uLoungeSleeve: { value: 1 }, uLoungeBottom: { value: 0 }, uLoungeGesture: { value: 0 }
  };

  constructor(asset: GLTF, appearance: LoungeAppearance) {
    this.group = clone(asset.scene) as THREE.Group;
    this.group.scale.setScalar(model.scale);
    this.group.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      this.parts.set(object.userData.loungePart ?? object.name, object);
      object.frustumCulled = false;
    });
    this.skeleton = this.parts.get("head_skin")!.skeleton;
    for (const part of this.parts.values()) { if (part.skeleton !== this.skeleton) part.skeleton.dispose(); part.skeleton = this.skeleton; }
    this.basePositions = this.skeleton.bones.map((bone) => bone.position.clone());
    this.baseRotations = this.skeleton.bones.map((bone) => bone.quaternion.clone());
    const bone = (name: string) => this.skeleton.getBoneByName(name)!;
    this.head = bone("head"); this.torso = bone("torso"); this.right = bone("arm-right"); this.left = bone("arm-left"); this.root = bone("root");
    this.group.updateMatrixWorld(true);
    for (const [name, part] of this.parts) {
      if (!name.startsWith("hair_")) continue;
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      const anchor = new THREE.Vector3(0, part.geometry.boundingBox!.max.y + .025, 0);
      part.localToWorld(anchor); this.head.worldToLocal(anchor);
      this.labelOffsets.set(name, anchor);
    }
    const fabric = this.parts.get("body_base")!.material as THREE.MeshStandardMaterial;
    this.top = fabric.clone(); this.body = fabric.clone(); this.skirt = fabric.clone();
    this.parts.get("body_base")!.material = this.body;
    this.body.customProgramCacheKey = () => "lounge-body-v2";
    this.body.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute float _lounge_zone;
varying float vLoungeZone;
varying vec3 vLoungeRest;`).replace("#include <begin_vertex>", `#include <begin_vertex>
vLoungeZone = _lounge_zone;
vLoungeRest = position;`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying float vLoungeZone;
varying vec3 vLoungeRest;
uniform vec3 uLoungeTop;
uniform vec3 uLoungePants;
uniform vec3 uLoungeSkirt;
uniform vec3 uLoungeSkin;
uniform float uLoungeSleeve;
uniform float uLoungeBottom;
uniform float uLoungeGesture;`).replace("#include <color_fragment>", `#include <color_fragment>
float loungeZone = floor(vLoungeZone + 0.5);
vec3 loungeTint = vec3(1.0);
if (loungeZone == 1.0) loungeTint = uLoungeTop;
else if (loungeZone == 2.0) loungeTint = uLoungeSleeve > 1.5 ? uLoungeSkin : uLoungeTop;
else if (loungeZone == 3.0) {
  if (uLoungeGesture > 0.5 && vLoungeRest.x < -0.338) discard;
  loungeTint = uLoungeSleeve > 0.5 && uLoungeSleeve < 1.5 && abs(vLoungeRest.x) < 0.338 ? uLoungeTop : uLoungeSkin;
} else if (loungeZone == 4.0) loungeTint = uLoungeBottom < 1.5 ? uLoungePants : uLoungeSkin;
else if (loungeZone == 5.0) loungeTint = uLoungeBottom < 0.5 ? uLoungePants : uLoungeSkin;
else if (loungeZone == 6.0) loungeTint = uLoungeBottom < 1.5 ? uLoungePants : uLoungeSkirt;
else if (loungeZone == 7.0) loungeTint = uLoungeSkin;
diffuseColor.rgb *= loungeTint;`);
    };
    this.hair = (this.parts.get("hair_short")!.material as THREE.MeshStandardMaterial).clone();
    for (const [name, part] of this.parts) {
      if (name.startsWith("hair_")) part.material = this.hair;
      else if (name === "hoodie_hood") part.material = this.top;
      else if (name.startsWith("skirt_")) part.material = this.skirt;
    }
    this.mixer = new THREE.AnimationMixer(this.group);
    this.clips = new Map(asset.animations.map((clip) => [clip.name, clip]));
    this.appearance(appearance);
  }

  private show(name: string, visible: boolean) { const part = this.parts.get(name); if (part) part.visible = visible; }

  appearance(value: LoungeAppearance) {
    this.top.color.set(value.topColor); this.skirt.color.set(value.skirtColor); this.hair.color.set(value.hairColor);
    this.uniforms.uLoungeTop.value.set(value.topColor); this.uniforms.uLoungePants.value.set(value.pantsColor); this.uniforms.uLoungeSkirt.value.set(value.skirtColor);
    for (const [name, part] of this.parts) if (name.startsWith("hair_")) part.visible = name === `hair_${value.hairStyle}`;
    const anchor = this.labelOffsets.get(`hair_${value.hairStyle}`);
    if (anchor) this.labelOffset.copy(anchor);
    const tank = value.topStyle === "sleeveless";
    const long = value.topStyle !== "shortSleeve" && !tank;
    this.uniforms.uLoungeSleeve.value = tank ? 2 : long ? 1 : 0;
    this.uniforms.uLoungeBottom.value = value.bottomStyle === "longPants" ? 0 : value.bottomStyle === "shortPants" ? 1 : 2;
    this.show("shirt_collar", value.topStyle === "shirt");
    this.show("hoodie_hood", value.topStyle === "hoodie"); this.show("hoodie_strings", value.topStyle === "hoodie");
    this.show("skirt_long", value.bottomStyle === "longSkirt"); this.show("skirt_short", value.bottomStyle === "shortSkirt");
  }

  private arm(side: "left" | "right", x: number, y: number, z: number) {
    this.direction.set(x, y, z).normalize();
    (side === "left" ? this.left : this.right).quaternion.setFromUnitVectors(side === "left" ? this.leftAxis : this.rightAxis, this.direction);
  }

  pose(state: LoungeCharacterPose) {
    for (let n = 0; n < this.skeleton.bones.length; n += 1) {
      this.skeleton.bones[n].position.copy(this.basePositions[n]);
      this.skeleton.bones[n].quaternion.copy(this.baseRotations[n]);
    }
    const { now, action, walking, reducedMotion, stunned, carried } = state;
    const kind = action?.kind;
    const progress = action ? Math.max(0, Math.min(1, (now - action.startedAt) / Math.max(1, action.endsAt - action.startedAt))) : 0;
    const elapsed = action ? Math.max(0, now - action.startedAt) / 1000 : Math.max(0, now - (walking ? state.movingSince : state.joinedAt)) / 1000;
    const amount = action ? Math.max(0, Math.min(1, elapsed / .15, (action.endsAt - now) / 150)) : 0;
    const beat = reducedMotion ? 0 : Math.sin(elapsed * Math.PI * 3.6);
    const clipName = stunned ? "crouch" : kind === "punch" ? "attack-melee-right" : kind === "pickup" ? "pick-up" : kind === "handshake" || kind === "give" ? "interact-right" : walking ? "walk" : carried && !action ? "holding-right" : "idle";
    const clip = this.clips.get(clipName)!;
    let playing = this.actions.get(clipName);
    if (!playing) { playing = this.mixer.clipAction(clip); this.actions.set(clipName, playing); }
    if (this.current !== clipName) { this.mixer.stopAllAction(); playing.reset().play(); this.current = clipName; }
    playing.time = stunned ? clip.duration * .55 : action && ["punch", "pickup", "handshake", "give"].includes(kind!) ? Math.min(clip.duration - .0001, progress * clip.duration) : reducedMotion && !walking ? 0 : elapsed % Math.max(.001, clip.duration);
    this.mixer.update(0);
    for (let n = 0; n < this.skeleton.bones.length; n += 1) {
      this.basePositions[n].copy(this.skeleton.bones[n].position);
      this.baseRotations[n].copy(this.skeleton.bones[n].quaternion);
    }
    this.root.position.x = 0; this.root.position.z = 0;
    const chewing = kind === "eat" && (reducedMotion || Math.sin(elapsed * 14) > 0);
    this.show("face_default", kind !== "laugh" && kind !== "tongueOut" && !chewing);
    this.show("face_laugh", kind === "laugh" || chewing); this.show("face_tease", kind === "tongueOut");
    this.show("hand_gesture", kind === "middleFinger"); this.uniforms.uLoungeGesture.value = kind === "middleFinger" ? 1 : 0;
    if (kind === "eat") {
      this.arm("right", .3, .5, .8);
      this.head.rotation.x += reducedMotion ? -.04 : Math.sin(elapsed * 14) * .035;
    } else if (kind === "hug") {
      this.arm("left", .45, -.1, .9); this.arm("right", -.45, -.1, .9);
    } else if (kind === "middleFinger") {
      this.arm("right", -.3, .88, .2); this.head.rotation.z -= .04 * amount;
    } else if (kind === "scratchHead") {
      this.arm("left", .12, .98, .06 + beat * .05); this.head.rotation.z += .1 * amount;
    } else if (kind === "dance") {
      this.arm("left", .5, .2 + beat * .65, .6); this.arm("right", -.5, .2 - beat * .65, .6);
      this.torso.rotation.y += beat * .22 * amount; this.torso.rotation.z += beat * .07 * amount;
      if (!reducedMotion) { this.root.position.y += Math.abs(beat) * .015 * amount; this.skeleton.getBoneByName("leg-left")!.rotation.x += beat * .22; this.skeleton.getBoneByName("leg-right")!.rotation.x -= beat * .22; }
    } else if (kind === "laugh") {
      this.arm("left", .3, -.65, .6); this.arm("right", -.3, -.65, .6);
      this.head.rotation.x -= .12 * amount; this.torso.rotation.x -= .05 * amount;
      if (!reducedMotion) this.root.position.y += Math.abs(beat) * .008 * amount;
    } else if (kind === "tongueOut") this.head.rotation.z -= .14 * amount;
    else if (walking && carried) this.arm("right", -.2, -.25, .95);
    this.group.updateMatrixWorld(true);
  }

  grip(matrix: THREE.Matrix4) {
    matrix.multiplyMatrices(this.right.matrixWorld, this.offset);
    matrix.decompose(this.position, this.rotation, this.scale);
    this.scale.set(1, 1, 1); matrix.compose(this.position, this.rotation, this.scale);
  }
  label(point: THREE.Vector3) { point.copy(this.labelOffset).applyMatrix4(this.head.matrixWorld); }
  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.group); this.skeleton.dispose();
    this.top.dispose(); this.body.dispose(); this.skirt.dispose(); this.hair.dispose(); this.group.removeFromParent();
  }
}
