import type { KoMonitorLoadState } from "./types";

export function KoVictimSummaryPanel({ state }: { readonly state: KoMonitorLoadState }) {
  if (state.status === "idle") {
    return null;
  }

  const rows = state.status === "success" || state.status === "error" ? state.rows : [];
  const shouldMaskValues =
    state.status === "error" || (state.status === "success" && !state.isObserverStarted);

  return (
    <section className="ko-victim-summary" aria-labelledby="ko-victim-summary-title">
      <h2 className="ko-victim-summary__title" id="ko-victim-summary-title">
        被KO（推定）
      </h2>
      {state.status === "loading" ? (
        <p className="status-message ko-victim-summary__message" aria-live="polite">
          被KOデータを取得中です。
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="status-message status-message--error ko-victim-summary__message" role="alert">
          KO集計データを取得できませんでした。
        </p>
      ) : null}
      {state.status === "success" && !state.isObserverStarted ? (
        <p className="status-message ko-victim-summary__message">
          KO監視ツールが未起動のため集計できません。
        </p>
      ) : null}
      {state.status === "success" && state.isObserverStarted && rows.length === 0 ? (
        <p className="status-message ko-victim-summary__message">被KOデータがありません。</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="ko-victim-summary__table" aria-label="被KO一覧">
          <div className="ko-victim-summary__header">
            <span>ギルド</span>
            <span>被KO（推定）</span>
          </div>
          {rows.map((row) => (
            <div className="ko-victim-summary__row" key={row.guildId}>
              <span className="ko-victim-summary__guild" data-label="ギルド">
                {row.guildName}
              </span>
              <span className="ko-victim-summary__count" data-label="被KO（推定）">
                {shouldMaskValues || row.totalVictimKoCount === null ? "-" : row.totalVictimKoCount}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
