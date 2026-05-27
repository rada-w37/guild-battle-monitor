type Brand<TValue, TName extends string> = TValue & { readonly __brand: TName };

export type GvgCastleId = Brand<string, "GvgCastleId">;
export type GvgGuildId = Brand<string, "GvgGuildId">;
export type GvgWorldId = Brand<string, "GvgWorldId">;

export type GvgCastleState =
  | "idle"
  | "inBattle"
  | "counterattack"
  | "counterattackSuccessful"
  | "fallen"
  | "unknown";

export type GvgCastleStatus = "normal" | "underAttack" | "fallen" | "unknown";

export type GvgGuildNameMap = Readonly<Record<GvgGuildId, string>>;

export interface GvgCastle {
  readonly castleId: GvgCastleId;
  readonly worldId: GvgWorldId;
  readonly state: GvgCastleState;
  readonly status: GvgCastleStatus;
  readonly ownerGuildId: GvgGuildId | null;
  readonly attackerGuildId: GvgGuildId | null;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly fallenAt: string | null;
  readonly lastWinPartyKnockOutCount: number;
  readonly updatedAt: string;
}

export interface GvgSnapshot {
  readonly worldId: GvgWorldId;
  readonly capturedAt: string;
  readonly castles: readonly GvgCastle[];
  readonly guildNames: GvgGuildNameMap;
}

export interface GvgCastleUpdate {
  readonly castleId: GvgCastleId;
  readonly worldId?: GvgWorldId;
  readonly state: GvgCastleState;
  readonly status?: GvgCastleStatus;
  readonly ownerGuildId: GvgGuildId | null;
  readonly attackerGuildId: GvgGuildId | null;
  readonly defenseCount: number;
  readonly attackCount: number;
  readonly fallenAt: string | null;
  readonly lastWinPartyKnockOutCount: number;
  readonly updatedAt: string;
}

export interface GvgGuildNameUpdate {
  readonly guildId: GvgGuildId;
  readonly guildName: string;
}

export type GvgRealtimeMessage =
  | {
      readonly type: "snapshot";
      readonly receivedAt: string;
      readonly snapshot: GvgSnapshot;
    }
  | {
      readonly type: "castleUpdate";
      readonly receivedAt: string;
      readonly castle: GvgCastleUpdate;
    }
  | {
      readonly type: "guildNameUpdate";
      readonly receivedAt: string;
      readonly guild: GvgGuildNameUpdate;
    }
  | {
      readonly type: "unknown";
      readonly receivedAt: string;
      readonly reason?: string;
    };
