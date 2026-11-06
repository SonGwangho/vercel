import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { base } from "$app/paths";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { LoungeAppearance } from "../types/LoungeAppearance";
import type { LoungeAction } from "../types/Lounge";
import type { LoungeCharacterPose, LoungeCharacterVisual, LoungeChibiJoint, LoungeChibiLimb } from "../types/LoungeCharacter";
import { ChibiWardrobe } from "./chibi-wardrobe";
import { fishingMotion } from "./fishing";
import { findSeat, seatingRules } from "./seating";
import type { LoungeSitting } from "../types/LoungeSeating";
import model from "../assets/data/lounge/character-model.json";

const MODEL_SCALE = model.scale;
const PALM_LENGTH = 3.7;
const TAU = Math.PI * 2;
const smooth = THREE.MathUtils.smoothstep;
const kneePole = new THREE.Vector3(0, 0, 1);
const lyingBoundsCache = new WeakMap<THREE.BufferGeometry, Map<LoungeAppearance["hairStyle"], THREE.Box3>>();

let source: Promise<GLTF> | null = null;
export function loadLoungeCharacters(): Promise<GLTF> {
  source ??= new GLTFLoader().loadAsync(base + model.url).catch((error) => {
    source = null;
    throw error;
  });
  return source;
}

export class LoungeCharacter implements LoungeCharacterVisual {
  readonly group = new THREE.Group();
  private rig: THREE.Group;
  private bodyRoot = new THREE.Group();
  private lieWeight = 0;
  private lyingBounds = new THREE.Box3();
  private lyingHeadLift = .25;
  private joints = new Map<string, LoungeChibiJoint>();
  private skins = new Set<THREE.Skeleton>();
  private hips: THREE.Bone;
  private hipsRest: THREE.Vector3;
  private head: THREE.Bone;
  private headBind: THREE.Matrix4;
  private belly: THREE.Bone;
  private bellyBind: THREE.Matrix4;
  private poseSpace = new THREE.Matrix4();
  private legs: LoungeChibiLimb[];
  private arms: LoungeChibiLimb[];
  private wardrobe: ChibiWardrobe;
  private armPoles = [new THREE.Vector3(-.65, -1, -.2), new THREE.Vector3(.65, -1, -.2)];
  private pace = 0;
  private fishHold = 0;
  private otherPalm = new THREE.Vector3();
  private phase = 0;
  private lastAction: LoungeAction | null = null;
  private release = 0;
  private rigRotation = new THREE.Quaternion();
  private parentRotation = new THREE.Quaternion();
  private turn = new THREE.Quaternion();
  private endRotation = new THREE.Quaternion();
  private restingUpper = new THREE.Quaternion();
  private restingLower = new THREE.Quaternion();
  private restingHand = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private aimFrom = new THREE.Vector3();
  private aimTo = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private upperDirection = new THREE.Vector3();
  private lowerDirection = new THREE.Vector3();
  private palmDirection = new THREE.Vector3();
  private gestureDirection = new THREE.Vector3();
  private target = new THREE.Vector3();
  private reach = new THREE.Vector3();
  private palm = new THREE.Vector3();
  private midpoint = new THREE.Vector3();
  private along = new THREE.Vector3();
  private sitWeight = 0;
  private seatPose: LoungeSitting | null = null;
  private seatedPole = new THREE.Vector3();

  constructor(asset: GLTF, appearance: LoungeAppearance) {
    this.rig = clone(asset.scene) as THREE.Group;
    this.rig.scale.setScalar(MODEL_SCALE);
    this.bodyRoot.add(this.rig);
    this.group.add(this.bodyRoot);
    this.group.updateMatrixWorld(true);
    let body: THREE.SkinnedMesh | undefined;
    this.rig.traverse((object) => {
      if (object instanceof THREE.Bone) {
        const parentRotation = object.parent!.getWorldQuaternion(new THREE.Quaternion());
        this.joints.set(object.name, {
          bone: object,
          rotation: object.quaternion.clone(),
          parentRotation,
          inverseParentRotation: parentRotation.clone().invert()
        });
      }
      if (object instanceof THREE.SkinnedMesh) {
        this.skins.add(object.skeleton);
        object.frustumCulled = false;
        if (!body || object.skeleton.bones.length > body.skeleton.bones.length) body = object;
      }
    });
    this.hips = this.bone("Hips_01");
    this.hipsRest = this.hips.position.clone();
    this.head = this.bone("Head_06");
    this.headBind = this.head.matrixWorld.clone().invert().multiply(this.rig.matrixWorld);
    this.belly = this.bone("Spine1_03");
    this.bellyBind = this.belly.matrixWorld.clone().invert().multiply(this.rig.matrixWorld);
    this.arms = [
      this.limb("RightArm_09", "RightForeArm_010", "RightHand_011", -1),
      this.limb("Left_Arm_017", "Left_ForeArm_018", "Left_Hand_019", 1)
    ];
    this.legs = [
      this.limb("RightUpLeg_024", "RightLeg_025", "RightFoot_026"),
      this.limb("Left_UpLeg_00", "Left_Leg_028", "Left_Foot_029")
    ];
    const sourceGeometry = body!.geometry;
    this.wardrobe = new ChibiWardrobe(body!, this.rig, this.head, this.hips, this.bone("Spine2_04"), this.arms[0].end);
    this.appearance(appearance);
    let boundsByHair = lyingBoundsCache.get(sourceGeometry);
    if (!boundsByHair) { boundsByHair = new Map(); lyingBoundsCache.set(sourceGeometry, boundsByHair); }
    let bounds = boundsByHair.get(appearance.hairStyle);
    if (!bounds) { bounds = new THREE.Box3().setFromObject(this.rig); boundsByHair.set(appearance.hairStyle, bounds); }
    this.lyingBounds.copy(bounds);
    this.head.getWorldPosition(this.origin);
    this.lyingHeadLift = Math.max(.18, (bounds.max.y - this.origin.y) * .5) + .06;
  }

  private bone(name: string) {
    const joint = this.joints.get(name);
    if (!joint) throw new Error("Missing lounge chibi joint: " + name);
    return joint.bone;
  }

  private limb(a: string, b: string, c: string, side = 0): LoungeChibiLimb {
    const upper = this.bone(a);
    const lower = this.bone(b);
    const end = this.bone(c);
    const endRotation = end.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(side, 0, 0);
    return {
      upper, lower, end, endRotation, forward,
      upperAxis: lower.position.clone().normalize(),
      lowerAxis: end.position.clone().normalize(),
      upperLength: lower.position.length() * MODEL_SCALE,
      lowerLength: end.position.length() * MODEL_SCALE,
      palmAxis: forward.clone().applyQuaternion(endRotation.clone().invert()),
      restEnd: this.rig.worldToLocal(end.getWorldPosition(new THREE.Vector3()))
    };
  }

  appearance(value: LoungeAppearance) {
    this.wardrobe.apply(value);
  }

  private rotate(name: string, x: number, y: number, z: number) {
    const joint = this.joints.get(name)!;
    this.turn.setFromEuler(this.euler.set(x, y, z, "YXZ"));
    this.turn.premultiply(joint.inverseParentRotation).multiply(joint.parentRotation);
    joint.bone.quaternion.premultiply(this.turn);
  }

  private aim(bone: THREE.Bone, childAxis: THREE.Vector3, direction: THREE.Vector3) {
    bone.parent!.getWorldQuaternion(this.parentRotation).invert();
    this.aimFrom.copy(childAxis).applyQuaternion(bone.quaternion);
    this.aimTo.copy(direction).applyQuaternion(this.parentRotation).normalize();
    this.turn.setFromUnitVectors(this.aimFrom, this.aimTo);
    bone.quaternion.premultiply(this.turn);
  }

  private solve(limb: LoungeChibiLimb, target: THREE.Vector3, pole: THREE.Vector3) {
    limb.upper.getWorldPosition(this.origin);
    this.axis.copy(target).sub(this.origin);
    const a = limb.upperLength;
    const b = limb.lowerLength;
    const distance = THREE.MathUtils.clamp(this.axis.length(), Math.abs(a - b) + .0005, a + b - .0005);
    if (this.axis.lengthSq() < 1e-9) this.axis.set(0, -1, 0);
    this.axis.normalize();
    this.bend.copy(pole).applyQuaternion(this.rigRotation);
    this.bend.addScaledVector(this.axis, -this.bend.dot(this.axis));
    if (this.bend.lengthSq() < 1e-8) {
      this.bend.set(1, 0, 0).applyQuaternion(this.rigRotation);
      this.bend.addScaledVector(this.axis, -this.bend.dot(this.axis));
    }
    this.bend.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    const bend = Math.sqrt(Math.max(0, a * a - along * along));
    this.upperDirection.copy(this.axis).multiplyScalar(along).addScaledVector(this.bend, bend);
    this.lowerDirection.copy(this.axis).multiplyScalar(distance).sub(this.upperDirection);
    this.aim(limb.upper, limb.upperAxis, this.upperDirection);
    this.aim(limb.lower, limb.lowerAxis, this.lowerDirection);
  }

  private orientEnd(limb: LoungeChibiLimb, direction?: THREE.Vector3, roll = 0) {
    this.endRotation.copy(this.rigRotation).multiply(limb.endRotation);
    if (direction) {
      this.aimFrom.copy(limb.forward).applyQuaternion(this.rigRotation);
      this.turn.setFromUnitVectors(this.aimFrom, direction);
      this.endRotation.premultiply(this.turn);
      this.turn.setFromAxisAngle(direction, roll);
      this.endRotation.premultiply(this.turn);
    }
    limb.end.parent!.getWorldQuaternion(this.parentRotation).invert();
    limb.end.quaternion.copy(this.endRotation).premultiply(this.parentRotation);
  }

  private arm(limb: LoungeChibiLimb, side: number, running: number, weight: number, palm: THREE.Vector3 | null, direction?: THREE.Vector3, roll = 0) {
    this.rotate(limb.upper.name, .9 * running, 0, -side * 1.14);
    this.rotate(limb.lower.name, 0, -side * THREE.MathUtils.lerp(.22, .06, running), 0);
    if (!palm || weight <= 0) return;

    this.restingUpper.copy(limb.upper.quaternion);
    this.restingLower.copy(limb.lower.quaternion);
    this.restingHand.copy(limb.end.quaternion);
    if (direction) this.palmDirection.copy(direction);
    else {
      limb.upper.getWorldPosition(this.origin);
      this.palmDirection.copy(palm).sub(this.origin).normalize();
    }
    this.reach.copy(palm).addScaledVector(this.palmDirection, -PALM_LENGTH * MODEL_SCALE);
    this.solve(limb, this.reach, this.armPoles[side < 0 ? 0 : 1]);
    this.orientEnd(limb, this.palmDirection, roll);
    limb.upper.quaternion.slerp(this.restingUpper, 1 - weight);
    limb.lower.quaternion.slerp(this.restingLower, 1 - weight);
    limb.end.quaternion.slerp(this.restingHand, 1 - weight);
  }

  pose(state: LoungeCharacterPose) {
    this.bodyRoot.rotation.set(0, 0, 0); this.bodyRoot.position.set(0, 0, 0);
    for (const joint of this.joints.values()) joint.bone.quaternion.copy(joint.rotation);
    const { now, delta, reducedMotion, stunned, peer } = state;
    const lying = state.sitting?.kind === "lying";
    this.lieWeight = THREE.MathUtils.damp(this.lieWeight, lying ? 1 : 0, reducedMotion || state.action || stunned ? 30 : seatingRules.transitionRate, delta);
    if (!lying && this.lieWeight < .001) this.lieWeight = 0;
    const requestedSeat = state.sitting && !lying ? state.sitting : null;
    if (requestedSeat) this.seatPose = requestedSeat;
    this.sitWeight = THREE.MathUtils.damp(this.sitWeight, requestedSeat && this.lieWeight < .2 ? 1 : 0, reducedMotion ? 30 : seatingRules.transitionRate, delta);
    if (!requestedSeat && this.sitWeight < .001) { this.sitWeight = 0; this.seatPose = null; }
    const seat = this.seatPose;
    const seatHeight = seat?.kind === "log" ? findSeat(seat.seatId)?.height ?? seatingRules.logHeight : 0;
    if (state.action) {
      this.lastAction = state.action;
      this.release = 1;
    } else {
      this.release = Math.max(0, this.release - delta / .14);
      if (!this.release) this.lastAction = null;
    }
    const action = this.lastAction;
    const kind = action?.kind;
    const progress = action ? THREE.MathUtils.clamp((now - action.startedAt) / Math.max(1, action.endsAt - action.startedAt), 0, 1) : 0;
    const elapsed = action ? Math.max(0, now - action.startedAt) / 1000 : 0;
    const rod = fishingMotion(action, now);
    const carryingSpecimen = state.carryingFish || state.carryingInsect;
    const fishPose = carryingSpecimen && !state.action ? 1 : state.action?.kind === "collectInsect" ? smooth(progress, .4, .95) : state.action?.kind === "fishCatch" ? rod.recovery : 0;
    this.fishHold = THREE.MathUtils.damp(this.fishHold, fishPose, 20, delta);
    const windup = rod.windup * (reducedMotion ? .3 : 1);
    const castRelease = rod.release * (reducedMotion ? .35 : 1);
    const pull = rod.pull * (1 - .8 * rod.recovery) * (reducedMotion ? .4 : 1);
    const strike = kind === "punch";
    const weight = this.release * smooth(progress, 0, strike ? .29 : .23) * (1 - smooth(progress, strike ? .48 : .76, 1));
    const paired = Boolean(peer && (kind === "handshake" || kind === "hug" || kind === "give"));
    this.pace = THREE.MathUtils.damp(this.pace, state.action || stunned ? 0 : state.speed, 13, delta);
    const moving = smooth(this.pace, .03, 1.35);
    const running = smooth(this.pace, 1.55, 2.85);
    if (moving > .001) this.phase = (this.phase + delta * TAU * (2.25 + 1.25 * running)) % TAU;
    const stride = (2.35 + running * 1.2) * moving;
    const stance = .52 - .24 * running;
    const beat = reducedMotion ? 0 : Math.sin(elapsed * TAU * 1.65);
    const breath = reducedMotion ? 0 : Math.sin(now / 640);
    const recoil = stunned ? (1 - smooth(progress, 0, .34)) * .34 + .12 : 0;
    const dance = kind === "dance" ? weight : 0;
    const laugh = kind === "laugh" ? weight : 0;
    const chuckle = reducedMotion ? 0 : Math.sin(elapsed * TAU * 4);
    this.hips.position.copy(this.hipsRest);
    this.hips.position.x += dance * beat * .52;
    this.hips.position.y += -.2 - moving * (.95 + .45 * running) - (stunned ? 1.7 : 0)
      - (kind === "pickup" ? 1.3 * weight : 0) + (reducedMotion ? 0 : .16 * Math.cos(this.phase * 2) * moving)
      + .24 * Math.abs(beat) * dance + .14 * chuckle * laugh;
    this.rotate("Spine_02", .035 * moving + .39 * running + (paired ? .13 * weight : 0)
      + (strike ? .23 * weight : 0) + laugh * .13 - recoil - .08 * windup + .09 * castRelease - .12 * pull,
      0, -.12 * dance * beat);
    this.rotate("Spine2_04", (paired ? .33 * weight : 0) + (strike ? .45 * weight : 0)
      + (kind === "pickup" ? .46 * weight : 0) + breath * .024 + laugh * (.25 + .055 * chuckle),
      (strike ? .3 * weight : 0) + .15 * dance * beat - .16 * windup + .08 * castRelease + .05 * pull, 0);
    this.rotate("Neck_05", paired ? -.56 * weight : 0, 0, kind === "hug" ? .17 * weight : 0);
    const look = paired && (kind === "handshake" || kind === "give") ? -.6 : kind === "eat" ? -.24 : 0;
    const headPitch = kind === "eat" ? .55 : kind === "tongueOut" ? .12 : 0;
    const headTilt = kind === "scratchHead" ? .11 : kind === "tongueOut" ? .19 : 0;
    this.rotate("Head_06", headPitch * weight - .21 * laugh - .18 * running - .16 * this.fishHold, look * weight, headTilt * weight + recoil * .4);
    this.group.updateMatrixWorld(true);
    if (seat && this.sitWeight > .001) {
      this.hips.getWorldPosition(this.target);
      this.target.y = this.group.position.y + seatHeight + .1;
      this.hips.parent!.worldToLocal(this.target);
      this.hips.position.lerp(this.target, this.sitWeight);
      this.group.updateMatrixWorld(true);
    }
    this.rig.getWorldQuaternion(this.rigRotation);
    for (let i = 0; i < this.legs.length; i += 1) {
      const limb = this.legs[i];
      const phase = ((this.phase + i * Math.PI) % TAU) / TAU;
      const swing = Math.max(0, (phase - stance) / (1 - stance));
      const sweep = phase < stance ? 1 - 2 * phase / stance : -1 + 2 * smooth(swing, 0, 1);
      const lift = Math.sin(swing * Math.PI) * stride * (reducedMotion ? .3 : .65)
        + Math.max(0, i === 0 ? beat : -beat) * dance * .65;
      this.target.copy(limb.restEnd);
      this.target.y += lift;
      this.target.z += sweep * stride;
      this.target.applyMatrix4(this.rig.matrixWorld);
      let pole = kneePole;
      if (seat && this.sitWeight > .001) {
        const side = i === 0 ? -1 : 1;
        if (seat.kind === "log") {
          limb.upper.getWorldPosition(this.aimFrom);
          this.aimTo.set(0, 0, 1).applyQuaternion(this.rigRotation);
          this.aimFrom.addScaledVector(this.aimTo, limb.upperLength * .98);
          this.aimFrom.y = Math.max(this.group.position.y + .04, this.aimFrom.y - limb.lowerLength * .95);
        } else {
          this.aimFrom.set(-side * .1, .035, .2).applyMatrix4(this.group.matrixWorld);
          this.seatedPole.set(side, .15, .25); pole = this.seatedPole;
        }
        this.target.lerp(this.aimFrom, this.sitWeight);
      }
      this.solve(limb, this.target, pole);
      this.orientEnd(limb);
    }

    if (peer) {
      this.along.copy(peer).sub(this.group.position);
      this.along.y = 0;
      this.along.normalize();
      this.midpoint.copy(this.group.position).lerp(peer, .5);
    }
    for (let i = 0; i < this.arms.length; i += 1) {
      const side = i === 0 ? -1 : 1;
      let armWeight = weight;
      let roll = 0;
      let worldPalm = false;
      let direction: THREE.Vector3 | undefined;
      if (this.lieWeight > .1 && !state.action && !state.carried && !carryingSpecimen) {
        this.palm.set(side * 6.8, 11, 1.4);
        armWeight = this.lieWeight;
      } else if (seat && this.sitWeight > .001 && !state.action && !state.carried && !carryingSpecimen) {
        this.palm.set(side * .15, seatHeight + .2, .17).applyMatrix4(this.group.matrixWorld);
        armWeight = this.sitWeight; worldPalm = true;
      } else if (carryingSpecimen && !state.action) {
        this.palm.set(side * 4.7, 15, 10);
        armWeight = this.fishHold;
      } else if (peer && paired && ((i === 0 && kind !== "hug") || kind === "hug")) {
        this.palm.copy(this.midpoint);
        this.palm.y = this.group.position.y + (kind === "hug" ? .55 : .565);
        if (kind === "handshake") {
          this.palm.y += reducedMotion ? 0 : .026 * Math.sin(Math.PI * 6 * smooth(progress, .23, .76));
          roll = Math.PI / 2;
        }
        if (kind === "hug") {
          this.palm.x += this.along.z * side * .2 - this.along.x * .025;
          this.palm.z -= this.along.x * side * .2 + this.along.z * .025;
        }
        worldPalm = true;
      } else if (i === 0 && strike) {
        if (peer) {
          this.palm.copy(peer).addScaledVector(this.along, -.35);
          this.palm.y += .78;
          worldPalm = true;
        } else {
          this.palm.set(-4.3, 17, 10 + 4 * weight);
        }
      } else if (i === 0 && kind === "eat") {
        this.palm.set(0, 25.3 + beat * .25, 11.1).applyMatrix4(this.headBind).applyMatrix4(this.head.matrixWorld);
        this.palm.y -= .055;
        worldPalm = true;
      } else if (i === 0 && kind === "pickup") {
        this.palm.set(-7, 6.9, 5.2);
      } else if (i === 1 && kind === "scratchHead") {
        this.poseSpace.multiplyMatrices(this.head.matrixWorld, this.headBind);
        this.palm.set(14.8 + .23 * beat, 21.5 + .48 * beat, 2.6 + .32 * beat).applyMatrix4(this.poseSpace);
        direction = this.gestureDirection.set(.73, .67, .06).transformDirection(this.poseSpace);
        worldPalm = true;
      } else if (i === 0 && kind === "middleFinger") {
        this.palm.set(-12.8, 21.5, 4.9);
        direction = this.gestureDirection.set(-.64, .72, .27).transformDirection(this.rig.matrixWorld);
        roll = -.38;
      } else if (kind === "dance") {
        const accent = reducedMotion ? .45 * side : beat * side;
        this.palm.set(side * (12.9 + .65 * accent), 15.8 + 4.3 * accent, 3.8 - 1.2 * accent);
      } else if (kind === "laugh") {
        this.poseSpace.multiplyMatrices(this.belly.matrixWorld, this.bellyBind);
        this.palm.set(side * 3.65, 12.25, 8.55).applyMatrix4(this.poseSpace);
        direction = this.gestureDirection.set(-side * .65, -.35, .67).transformDirection(this.poseSpace);
        worldPalm = true;
      } else if (stunned) {
        this.palm.set(side * 7, 14.9, 5.5);
        armWeight = Math.max(weight, .65);
      } else if (kind === "fish" && i === 0) {
        this.palm.set(-5.5, 14.7, 7.9);
        this.palm.lerp(this.reach.set(-12.2, 20, -2.9), windup);
        this.palm.lerp(this.reach.set(-6, 16.4, 10), castRelease);
        armWeight = this.release * smooth(elapsed, 0, .24);
      } else if (kind === "collectInsect") {
        const lift = smooth(progress, .35, .95);
        this.palm.set(side * 6.5, i === 0 ? 6.9 : 12, 6.5);
        this.palm.lerp(this.reach.set(side * 4.7, 15, 10), lift);
        armWeight = this.release * smooth(progress, 0, .2);
      } else if (kind === "fishCatch") {
        if (i === 0) {
          this.palm.set(-5.5, 14.7, 7.9).lerp(this.reach.set(-12, 19.4, 3.7), pull);
          this.palm.lerp(this.reach.set(-4.7, 15, 10), rod.recovery);
          armWeight = this.release;
        } else {
          this.palm.set(6, 13.2 + beat * .4, 4.3);
          this.palm.lerp(this.reach.set(4.7, 15, 10), rod.recovery);
          armWeight = this.release * Math.max(pull * .65, rod.recovery);
        }
      } else if ((state.carried || state.carryingFish) && i === (paired ? 1 : 0)) {
        this.palm.set(side * 7, 14.4, 7.5);
        armWeight = 1 - running;
      } else {
        armWeight = 0;
      }
      if (armWeight > 0 && !worldPalm) this.palm.applyMatrix4(this.rig.matrixWorld);
      this.arm(this.arms[i], side, running, armWeight, armWeight > 0 ? this.palm : null, direction, roll);
    }
    const fist = strike || kind === "handshake";
    if (fist || kind === "middleFinger") {
      if (fist) this.rotate("RightHandIndex1_012", 0, 0, weight * 1.05);
      this.rotate("RightHandIndex3_014", weight * .36, 0, weight * .4);
    }
    const tongue = kind === "tongueOut" && weight > .4;
    const laughing = kind === "laugh" && weight > .25;
    const chewing = kind === "eat" && weight > .45 && (reducedMotion || Math.sin(elapsed * 14) > 0);
    this.wardrobe.expression(tongue || laughing || chewing, tongue, kind === "middleFinger" && weight > .38);
    if (this.lieWeight > .001) {
      const angle = Math.PI / 2 * this.lieWeight, sine = Math.sin(angle), cosine = Math.cos(angle);
      this.bodyRoot.rotation.x = -angle;
      this.bodyRoot.position.y = Math.max(0, this.lyingBounds.min.y * (1 - cosine) - this.lyingBounds.min.z * sine + .02 * sine);
      this.bodyRoot.position.z = (this.lyingBounds.min.y + this.lyingBounds.max.y) * .5 * sine;
    }
    this.group.updateMatrixWorld(true);
  }

  grip(matrix: THREE.Matrix4, left = false, twoHanded = false) {
    const limb = this.arms[left ? 1 : 0];
    this.target.copy(limb.palmAxis).multiplyScalar(PALM_LENGTH).applyMatrix4(limb.end.matrixWorld);
    if (twoHanded) {
      const other = this.arms[left ? 0 : 1];
      this.otherPalm.copy(other.palmAxis).multiplyScalar(PALM_LENGTH).applyMatrix4(other.end.matrixWorld);
      this.target.lerp(this.otherPalm, .5);
    }
    this.target.y += .045;
    matrix.makeRotationY(this.group.rotation.y).setPosition(this.target);
  }

  label(point: THREE.Vector3) {
    point.set(0, this.wardrobe.topY + .8, 0).applyMatrix4(this.headBind).applyMatrix4(this.head.matrixWorld);
    if (this.lieWeight > .001) {
      this.head.getWorldPosition(this.origin);
      point.lerp(this.origin, this.lieWeight * .5);
      point.y += this.lieWeight * this.lyingHeadLift;
    }
  }

  dispose() {
    for (const skeleton of this.skins) skeleton.dispose();
    this.wardrobe.dispose();
    this.group.removeFromParent();
  }
}
