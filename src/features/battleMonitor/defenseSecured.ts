export const BATTLE_END_TIME = {
  hour: 21,
  minute: 30,
  second: 0
} as const;

export function getBattleEndRemainingSeconds(now: Date): number {
  const battleEnd = new Date(now);
  battleEnd.setHours(BATTLE_END_TIME.hour, BATTLE_END_TIME.minute, BATTLE_END_TIME.second, 0);

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
