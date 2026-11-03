import { loungeRules } from "./shared";
import type { LoungeBubble, LoungeMessage, LoungeNameLabel, LoungePoint, LoungeRect, LoungeRenderedPlayer } from "$lib/types/Lounge";

const overlaps = (a: LoungeRect, b: LoungeRect, gap = 5) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const textWidth = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 13 : /[WMwm@%]/.test(char) ? 12 : 8.5), 0);

export function nameLabels(players: LoungeRenderedPlayer[], selfId: string, camera: LoungePoint, viewport: LoungePoint, offset: LoungePoint): LoungeNameLabel[] {
  const labels: LoungeNameLabel[] = [];
  const visible = players.filter((player) => player.x - camera.x + offset.x > -40 && player.x - camera.x + offset.x < viewport.x + 40 && player.y - camera.y + offset.y > 50 && player.y - camera.y + offset.y < viewport.y + 80);
  visible.sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId) || a.y - b.y);
  for (const player of visible) {
    const anchorX = player.x - camera.x + offset.x;
    const anchorY = player.y - camera.y + offset.y - 77;
    const width = Math.min(196, Math.max(52, textWidth(player.nickname) + (player.id === selfId ? 38 : 24)));
    const label: LoungeNameLabel = {
      playerId: player.id, nickname: player.nickname, color: player.color, self: player.id === selfId,
      x: clamp(anchorX - width / 2, 6, viewport.x - width - 6), y: clamp(anchorY - 26, 76, viewport.y - 94),
      width, height: 24, anchorX, anchorY
    };
    for (let attempt = 0; attempt < 10 && labels.some((other) => overlaps(label, other, 3)); attempt += 1) {
      if (label.y >= 103) label.y -= 27;
      else label.x = clamp(label.x + (attempt % 2 ? -1 : 1) * (width / 2 + 10), 6, viewport.x - width - 6);
    }
    labels.push(label);
  }
  return labels;
}

export function speechBubbles(messages: LoungeMessage[], labels: LoungeNameLabel[], viewport: LoungePoint, now: number): LoungeBubble[] {
  const bubbles: LoungeBubble[] = [];
  const latest = new Map<string, LoungeMessage>();
  for (const message of messages) if (now - message.createdAt < loungeRules.bubbleMs) latest.set(message.playerId, message);
  const ordered = [...latest.values()].sort((a, b) => b.createdAt - a.createdAt);
  for (const message of ordered) {
    const label = labels.find((item) => item.playerId === message.playerId);
    if (!label) continue;
    const width = Math.min(236, viewport.x - 20, Math.max(130, textWidth(message.text) + 28));
    const lines = Math.max(1, Math.ceil(textWidth(message.text) / (width - 28)));
    const height = Math.min(40 + lines * 20, Math.max(70, viewport.y - 170));
    const desiredX = clamp(label.x + label.width / 2 - width / 2, 10, viewport.x - width - 10);
    const desiredY = label.y - height - 8;
    const candidates: LoungeRect[] = [];
    for (let row = 0; row < 5; row += 1) {
      for (const shift of [0, -width - 8, width + 8]) {
        candidates.push({ x: clamp(desiredX + shift, 10, viewport.x - width - 10), y: desiredY - row * (height + 8), width, height });
      }
    }
    for (let y = 78; y + height < viewport.y - 82; y += height + 8) {
      for (let x = 10; x + width < viewport.x - 10; x += width + 8) candidates.push({ x, y, width, height });
    }
    const place = candidates.find((rect) => rect.y >= 76 && rect.y + height <= viewport.y - 82 && !labels.some((other) => overlaps(rect, other)) && !bubbles.some((other) => overlaps(rect, other, 7)));
    if (!place) continue;
    bubbles.push({ ...place, id: message.id, playerId: message.playerId, nickname: message.nickname, text: message.text, anchorX: label.x + label.width / 2, anchorY: label.y });
  }
  return bubbles;
}
