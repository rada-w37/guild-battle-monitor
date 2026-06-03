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

export function isDefenseSecured(defenseCount: number, now: Date): boolean {
  return defenseCount > getBattleEndRemainingSeconds(now);
}
