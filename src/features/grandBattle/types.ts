import type { GvgCastleId, GvgCastleState, GvgGuildId } from "../gvg/types";

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

export interface GrandBattleCastle {
  readonly castleId: GvgCastleId;
  readonly state: GvgCastleState;
  readonly ownerGuildId: GvgGuildId | null;
  readonly attackerGuildId: GvgGuildId | null;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly fallenAt: string | null;
  readonly lastWinPartyKnockOutCount: number;
  readonly updatedAt: string;
}

export interface GrandBattleSnapshot {
  readonly source: GrandBattleResolvedSource;
  readonly capturedAt: string;
  readonly castles: readonly GrandBattleCastle[];
  readonly guildNames: Readonly<Record<GvgGuildId, string>>;
}
