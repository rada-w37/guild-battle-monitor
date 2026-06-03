import { describe, expect, it } from "vitest";
import { isDefenseSecured } from "./defenseSecured";

const currentTime = new Date("2026-05-27T21:29:50.000+09:00");

describe("defense secured", () => {
  it("secures owned castles without declaration regardless of remaining seconds", () => {
    expect(
      isDefenseSecured({
        attackerGuildId: null,
        defenseCount: 0,
        now: currentTime,
        ownerGuildId: "owner"
      })
    ).toBe(true);
  });

  it("uses defense count against remaining seconds when declared", () => {
    expect(
      isDefenseSecured({
        attackerGuildId: "attacker",
        defenseCount: 11,
        now: currentTime,
        ownerGuildId: "owner"
      })
    ).toBe(true);
    expect(
      isDefenseSecured({
        attackerGuildId: "attacker",
        defenseCount: 10,
        now: currentTime,
        ownerGuildId: "owner"
      })
    ).toBe(false);
  });

  it("does not force-secure unowned castles without declaration", () => {
    expect(
      isDefenseSecured({
        attackerGuildId: null,
        defenseCount: 0,
        now: currentTime,
        ownerGuildId: null
      })
    ).toBe(false);
  });
});
