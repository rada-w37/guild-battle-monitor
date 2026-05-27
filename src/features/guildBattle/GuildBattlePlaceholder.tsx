import { useState, type FormEvent } from "react";
import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { createGvgScopeLabel } from "../gvg/createGvgScopeLabel";
import { loadLocalGvgSnapshot } from "../gvg/localGvgService";
import type { GvgSnapshot, GvgWorldId } from "../gvg/types";

interface GuildBattlePlaceholderProps {
  readonly loadSnapshot?: typeof loadLocalGvgSnapshot;
}

export function GuildBattlePlaceholder({
  loadSnapshot = loadLocalGvgSnapshot
}: GuildBattlePlaceholderProps) {
  const [worldId, setWorldId] = useState("1001");
  const [loadState, setLoadState] = useState<AsyncLoadState<GvgSnapshot>>({ status: "idle" });

  const trimmedWorldId = worldId.trim();
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
          REST初期状態を取得し、正規化済みのGvGスナップショット概要だけを表示します。
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
          <button className="load-form__button" type="submit" disabled={isLoading || trimmedWorldId.length === 0}>
            初期状態を取得
          </button>
        </form>

        <SnapshotStatus loadState={loadState} />
      </section>
    </main>
  );
}

function SnapshotStatus({ loadState }: { readonly loadState: AsyncLoadState<GvgSnapshot> }) {
  if (loadState.status === "idle") {
    return <p className="status-message">未取得です。</p>;
  }

  if (loadState.status === "loading") {
    return <p className="status-message" aria-live="polite">取得中です。</p>;
  }

  if (loadState.status === "error") {
    return (
      <p className="status-message status-message--error" role="alert">
        {loadState.error.message}
      </p>
    );
  }

  return <SnapshotSummary snapshot={loadState.data} />;
}

function SnapshotSummary({ snapshot }: { readonly snapshot: GvgSnapshot }) {
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

      <div className="castle-list" aria-label="castle list">
        <div className="castle-list__header">
          <span>castleId</span>
          <span>ownerGuildId</span>
          <span>attackerGuildId</span>
          <span>defense</span>
          <span>attack</span>
          <span>state</span>
        </div>
        {snapshot.castles.map((castle) => (
          <div className="castle-list__row" key={castle.castleId}>
            <span>{castle.castleId}</span>
            <span>{castle.ownerGuildId ?? "-"}</span>
            <span>{castle.attackerGuildId ?? "-"}</span>
            <span>{castle.defenseCount}</span>
            <span>{castle.attackCount}</span>
            <span>{castle.state}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
