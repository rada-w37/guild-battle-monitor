import { loadGrandBattleSnapshot } from "../grandBattle/grandBattleParticipantService";
import type {
  GrandBattleBlockId,
  GrandBattleClassId,
  GrandBattleParticipantGuildCandidate,
  GrandBattleResolvedSource,
  GrandBattleSnapshot
} from "../grandBattle/types";
import type { GvgGuildId } from "../gvg/types";

const GRAND_BATTLE_AUTO_CLASS_ORDER: readonly GrandBattleClassId[] = [3, 2, 1];
const GRAND_BATTLE_AUTO_BLOCK_ORDER: readonly GrandBattleBlockId[] = [0, 1, 2, 3];

export interface GrandBattleAutoResolutionContext {
  readonly guildId: GvgGuildId;
  readonly world: number;
}

export interface GrandBattleAutoResolutionResult {
  readonly participants: readonly GrandBattleParticipantGuildCandidate[];
  readonly snapshot: GrandBattleSnapshot;
  readonly source: GrandBattleResolvedSource;
}

export async function resolveGrandBattleSourceForGuild({
  context,
  loadGrandBattleLatestSnapshot
}: {
  readonly context: GrandBattleAutoResolutionContext;
  readonly loadGrandBattleLatestSnapshot: typeof loadGrandBattleSnapshot;
}): Promise<GrandBattleAutoResolutionResult | null> {
  for (const classId of GRAND_BATTLE_AUTO_CLASS_ORDER) {
    for (const blockId of GRAND_BATTLE_AUTO_BLOCK_ORDER) {
      const source: GrandBattleResolvedSource = {
        serverId: "japan",
        worldInput: String(context.world),
        worldNumber: context.world,
        classId,
        blockId
      };
      const snapshot = await loadGrandBattleLatestSnapshot(source);

      if (!Object.prototype.hasOwnProperty.call(snapshot.guildNames, context.guildId)) {
        continue;
      }

      return {
        participants: createGrandBattleParticipantsFromSnapshot(snapshot),
        snapshot,
        source
      };
    }
  }

  return null;
}

function createGrandBattleParticipantsFromSnapshot(
  snapshot: GrandBattleSnapshot
): readonly GrandBattleParticipantGuildCandidate[] {
  return Object.entries(snapshot.guildNames)
    .sort(([leftGuildId], [rightGuildId]) => leftGuildId.localeCompare(rightGuildId))
    .slice(0, 4)
    .map(([guildId, guildName]) => ({
      guildId: guildId as GvgGuildId,
      guildName
    }));
}
