import type { GvgGuildId } from "../gvg/types";

export type GrandBattleServerId = "japan";
export type GrandBattleClassId = 1 | 2 | 3;
export type GrandBattleBlockId = 0 | 1 | 2 | 3;

export interface GrandBattleSource {
  readonly serverId: GrandBattleServerId;
  readonly worldInput: string;
  readonly worldNumber: number | null;
  readonly classId: GrandBattleClassId;
  readonly blockId: GrandBattleBlockId;
}

export interface GrandBattleResolvedSource extends GrandBattleSource {
  readonly worldNumber: number;
}

export interface GrandBattleParticipantGuildCandidate {
  readonly guildId: GvgGuildId;
  readonly guildName: string;
}
