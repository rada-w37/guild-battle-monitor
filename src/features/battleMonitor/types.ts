export interface BattleMonitorGuildCandidateViewModel<TGuildId extends string = string> {
  readonly guildId: TGuildId;
  readonly guildName: string;
  readonly ownedCastleCount: number;
}

export interface BattleMonitorCastleKoViewModel {
  readonly count: number;
  readonly tone: "attack" | "defense" | "none";
}

export type BattleMonitorCastleGuildRelation = "defense" | "attack" | "none";

export interface BattleMonitorCastleViewModel<TCastleId extends string = string> {
  readonly castleId: TCastleId;
  readonly castleName: string;
  readonly guildRelation: BattleMonitorCastleGuildRelation;
  readonly ownerGuildName: string;
  readonly attackerGuildName: string | null;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly isDefenseSecured: boolean;
  readonly koDisplay: BattleMonitorCastleKoViewModel;
  readonly alertLevel: "safe" | "warning" | "danger" | "critical";
}
