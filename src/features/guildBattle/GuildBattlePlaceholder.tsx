import { useMemo, useState, type FormEvent } from "react";
import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { createGvgScopeLabel } from "../gvg/createGvgScopeLabel";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import { DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS } from "./settings";
import { createOwnedCastleViewModels } from "./selectors";
import type { GuildBattleOwnedCastleViewModel } from "./types";

interface GuildBattlePlaceholderProps {
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
}

export function GuildBattlePlaceholder({
  loadSnapshot = loadLocalGvgSnapshot
}: GuildBattlePlaceholderProps) {
  const [worldId, setWorldId] = useState("1001");
  const [ownGuildId, setOwnGuildId] = useState("");
  const [loadState, setLoadState] = useState<AsyncLoadState<GvgSnapshot>>({ status: "idle" });

  const trimmedWorldId = worldId.trim();
  const trimmedOwnGuildId = ownGuildId.trim();
  const isLoading = loadState.status === "loading";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedWorldId.length === 0) {
      setLoadState({ status: "error", error: new Error("worldIdを入力してください。") });
      return;
    }

    setLoadState({ status: "loading" });

    try {
      const snapshot = await loadSnapshot(trimmedWorldId as GvgWorldId);
      setLoadState({ status: "success", data: snapshot });
    } catch (error) {
      setLoadState({
        status: "error",
        error: error instanceof Error ? error : new Error("初期状態の取得に失敗しました。")
      });
    }
  }

  return (
    <main className="app-shell">
      <section className="placeholder monitor-panel" aria-labelledby="app-title">
        <p className="placeholder__eyebrow">{createGvgScopeLabel()}</p>
        <h1 className="placeholder__title" id="app-title">
          GuildBattleMonitor
        </h1>
        <p className="placeholder__description">
          REST初期状態から正規化済みスナップショットを取得し、自ギルドの防衛拠点だけを表示します。
        </p>

        <form className="load-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">worldId</span>
            <input
              className="field__input"
              type="text"
              value={worldId}
              onChange={(event) => setWorldId(event.target.value)}
              disabled={isLoading}
              inputMode="numeric"
            />
          </label>
          <label className="field">
            <span className="field__label">自ギルドID</span>
            <input
              className="field__input field__input--wide"
              type="text"
              value={ownGuildId}
              onChange={(event) => setOwnGuildId(event.target.value)}
              disabled={isLoading}
              inputMode="numeric"
            />
          </label>
          <button
            className="load-form__button"
            type="submit"
            disabled={isLoading || trimmedWorldId.length === 0}
          >
            初期状態を取得
          </button>
        </form>

        <SnapshotStatus loadState={loadState} ownGuildId={trimmedOwnGuildId} />
      </section>
    </main>
  );
}

function SnapshotStatus({
  loadState,
  ownGuildId
}: {
  readonly loadState: AsyncLoadState<GvgSnapshot>;
  readonly ownGuildId: string;
}) {
  if (loadState.status === "idle") {
    return <p className="status-message">未取得です。</p>;
  }

  if (loadState.status === "loading") {
    return (
      <p className="status-message" aria-live="polite">
        取得中です。
      </p>
    );
  }

  if (loadState.status === "error") {
    return (
      <p className="status-message status-message--error" role="alert">
        {loadState.error.message}
      </p>
    );
  }

  return <SnapshotSummary ownGuildId={ownGuildId} snapshot={loadState.data} />;
}

function SnapshotSummary({
  ownGuildId,
  snapshot
}: {
  readonly ownGuildId: string;
  readonly snapshot: GvgSnapshot;
}) {
  const ownedCastleViewModels = useMemo(() => {
    if (ownGuildId.length === 0) {
      return [];
    }

    return createOwnedCastleViewModels(snapshot, {
      ownGuildId: ownGuildId as GvgGuildId,
      alertThresholds: DEFAULT_GUILD_BATTLE_ALERT_THRESHOLDS
    });
  }, [ownGuildId, snapshot]);

  return (
    <section className="snapshot-summary" aria-labelledby="snapshot-title">
      <h2 className="snapshot-summary__title" id="snapshot-title">
        取得結果
      </h2>
      <dl className="summary-grid">
        <div>
          <dt>worldId</dt>
          <dd>{snapshot.worldId}</dd>
        </div>
        <div>
          <dt>castles</dt>
          <dd>{snapshot.castles.length}</dd>
        </div>
        <div>
          <dt>guilds</dt>
          <dd>{Object.keys(snapshot.guildNames).length}</dd>
        </div>
        <div>
          <dt>capturedAt</dt>
          <dd>{snapshot.capturedAt}</dd>
        </div>
      </dl>

      {ownGuildId.length === 0 ? (
        <p className="status-message">自ギルドIDを入力してください。</p>
      ) : (
        <OwnedCastleList capturedAt={snapshot.capturedAt} viewModels={ownedCastleViewModels} />
      )}
    </section>
  );
}

function OwnedCastleList({
  capturedAt,
  viewModels
}: {
  readonly capturedAt: string;
  readonly viewModels: readonly GuildBattleOwnedCastleViewModel[];
}) {
  if (viewModels.length === 0) {
    return <p className="status-message">自ギルドの防衛拠点はありません。</p>;
  }

  return (
    <div className="castle-list" aria-label="owned castle list">
      <div className="castle-list__header castle-list__header--owned">
        <span>拠点ID</span>
        <span>防衛数</span>
        <span>侵攻数</span>
        <span>状態</span>
        <span>アラート</span>
        <span>攻撃ギルドID</span>
        <span>攻撃ギルド名</span>
        <span>最終取得時刻</span>
      </div>
      {viewModels.map((viewModel) => (
        <div className="castle-list__row castle-list__row--owned" key={viewModel.castleId}>
          <span>{viewModel.castleId}</span>
          <span>{viewModel.defenseCount}</span>
          <span>{viewModel.attackCount}</span>
          <span>{viewModel.state}</span>
          <span className={`alert-level alert-${viewModel.alertLevel}`}>
            {viewModel.alertLevel}
          </span>
          <span>{viewModel.attackerGuildId ?? "-"}</span>
          <span>{viewModel.attackerGuildName ?? "-"}</span>
          <span>{capturedAt}</span>
        </div>
      ))}
    </div>
  );
}
