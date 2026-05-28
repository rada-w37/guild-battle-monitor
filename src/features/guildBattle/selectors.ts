import { normalizeGvgGuildIdForComparison } from "../gvg/guildId";
import type { GvgCastle, GvgGuildId, GvgSnapshot } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import type {
  GuildBattleAlertLevel,
  GuildBattleAlertThresholds,
  GuildBattleCastleDisplayViewModel,
  GuildBattleCastleListSortMode,
  GuildBattleCastleSummaryViewModel,
  GuildBattleCastleViewModel,
  GuildBattleGuildCandidateViewModel,
  GuildBattleMonitorSettings,
  GuildBattleOwnedCastleViewModel
} from "./types";

const ALERT_LEVEL_PRIORITY: Record<GuildBattleAlertLevel, number> = {
  critical: 0,
  danger: 1,
  warning: 2,
  safe: 3
};

export function isOwnedCastle(castle: GvgCastle, ownGuildId: GvgGuildId): boolean {
  const ownerGuildId = normalizeGvgGuildIdForComparison(castle.ownerGuildId);
  const normalizedOwnGuildId = normalizeGvgGuildIdForComparison(ownGuildId);

  return ownerGuildId !== null && ownerGuildId === normalizedOwnGuildId;
}

export function isCastleUnderAttack(
  castle: GvgCastle,
  thresholds: GuildBattleAlertThresholds = DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
): boolean {
  return castle.attackCount > 0 || thresholds.criticalStates.includes(castle.state);
}

export function isCastleFallen(castle: GvgCastle): boolean {
  return castle.state === "fallen" || castle.status === "fallen";
}

export function getDefenseAlertLevel(
  castle: Pick<GvgCastle, "attackCount" | "defenseCount" | "state">,
  thresholds: GuildBattleAlertThresholds = DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
): GuildBattleAlertLevel {
  if (castle.attackCount > 0 || thresholds.criticalStates.includes(castle.state)) {
    return "critical";
  }

  if (castle.defenseCount <= thresholds.dangerDefenseCount) {
    return "danger";
  }

  if (castle.defenseCount <= thresholds.warningDefenseCount) {
    return "warning";
  }

  return "safe";
}

export function createOwnedCastleViewModels(
  snapshot: GvgSnapshot,
  settings: GuildBattleMonitorSettings
): GuildBattleOwnedCastleViewModel[] {
  return snapshot.castles
    .filter((castle) => isOwnedCastle(castle, settings.ownGuildId))
    .map((castle) => createCastleViewModel(snapshot, castle, settings.alertThresholds));
}

export function createAllCastleViewModels(
  snapshot: GvgSnapshot,
  thresholds: GuildBattleAlertThresholds = DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
): GuildBattleCastleViewModel[] {
  return snapshot.castles.map((castle) => createCastleViewModel(snapshot, castle, thresholds));
}

export function createGuildBattleCastleDisplayViewModel(
  snapshot: GvgSnapshot,
  settings: {
    readonly ownGuildId: GvgGuildId | "";
    readonly alertThresholds: GuildBattleAlertThresholds;
  }
): GuildBattleCastleDisplayViewModel {
  if (settings.ownGuildId.length === 0) {
    return {
      mode: "allCastles",
      reason: "ownGuildUnspecified",
      castles: createAllCastleViewModels(snapshot, settings.alertThresholds)
    };
  }

  const ownedCastles = createOwnedCastleViewModels(snapshot, {
    ownGuildId: settings.ownGuildId as GvgGuildId,
    alertThresholds: settings.alertThresholds
  });

  if (ownedCastles.length > 0) {
    return {
      mode: "ownedCastles",
      reason: "ownedCastlesFound",
      castles: ownedCastles
    };
  }

  return {
    mode: "allCastles",
    reason: "ownedCastlesNotFound",
    castles: createAllCastleViewModels(snapshot, settings.alertThresholds)
  };
}

export function sortGuildBattleCastleViewModels(
  viewModels: readonly GuildBattleCastleViewModel[],
  sortMode: GuildBattleCastleListSortMode
): GuildBattleCastleViewModel[] {
  return [...viewModels].sort((left, right) => {
    if (sortMode === "alertLevel") {
      const alertDiff = ALERT_LEVEL_PRIORITY[left.alertLevel] - ALERT_LEVEL_PRIORITY[right.alertLevel];

      if (alertDiff !== 0) {
        return alertDiff;
      }
    }

    return compareCastleId(left.castleId, right.castleId);
  });
}

export function createGuildBattleCastleSummaryViewModel(
  viewModels: readonly GuildBattleCastleViewModel[],
  mode: GuildBattleCastleDisplayViewModel["mode"]
): GuildBattleCastleSummaryViewModel {
  return {
    totalCount: viewModels.length,
    safeCount: countAlertLevel(viewModels, "safe"),
    warningCount: countAlertLevel(viewModels, "warning"),
    dangerCount: countAlertLevel(viewModels, "danger"),
    criticalCount: countAlertLevel(viewModels, "critical"),
    mode
  };
}

export function createGuildBattleGuildCandidates(
  snapshot: GvgSnapshot
): GuildBattleGuildCandidateViewModel[] {
  const candidateMap = new Map<GvgGuildId, GuildBattleGuildCandidateViewModel>();

  for (const castle of snapshot.castles) {
    if (castle.ownerGuildId === null) {
      continue;
    }

    const existingCandidate = candidateMap.get(castle.ownerGuildId);

    if (existingCandidate) {
      candidateMap.set(castle.ownerGuildId, {
        ...existingCandidate,
        ownedCastleCount: existingCandidate.ownedCastleCount + 1
      });
      continue;
    }

    candidateMap.set(castle.ownerGuildId, {
      guildId: castle.ownerGuildId,
      guildName: snapshot.guildNames[castle.ownerGuildId] ?? `Guild ${castle.ownerGuildId}`,
      ownedCastleCount: 1
    });
  }

  return [...candidateMap.values()].sort((left, right) => {
    const countDiff = right.ownedCastleCount - left.ownedCastleCount;

    if (countDiff !== 0) {
      return countDiff;
    }

    return left.guildName.localeCompare(right.guildName);
  });
}

function createCastleViewModel(
  snapshot: GvgSnapshot,
  castle: GvgCastle,
  thresholds: GuildBattleAlertThresholds
): GuildBattleCastleViewModel {
  return {
    castleId: castle.castleId,
    ownerGuildId: castle.ownerGuildId,
    ownerGuildName: castle.ownerGuildId === null ? "Unknown guild" : snapshot.guildNames[castle.ownerGuildId] ?? "Unknown guild",
    attackerGuildId: castle.attackerGuildId,
    attackerGuildName:
      castle.attackerGuildId === null ? null : snapshot.guildNames[castle.attackerGuildId] ?? null,
    state: castle.state,
    defenseCount: castle.defenseCount,
    attackCount: castle.attackCount,
    alertLevel: getDefenseAlertLevel(castle, thresholds)
  };
}

function compareCastleId(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function countAlertLevel(
  viewModels: readonly GuildBattleCastleViewModel[],
  alertLevel: GuildBattleAlertLevel
): number {
  return viewModels.filter((viewModel) => viewModel.alertLevel === alertLevel).length;
}
