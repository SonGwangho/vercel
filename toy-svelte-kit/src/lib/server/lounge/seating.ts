import { availableSeat, findSeat, groundSeatAllowed, lyingAllowed, seatedMove, seatingRules } from "../../lounge/seating";
import { clampPosition, distance, interactionBlock, positionAt } from "../../lounge/shared";
import type { LoungeCommandInput, LoungeRoomState, LoungeStoredPlayer } from "../../types/Lounge";

export function applySeating(state: LoungeRoomState, player: LoungeStoredPlayer, command: Extract<LoungeCommandInput, { type: "sitGround" | "sitLog" | "sitBench" | "lieGround" | "stand" }>, now: number): string | null {
  const blocked = interactionBlock(player, now);
  if (blocked) return blocked;
  const from = positionAt(player, now);
  if (command.type === "stand") {
    const seat = player.sitting?.kind === "log" || player.sitting?.kind === "bench" ? findSeat(player.sitting.seatId) : undefined;
    if (seat) player.move = seatedMove(from, player.sitting, seat.approach, now);
    player.sitting = null;
    return null;
  }
  if (command.type === "sitGround" || command.type === "lieGround") {
    if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return "쉴 위치를 다시 선택해 주세요.";
    const point = clampPosition(command);
    if (distance(point, command) > 1 || !groundSeatAllowed(point)) return "이곳에서는 쉴 수 없어요.";
    if (distance(from, point) > seatingRules.groundRange) return "쉴 곳으로 조금 더 가까이 이동해 주세요.";
    if (!groundSeatAllowed(from)) return "이곳에서는 쉴 수 없어요.";
    if (command.facing !== undefined && !Number.isFinite(command.facing)) return "바라보는 방향을 다시 선택해 주세요.";
    const previous = player.move.path?.at(-2) ?? player.move.from;
    const dx = from.x - previous.x, dy = from.y - previous.y;
    const requestedFacing = command.facing ?? player.sitting?.facing ?? (Math.hypot(dx, dy) > .01 ? Math.atan2(dx, dy) : .58);
    const facing = Math.atan2(Math.sin(requestedFacing), Math.cos(requestedFacing));
    if (command.type === "lieGround" && !lyingAllowed(from, facing)) return "몸을 펼칠 공간이 부족해요. 넓은 바닥을 골라 주세요.";
    player.move = { from, to: from, startedAt: now, endsAt: now };
    player.sitting = { kind: command.type === "lieGround" ? "lying" : "ground", facing, startedAt: now };
    if (command.type === "lieGround") { player.heldFoodId = null; player.fishHeld = false; player.insectHeld = false; }
    return null;
  }
  const kind = command.type === "sitLog" ? "log" : "bench";
  const fixtureId = command.type === "sitLog" ? command.logId : command.benchId;
  const label = kind === "log" ? "통나무" : "테이블 의자";
  const seat = availableSeat(fixtureId, state.players, from, player.id);
  if (!seat || seat.kind !== kind) return `${label}에 빈자리가 없어요.`;
  if (distance(from, seat.point) > seatingRules.interactRange || distance(from, seat.approach) > seatingRules.groundRange) return `${label} 옆으로 조금 더 가까이 이동해 주세요.`;
  player.move = { from: seat.point, to: seat.point, startedAt: now, endsAt: now };
  player.sitting = { kind, seatId: seat.id, facing: seat.facing, startedAt: now };
  return null;
}
