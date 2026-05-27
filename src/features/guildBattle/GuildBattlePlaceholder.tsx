import { createGvgScopeLabel } from "../gvg/createGvgScopeLabel";

export function GuildBattlePlaceholder() {
  return (
    <main className="app-shell">
      <section className="placeholder" aria-labelledby="app-title">
        <p className="placeholder__eyebrow">{createGvgScopeLabel()}</p>
        <h1 className="placeholder__title" id="app-title">
          GuildBattleMonitor
        </h1>
        <p className="placeholder__description">
          Step0: GitHub Pages 公開前提の Vite + React + TypeScript 基盤です。
        </p>
      </section>
    </main>
  );
}
