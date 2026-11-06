import { availableSeat, findSeat, groundFacing, groundSeatAllowed, lyingAllowed, seatedMove, seatingRules } from "../../lounge/seating";
import { clampPosition, distance, interactionBlock, positionAt } from "../../lounge/shared";
import type { LoungeCommandInput, LoungeRoomState, LoungeStoredPlayer } from "../../types/Lounge";

export function applySeating(state: LoungeRoomState, player: LoungeStoredPlayer, command: Extract<LoungeCommandInput, { type: "sitGround" | "sitLog" | "lieGround" | "stand" }>, now: number): string | null {
  const blocked = interactionBlock(player, now);
  if (blocked) return blocked;
  const from = positionAt(player, now);
  if (command.type === "stand") {
    const seat = player.sitting?.kind === "log" ? findSeat(player.sitting.seatId) : undefined;
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
    if (command.type === "lieGround" && !lyingAllowed(from)) return "몸을 펼칠 공간이 부족해요. 넓은 바닥을 골라 주세요.";
    player.move = { from, to: from, startedAt: now, endsAt: now };
    player.sitting = { kind: command.type === "lieGround" ? "lying" : "ground", facing: groundFacing(from), startedAt: now };
    if (command.type === "lieGround") { player.heldFoodId = null; player.fishHeld = false; player.insectHeld = false; }
    return null;
  }
  const seat = availableSeat(command.logId, state.players, from, player.id);
  if (!seat) return "통나무에 빈자리가 없어요.";
  if (distance(from, seat.point) > seatingRules.interactRange || distance(from, seat.approach) > seatingRules.groundRange) return "통나무 옆으로 조금 더 가까이 이동해 주세요.";
  player.move = { from: seat.point, to: seat.point, startedAt: now, endsAt: now };
  player.sitting = { kind: "log", seatId: seat.id, facing: seat.facing, startedAt: now };
  return null;
}
