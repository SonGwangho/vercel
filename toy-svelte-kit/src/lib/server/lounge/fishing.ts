import { randomInt, randomUUID } from "node:crypto";
import { canFishFrom, fishSpecies, fishingRules, gaugePosition } from "../../lounge/fishing";
import { interactionBlock, positionAt } from "../../lounge/shared";
import { signCatch } from "./catch-receipt";
import type { LoungeCommandInput, LoungeFishingCommand, LoungeStoredPlayer } from "../../types/Lounge";

export function isFishingCommand(command: LoungeCommandInput): command is LoungeFishingCommand {
  return command.type === "cast" || command.type === "reel" || command.type === "stopFishing" || command.type === "releaseFish";
}

export function applyFishing(player: LoungeStoredPlayer, command: LoungeFishingCommand, now: number, secret = process.env.LOUNGE_SOCKET_SECRET || process.env.DATABASE_URL || ""): string | null {
  if (command.type === "releaseFish") {
    const reason = interactionBlock(player, now);
    if (reason) return reason;
    if (!player.fishHeld || player.lastCatch?.id !== command.catchId) return "지금 손에 들고 있는 물고기가 아니에요.";
    player.fishHeld = false;
    return null;
  }
  if (command.type === "cast") {
    const reason = interactionBlock(player, now);
    if (reason) return reason;
    const point = positionAt(player, now);
    if (!canFishFrom(point)) return "호수 물가에서 낚시할 수 있어요.";
    player.move = { from: point, to: point, startedAt: now, endsAt: now };
    player.heldFoodId = null;
    player.fishHeld = false;
    player.insectHeld = false;
    player.action = {
      id: randomUUID(),
      kind: "fish",
      startedAt: now,
      endsAt: now + fishingRules.castMs + fishingRules.durationMs,
      fishing: { center: randomInt(23, 78) / 100, width: fishingRules.zoneWidth, readyAt: now + fishingRules.castMs }
    };
    return null;
  }

  const action = player.action;
  if (action?.kind !== "fish" || !action.fishing || action.id !== command.actionId || action.endsAt <= now) {
    return "낚시가 끝났어요. 다시 던져 보세요.";
  }
  if (command.type === "stopFishing") {
    player.action = null;
    return null;
  }
  const pressedAt = command.pressedAt;
  const readyAt = action.fishing.readyAt ?? action.startedAt;
  if (now < readyAt || pressedAt < readyAt) return "찌가 내려앉으면 낚아채 주세요.";
  if (!Number.isFinite(pressedAt) || pressedAt < Math.max(readyAt, now - fishingRules.inputLagMs) || pressedAt > now + 80) {
    return "입력 시간이 맞지 않아요. 다시 눌러 주세요.";
  }
  player.action = null;
  const position = gaugePosition(readyAt, Math.min(now, pressedAt));
  if (Math.abs(position - action.fishing.center) > action.fishing.width / 2) return null;

  let roll = randomInt(fishSpecies.reduce((total, fish) => total + fish.weight, 0));
  const species = fishSpecies.find((fish) => (roll -= fish.weight) < 0)!;
  player.lastCatch = { id: action.id, kind: species.kind, sizeCm: randomInt(species.minCm, species.maxCm + 1), caughtAt: now };
  player.lastCatch.receipt = signCatch(player.lastCatch, player.tokenHash, now, secret);
  player.pendingCatch = null;
  player.fishHeld = true;
  player.action = { id: randomUUID(), kind: "fishCatch", startedAt: now, endsAt: now + fishingRules.catchMs };
  return null;
}
