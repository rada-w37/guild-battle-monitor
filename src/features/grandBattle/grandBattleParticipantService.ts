import type { GvgGuildId } from "../gvg/types";
import {
  fetchGrandBattleLatest,
  fetchGrandBattleWorldGroups,
  GrandBattleApiError,
  type FetchGrandBattleOptions,
  type GrandBattleWorldGroupResponse
} from "./grandBattleApiClient";
import type {
  GrandBattleParticipantGuildCandidate,
  GrandBattleResolvedSource,
  GrandBattleServerId
} from "./types";

const SERVER_WORLD_BASE: Record<GrandBattleServerId, number> = {
  japan: 1000
};

export async function loadGrandBattleParticipantGuilds(
  source: GrandBattleResolvedSource,
  options: FetchGrandBattleOptions = {}
): Promise<readonly GrandBattleParticipantGuildCandidate[]> {
  const worldId = createGrandBattleWorldId(source.serverId, source.worldNumber);
  const worldGroupsResponse = await fetchGrandBattleWorldGroups(options);
  const worldGroupId = findGrandBattleWorldGroupId(worldGroupsResponse.data, worldId);

  if (worldGroupId === null) {
    throw new GrandBattleApiError("対象worldのワールドグループが見つかりません。");
  }

  const latestResponse = await fetchGrandBattleLatest(
    {
      worldGroupId,
      classId: source.classId,
      blockId: source.blockId
    },
    options
  );

  return normalizeGrandBattleParticipantGuilds(latestResponse.data?.guilds);
}

export function createGrandBattleWorldId(serverId: GrandBattleServerId, worldNumber: number): number {
  return SERVER_WORLD_BASE[serverId] + worldNumber;
}

export function findGrandBattleWorldGroupId(
  worldGroups: readonly GrandBattleWorldGroupResponse[] | null | undefined,
  worldId: number
): number | null {
  if (!Array.isArray(worldGroups)) {
    return null;
  }

  for (const worldGroup of worldGroups) {
    const groupId = toNumber(worldGroup.group_id);
    const worlds: readonly unknown[] = Array.isArray(worldGroup.worlds) ? worldGroup.worlds : [];

    if (groupId !== null && worlds.some((candidateWorldId) => toNumber(candidateWorldId) === worldId)) {
      return groupId;
    }
  }

  return null;
}

export function normalizeGrandBattleParticipantGuilds(
  guilds: Record<string, string> | null | undefined
): readonly GrandBattleParticipantGuildCandidate[] {
  if (!guilds) {
    return [];
  }

  return Object.entries(guilds)
    .filter((entry): entry is [string, string] => entry[0].trim().length > 0 && typeof entry[1] === "string")
    .sort(([leftGuildId], [rightGuildId]) => leftGuildId.localeCompare(rightGuildId))
    .slice(0, 4)
    .map(([guildId, guildName]) => ({
      guildId: guildId.trim() as GvgGuildId,
      guildName
    }));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}
