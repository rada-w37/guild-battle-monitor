import { useEffect, useState, type PointerEvent } from "react";
import type { BattleMonitorCastleViewModel, BattleMonitorGuildCandidateViewModel } from "./types";

export function BattleMonitorGuildSelect<TGuildId extends string>({
  candidates,
  disabled,
  value,
  onChange
}: {
  readonly candidates: readonly BattleMonitorGuildCandidateViewModel<TGuildId>[];
  readonly disabled: boolean;
  readonly value: TGuildId | "";
  readonly onChange: (guildId: TGuildId | "") => void;
}) {
  return (
    <label className="field guild-select-field">
      <span className="field__label">表示対象ギルド</span>
      <select
        className="field__input field__input--wide"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as TGuildId | "")}
      >
        <option value="">全拠点表示</option>
        {candidates.map((candidate) => (
          <option key={candidate.guildId} value={candidate.guildId}>
            {candidate.guildName} ({candidate.ownedCastleCount})
          </option>
        ))}
      </select>
    </label>
  );
}

export function BattleMonitorCastleList<TCastleId extends string>({
  capturedAt,
  isTestModeEnabled,
  showDevDetails,
  showOwnerGuild,
  viewModels,
  onTestModeDefenseIncrease,
  onTestModeAttackIncrease,
  onTestModeRevive
}: {
  readonly capturedAt: string;
  readonly isTestModeEnabled: boolean;
  readonly showDevDetails: boolean;
  readonly showOwnerGuild: boolean;
  readonly viewModels: readonly BattleMonitorCastleViewModel<TCastleId>[];
  readonly onTestModeDefenseIncrease: (castleId: TCastleId, amount: number) => void;
  readonly onTestModeAttackIncrease: (castleId: TCastleId, amount: number) => void;
  readonly onTestModeRevive: (castleId: TCastleId) => void;
}) {
  const [openDefenseSecuredCastleId, setOpenDefenseSecuredCastleId] = useState<TCastleId | null>(null);
  const showGuildRelation = viewModels.some((viewModel) => viewModel.guildRelation !== "none");

  useEffect(() => {
    if (openDefenseSecuredCastleId === null) {
      return;
    }

    function closeDefenseSecuredBadge() {
      setOpenDefenseSecuredCastleId(null);
    }

    document.addEventListener("pointerdown", closeDefenseSecuredBadge);

    return () => {
      document.removeEventListener("pointerdown", closeDefenseSecuredBadge);
    };
  }, [openDefenseSecuredCastleId]);

  if (viewModels.length === 0) {
    return <p className="status-message">表示できる拠点がありません。</p>;
  }

  return (
    <div
      className={`castle-list${showGuildRelation ? " castle-list--with-relation" : ""}${
        showOwnerGuild ? " castle-list--with-owner" : ""}${
        showDevDetails ? " castle-list--with-dev" : ""
      }${isTestModeEnabled ? " castle-list--with-test" : ""}`}
      aria-label="castle list"
    >
      <div className="castle-list__header">
        {showGuildRelation ? <span aria-hidden="true"></span> : null}
        <span>拠点</span>
        <span>防</span>
        <span>攻</span>
        <span>KO</span>
        {showOwnerGuild ? <span>所有</span> : null}
        <span>攻撃</span>
        {showDevDetails ? <span>更新</span> : null}
        {isTestModeEnabled ? <span>test</span> : null}
      </div>
      {viewModels.map((viewModel) => (
        <div className={`castle-list__row castle-list__row--${viewModel.alertLevel}`} key={viewModel.castleId}>
          {showGuildRelation ? (
            <span className="castle-list__relation" data-label="">
              <GuildRelationIcon relation={viewModel.guildRelation} />
            </span>
          ) : null}
          <span className="castle-list__castle" data-label="拠点">
            <strong>{viewModel.castleName}</strong>
            {viewModel.isDefenseSecured ? (
              <DefenseSecuredBadge
                isOpen={openDefenseSecuredCastleId === viewModel.castleId}
                onToggle={(event) => {
                  event.stopPropagation();
                  setOpenDefenseSecuredCastleId((currentCastleId) =>
                    currentCastleId === viewModel.castleId ? null : viewModel.castleId
                  );
                }}
              />
            ) : null}
          </span>
          <span className="castle-list__count" data-label="防">
            {viewModel.defenseCount}
          </span>
          <span className="castle-list__count" data-label="攻">
            {viewModel.attackCount}
          </span>
          <span className="castle-list__ko" data-label="KO">
            <span className={`ko-value ko-value--${viewModel.koDisplay.tone}`}>
              {viewModel.koDisplay.count}
            </span>
          </span>
          {showOwnerGuild ? (
            <span className="castle-list__guild" data-label="所有">
              {viewModel.ownerGuildName}
            </span>
          ) : null}
          <span className="castle-list__guild" data-label="攻撃">
            {viewModel.attackerGuildName ?? "-"}
          </span>
          {showDevDetails ? (
            <span className="castle-list__updated" data-label="更新">
              {capturedAt}
            </span>
          ) : null}
          {isTestModeEnabled ? (
            <span className="test-mode-actions" data-label="test">
              <button type="button" onClick={() => onTestModeDefenseIncrease(viewModel.castleId, 5)}>
                防 +5
              </button>
              <button type="button" onClick={() => onTestModeDefenseIncrease(viewModel.castleId, 10)}>
                防 +10
              </button>
              <button type="button" onClick={() => onTestModeAttackIncrease(viewModel.castleId, 5)}>
                攻 +5
              </button>
              <button type="button" onClick={() => onTestModeAttackIncrease(viewModel.castleId, 10)}>
                攻 +10
              </button>
              <button type="button" onClick={() => onTestModeRevive(viewModel.castleId)}>
                復帰
              </button>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GuildRelationIcon({ relation }: { readonly relation: BattleMonitorCastleViewModel["guildRelation"] }) {
  if (relation === "defense") {
    return (
      <svg className="castle-list__relation-icon castle-list__relation-icon--defense" viewBox="0 0 24 24" aria-label="防衛中">
        <path d="M12 2.2 4.5 5v6.3c0 4.7 3 8.9 7.5 10.5 4.5-1.6 7.5-5.8 7.5-10.5V5L12 2.2Zm0 2.2 5.5 2v4.9c0 3.5-2.1 6.7-5.5 8.4-3.4-1.7-5.5-4.9-5.5-8.4V6.4l5.5-2Z" />
      </svg>
    );
  }

  if (relation === "attack") {
    return (
      <svg className="castle-list__relation-icon castle-list__relation-icon--attack" viewBox="0 0 24 24" aria-label="攻撃中">
        <path d="m4.5 3.5 6.3 6.3 1.4-1.4 1.4 1.4-2 2 1.6 1.6 2-2 1.4 1.4-1.4 1.4 6.3 6.3-2 2-6.3-6.3-1.4 1.4-1.4-1.4 2-2-1.6-1.6-2 2-1.4-1.4 1.4-1.4-6.3-6.3 2-2Zm15 0 2 2-6.2 6.2-2-2L19.5 3.5Zm-17 17 6.2-6.2 2 2L4.5 22.5l-2-2Z" />
      </svg>
    );
  }

  return null;
}

function DefenseSecuredBadge({
  isOpen,
  onToggle
}: {
  readonly isOpen: boolean;
  readonly onToggle: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <span className="defense-secured-badge-wrap">
      <button
        className="defense-secured-badge"
        type="button"
        aria-label="防衛確定"
        aria-expanded={isOpen}
        title="防衛確定"
        onPointerDown={onToggle}
      >
        <svg className="defense-secured-badge__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8 5.2 5.3v5.8c0 4.2 2.7 8.1 6.8 9.6 4.1-1.5 6.8-5.4 6.8-9.6V5.3L12 2.8Zm3.8 8.1-4.7 4.7-2.6-2.6 1.4-1.4 1.2 1.2 3.3-3.3 1.4 1.4Z" />
        </svg>
      </button>
      <span className="defense-secured-badge__tooltip" role="tooltip">
        防衛確定
      </span>
    </span>
  );
}
