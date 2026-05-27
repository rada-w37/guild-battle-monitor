// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuildBattlePlaceholder } from "./GuildBattlePlaceholder";
import type { GvgCastleId, GvgGuildId, GvgSnapshot, GvgWorldId } from "../gvg/types";
import type { loadLocalGvgSnapshot } from "../gvg/localGvgService";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ownGuildId = "438130839001" as GvgGuildId;

const snapshot = {
  worldId: "1001" as GvgWorldId,
  capturedAt: "2026-05-27T11:15:36.000Z",
  guildNames: {
    [ownGuildId]: "Owner Guild",
    ["123456789001" as GvgGuildId]: "Attack Guild"
  },
  castles: [
    {
      castleId: "1" as GvgCastleId,
      worldId: "1001" as GvgWorldId,
      state: "idle",
      status: "underAttack",
      ownerGuildId: ownGuildId,
      attackerGuildId: "123456789001" as GvgGuildId,
      defenseCount: 120,
      attackCount: 1
    },
    {
      castleId: "2" as GvgCastleId,
      worldId: "1001" as GvgWorldId,
      state: "idle",
      status: "normal",
      ownerGuildId: "999999999001" as GvgGuildId,
      attackerGuildId: null,
      defenseCount: 40,
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
    expect(getOwnGuildIdInput().value).toBe("");
  });

  it("updates worldId input", () => {
    renderComponent();

    act(() => {
      updateInput(getWorldIdInput(), "2001");
    });

    expect(getWorldIdInput().value).toBe("2001");
  });

  it("calls the loader and renders loading then success guidance without own guild ID", async () => {
    const deferred = createDeferred<GvgSnapshot>();
    const loadSnapshot = vi.fn(() => deferred.promise);
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(loadSnapshot).toHaveBeenCalledWith("1001");
    expect(document.body.textContent).toContain("取得中です。");
    expect(getSubmitButton().disabled).toBe(true);

    await act(async () => {
      deferred.resolve(snapshot);
      await deferred.promise;
    });

    expect(document.body.textContent).toContain("取得結果");
    expect(document.body.textContent).toContain("castles");
    expect(document.body.textContent).toContain("自ギルドIDを入力してください。");
  });

  it("renders owned castle view models after own guild ID input", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), ownGuildId);
    });

    expect(document.body.textContent).toContain("critical");
    expect(document.body.textContent).toContain("Attack Guild");
    expect(document.body.textContent).toContain("123456789001");
    expect(document.body.textContent).toContain("2026-05-27T11:15:36.000Z");
  });

  it("renders an empty owned castle message", async () => {
    const loadSnapshot = vi.fn(() => Promise.resolve(snapshot));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    await act(async () => {
      updateInput(getOwnGuildIdInput(), "111111111001");
    });

    expect(document.body.textContent).toContain("自ギルドの防衛拠点はありません。");
  });

  it("renders a compact error message", async () => {
    const loadSnapshot = vi.fn(() => Promise.reject(new Error("HTTP 500")));
    renderComponent(loadSnapshot);

    await clickSubmitButton();

    expect(document.body.textContent).toContain("HTTP 500");
  });
});

function renderComponent(loadSnapshot?: typeof loadLocalGvgSnapshot) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<GuildBattlePlaceholder loadSnapshot={loadSnapshot} />);
  });
}

async function clickSubmitButton() {
  await act(async () => {
    getSubmitButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getWorldIdInput() {
  return getTextInputs()[0];
}

function getOwnGuildIdInput() {
  return getTextInputs()[1];
}

function getTextInputs() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));

  if (inputs.length < 2) {
    throw new Error("expected worldId and own guild ID inputs");
  }

  return inputs;
}

function getSubmitButton() {
  const button = document.querySelector<HTMLButtonElement>("button");

  if (!button) {
    throw new Error("submit button was not found");
  }

  return button;
}

function updateInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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
