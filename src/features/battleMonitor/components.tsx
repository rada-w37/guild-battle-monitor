import type { BattleMonitorCastleViewModel, BattleMonitorGuildCandidateViewModel } from "./types";

const ATTACK_ICON_VIEW_BOX = "140 140 980 980";
const ATTACK_ICON_FILL = "#f2483a";
const ATTACK_ICON_PATHS = [
  "M 233 168 L 226 181 L 231 316 L 236 336 L 243 350 L 273 382 L 499 604 L 498 610 L 458 653 L 452 653 L 419 620 L 409 616 L 392 618 L 334 676 L 329 688 L 329 697 L 334 709 L 374 751 L 375 756 L 226 911 L 218 930 L 217 956 L 221 971 L 234 992 L 250 1006 L 273 1016 L 300 1017 L 319 1011 L 331 1003 L 472 860 L 477 860 L 527 909 L 543 912 L 554 908 L 614 851 L 619 838 L 618 828 L 612 817 L 579 783 L 579 779 L 610 750 L 647 720 L 712 771 L 712 776 L 671 819 L 667 828 L 666 838 L 671 852 L 725 906 L 738 911 L 745 911 L 756 907 L 808 856 L 814 855 L 941 985 L 966 1008 L 986 1016 L 1006 1017 L 1025 1012 L 1043 1001 L 1060 982 L 1069 961 L 1070 934 L 1067 923 L 1058 907 L 913 759 L 912 751 L 951 708 L 955 698 L 955 687 L 951 677 L 906 630 L 892 618 L 875 616 L 865 620 L 837 648 L 832 648 L 791 598 L 423 213 L 397 200 L 255 163 L 243 163 Z",
  "M 1053 166 L 1047 163 L 1034 163 L 888 201 L 867 211 L 809 271 L 674 419 L 820 573 L 1035 363 L 1047 347 L 1053 334 L 1057 317 L 1062 180 L 1060 174 Z"
];

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
  const showGuildRelation = viewModels.some((viewModel) => viewModel.guildRelation !== "none");

  if (viewModels.length === 0) {
    return <p className="status-message">表示できる拠点がありません。</p>;
  }

  const list = (
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

  if (!showGuildRelation) {
    return list;
  }

  return (
    <>
      <GuildRelationLegend />
      {list}
    </>
  );
}

function GuildRelationLegend() {
  return (
    <div className="castle-list__legend" aria-label="状態アイコンの凡例">
      <span className="castle-list__legend-item">
        <GuildRelationIcon relation="defense" />
        <span>防衛拠点</span>
      </span>
      <span className="castle-list__legend-item">
        <GuildRelationIcon relation="securedDefense" />
        <span>防衛確定</span>
      </span>
      <span className="castle-list__legend-item">
        <GuildRelationIcon relation="attack" />
        <span>侵攻拠点</span>
      </span>
    </div>
  );
}

function GuildRelationIcon({ relation }: { readonly relation: BattleMonitorCastleViewModel["guildRelation"] }) {
  if (relation === "defense") {
    return (
      <svg className="castle-list__relation-icon castle-list__relation-icon--defense" viewBox="0 0 24 24" aria-label="防衛拠点">
        <path d="M12 2.2 4.5 5v6.3c0 4.7 3 8.9 7.5 10.5 4.5-1.6 7.5-5.8 7.5-10.5V5L12 2.2Zm0 2.2 5.5 2v4.9c0 3.5-2.1 6.7-5.5 8.4-3.4-1.7-5.5-4.9-5.5-8.4V6.4l5.5-2Z" />
      </svg>
    );
  }

  if (relation === "securedDefense") {
    return (
      <svg className="castle-list__relation-icon castle-list__relation-icon--secured" viewBox="0 0 24 24" aria-label="防衛確定">
        <path d="M12 2.8 5.2 5.3v5.8c0 4.2 2.7 8.1 6.8 9.6 4.1-1.5 6.8-5.4 6.8-9.6V5.3L12 2.8Zm3.8 8.1-4.7 4.7-2.6-2.6 1.4-1.4 1.2 1.2 3.3-3.3 1.4 1.4Z" />
      </svg>
    );
  }

  if (relation === "attack") {
    return (
      <svg className="castle-list__relation-icon castle-list__relation-icon--attack" viewBox={ATTACK_ICON_VIEW_BOX} aria-label="侵攻拠点">
        {ATTACK_ICON_PATHS.map((path) => (
          <path key={path} fill={ATTACK_ICON_FILL} d={path} />
        ))}
      </svg>
    );
  }

  return null;
}
