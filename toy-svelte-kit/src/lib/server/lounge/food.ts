import { walkablePoint } from "../../lounge/navigation";
import { loungeRules, positionAt } from "../../lounge/shared";
import type { LoungeGroundFood, LoungePlayer, LoungeRoomState } from "../../types/Lounge";

export function groundFoodsAt(foods: LoungeGroundFood[], now: number): LoungeGroundFood[] {
  const active = foods.filter((food) => now - food.createdAt < loungeRules.foodLifetimeMs);
  const ambientIds = new Set(active.filter((food) => !food.droppedFrom).slice(-loungeRules.maxGroundFoods).map((food) => food.id));
  return active.filter((food) => food.droppedFrom || ambientIds.has(food.id));
}

export function ambientFoodCount(foods: LoungeGroundFood[]): number {
  return foods.filter((food) => !food.droppedFrom).length;
}

export function dropHeldFood(state: LoungeRoomState, victim: LoungePlayer, attacker: LoungePlayer, now: number): LoungeGroundFood | null {
  const held = victim.inventory.find((food) => food.id === victim.heldFoodId);
  victim.heldFoodId = null;
  if (!held) return null;
  const origin = positionAt(victim, now);
  const from = positionAt(attacker, now);
  const angle = Math.hypot(origin.x - from.x, origin.y - from.y) > 0.001
    ? Math.atan2(origin.y - from.y, origin.x - from.x) : Math.random() * Math.PI * 2;
  const landing = walkablePoint({ x: origin.x + Math.cos(angle) * loungeRules.punchDropDistance, y: origin.y + Math.sin(angle) * loungeRules.punchDropDistance });
  const food: LoungeGroundFood = { id: held.id, kind: held.kind, ...landing, createdAt: now, droppedFrom: origin };
  victim.inventory = victim.inventory.filter((item) => item.id !== held.id);
  state.foods.push(food);
  return food;
}
