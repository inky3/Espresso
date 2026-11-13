/**
 * What is currently on screen in Rin's private space (outfit, room, time of
 * day). Shared by the stage (client) and the chat route (server) so Rin's
 * replies match what the user actually sees.
 */

export type OutfitArt = "casual" | "hoodie" | "shirt";
export type RoomId = "kitchen";
export type TimeOfDay = "day" | "night";

/** Maps a catalogue outfit ID to the artwork that exists for it. */
export function outfitArt(outfit: string): OutfitArt {
  if (outfit === "relaxed") return "hoodie";
  if (outfit === "homewear" || outfit === "sleepwear") return "shirt";
  return "casual";
}

const OUTFIT_DESCRIPTIONS: Record<OutfitArt, string> = {
  casual: "a cream oversized cable-knit sweater and a dark brown pleated skirt",
  hoodie: "an oversized charcoal-gray hoodie with the hood down and black lounge shorts",
  shirt: "an oversized white button-up shirt slipping off one shoulder, with short gray lounge shorts underneath",
};

const ROOM_DESCRIPTIONS: Record<RoomId, string> = {
  kitchen: "your cozy home kitchen, with a brass espresso machine on the counter",
};

export function isNightAt(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes < 6 * 60 || minutes >= 17 * 60 + 30;
}

/** Builds the scene note for Rin's system prompt. Unknown values are ignored. */
export function describeScene(scene: unknown): string | null {
  if (!scene || typeof scene !== "object") return null;
  const { outfit, room, time } = scene as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof outfit === "string" && outfit.length <= 32) {
    lines.push(`You are wearing ${OUTFIT_DESCRIPTIONS[outfitArt(outfit)]}.`);
  }
  if (typeof room === "string" && room in ROOM_DESCRIPTIONS) {
    lines.push(`You are in ${ROOM_DESCRIPTIONS[room as RoomId]}.`);
  }
  if (time === "day" || time === "night") {
    lines.push(time === "day" ? "It is daytime, with soft sunlight coming in." : "It is night, and the room is lit by warm lamps.");
  }
  return lines.length ? lines.join(" ") : null;
}
