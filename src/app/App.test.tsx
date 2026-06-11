// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AppModeProvider, useAppRoute } from "./appMode";

vi.mock("../features/guildBattle/GuildBattlePlaceholder", () => ({
  GuildBattlePlaceholder: () => <main>Guild Battle Monitor</main>
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App routing", () => {
  it("shows a minimal 404 page for an invalid URL", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppModeProvider pathname="/invalid">
          <App />
        </AppModeProvider>
      );
    });

    expect(container.textContent).toContain("ページが見つかりません");
    expect(container.textContent).toContain("Invalid URL");

    act(() => root.unmount());
  });

  it("keeps the existing app available on the root owner URL", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppModeProvider pathname="/">
          <App />
        </AppModeProvider>
      );
    });

    expect(container.textContent).toContain("Guild Battle Monitor");
    expect(container.textContent).not.toContain("Invalid URL");

    act(() => root.unmount());
  });

  it("treats the old /app owner URL as invalid", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppModeProvider pathname="/app">
          <App />
        </AppModeProvider>
      );
    });

    expect(container.textContent).toContain("Invalid URL");
    expect(container.textContent).not.toContain("Guild Battle Monitor");

    act(() => root.unmount());
  });

  it("provides shared route information to app consumers", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppModeProvider pathname="/123/a_abc">
          <RouteProbe />
        </AppModeProvider>
      );
    });

    expect(container.textContent).toBe("admin:123:a_abc");

    act(() => root.unmount());
  });
});

function RouteProbe() {
  const route = useAppRoute();

  if (route === null) {
    return <span>invalid</span>;
  }

  return <span>{route.mode === "owner" ? route.mode : `${route.mode}:${route.guildId}:${route.accessKey}`}</span>;
}
