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
  if (viewModels.length === 0) {
    return <p className="status-message">表示できる拠点がありません。</p>;
  }

  return (
    <div
      className={`castle-list${showOwnerGuild ? " castle-list--with-owner" : ""}${
        showDevDetails ? " castle-list--with-dev" : ""
      }${isTestModeEnabled ? " castle-list--with-test" : ""}`}
      aria-label="castle list"
    >
      <div className="castle-list__header">
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
          <span className="castle-list__castle" data-label="拠点">
            <strong>{viewModel.castleName}</strong>
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
