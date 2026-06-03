export const BATTLE_END_TIME = {
  hour: 21,
  minute: 30,
  second: 0
} as const;

const JST_OFFSET_HOURS = 9;
const JST_OFFSET_MS = JST_OFFSET_HOURS * 60 * 60 * 1000;

export function getBattleEndRemainingSeconds(now: Date): number {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const battleEnd = new Date(
    Date.UTC(
      jstNow.getUTCFullYear(),
      jstNow.getUTCMonth(),
      jstNow.getUTCDate(),
      BATTLE_END_TIME.hour - JST_OFFSET_HOURS,
      BATTLE_END_TIME.minute,
      BATTLE_END_TIME.second,
      0
    )
  );

  return Math.max(0, Math.ceil((battleEnd.getTime() - now.getTime()) / 1000));
}

export function isDefenseSecured({
  attackerGuildId,
  defenseCount,
  now,
  ownerGuildId
}: {
  readonly attackerGuildId: string | number | null | undefined;
  readonly defenseCount: number;
  readonly now: Date;
  readonly ownerGuildId: string | number | null | undefined;
}): boolean {
  if (hasGuildId(ownerGuildId) && !hasGuildId(attackerGuildId)) {
    return true;
  }

  return defenseCount > getBattleEndRemainingSeconds(now);
}

function hasGuildId(guildId: string | number | null | undefined): boolean {
  if (guildId === null || guildId === undefined) {
    return false;
  }

  const normalizedGuildId = String(guildId).trim();

  return normalizedGuildId.length > 0 && normalizedGuildId !== "0";
}
