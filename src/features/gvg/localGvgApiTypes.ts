export type LocalGvgApiScalar = string | number | boolean | null;

export interface LocalGvgApiResponse extends Record<string, unknown> {
  readonly status?: number;
  readonly timestamp?: number;
  readonly data?: LocalGvgDataResponse | null;
}

export interface LocalGvgDataResponse extends Record<string, unknown> {
  readonly world_id?: LocalGvgApiScalar;
  readonly castles?: readonly LocalGvgCastleResponse[] | null;
  readonly guilds?: Record<string, string> | null;
}

export interface LocalGvgCastleResponse extends Record<string, unknown> {
  readonly CastleId?: LocalGvgApiScalar;
  readonly GuildId?: LocalGvgApiScalar;
  readonly AttackerGuildId?: LocalGvgApiScalar;
  readonly AttackPartyCount?: LocalGvgApiScalar;
  readonly DefensePartyCount?: LocalGvgApiScalar;
  readonly GvgCastleState?: LocalGvgApiScalar;
  readonly UtcFallenTimeStamp?: LocalGvgApiScalar;
  readonly LastWinPartyKnockOutCount?: LocalGvgApiScalar;
}

export interface LocalGvgGuildResponse extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
}
