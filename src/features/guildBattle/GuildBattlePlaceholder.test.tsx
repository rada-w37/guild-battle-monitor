// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuildBattlePlaceholder } from "./GuildBattlePlaceholder";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const snapshot = {
  worldId: "1001" as GvgWorldId,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    ["438130839001" as GvgGuildId]: "Owner Guild"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      worldId: "1001" as GvgWorldId,
      state: "idle",
      status: "normal",
      ownerGuildId: "438130839001" as GvgGuildId,
      attackerGuildId: null,
      defenseCount: 120,
      attackCount: 0
    }
  ]
} satisfies GvgSnapshot;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("GuildBattlePlaceholder", () => {
  it("shows the initial unloaded state", () => {
    renderComponent();

    expect(document.body.textContent).toContain("未取得です。");
    expect(getWorldIdInput().value).toBe("1001");
  });

  it("updates worldId input", () => {
    renderComponent();

    act(() => {
      const input = getWorldIdInput();
      input.value = "2001";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(getWorldIdInput().value).toBe("2001");
  });

  it("calls the loader and renders loading then success", async () => {
    const deferred = createDeferred<GvgSnapshot>();
    const loadSnapshot = vi.fn(() => deferred.promise);
    renderComponent(loadSnapshot);

    await act(async () => {
      getSubmitButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(loadSnapshot).toHaveBeenCalledWith("1001");
    expect(document.body.textContent).toContain("取得中です。");
    expect(getSubmitButton().disabled).toBe(true);

    await act(async () => {
      deferred.resolve(snapshot);
      await deferred.promise;
    });

    expect(document.body.textContent).toContain("取得結果");
    expect(document.body.textContent).toContain("castles");
    expect(document.body.textContent).toContain("438130839001");
    expect(document.body.textContent).toContain("idle");
  });

  it("renders a compact error message", async () => {
    const loadSnapshot = vi.fn(() => Promise.reject(new Error("HTTP 500")));
    renderComponent(loadSnapshot);

    await act(async () => {
      getSubmitButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("HTTP 500");
  });
});

function renderComponent(loadSnapshot?: (worldId: string) => Promise<GvgSnapshot>) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<GuildBattlePlaceholder loadSnapshot={loadSnapshot} />);
  });
}

function getWorldIdInput() {
  const input = document.querySelector<HTMLInputElement>("input");

  if (!input) {
    throw new Error("worldId input was not found");
  }

  return input;
}

function getSubmitButton() {
  const button = document.querySelector<HTMLButtonElement>("button");

  if (!button) {
    throw new Error("submit button was not found");
  }

  return button;
}

function createDeferred<TValue>() {
  let resolve!: (value: TValue) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TValue>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}
