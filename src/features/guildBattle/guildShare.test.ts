import { describe, expect, it } from "vitest";
import { createGuildShare, createGuildShareUrl } from "./guildShare";

describe("guildShare", () => {
  it("creates prefixed admin and guest access keys", () => {
    const share = createGuildShare("12345");

    expect(share.guildId).toBe("12345");
    expect(share.adminAccessKey).toMatch(/^a_[a-z0-9]{12}$/);
    expect(share.guestAccessKey).toMatch(/^g_[a-z0-9]{12}$/);
    expect(share.adminAccessKey).not.toBe(share.guestAccessKey);
  });

  it("creates an absolute shared URL", () => {
    expect(createGuildShareUrl("https://example.com/", "12345", "a_abc")).toBe(
      "https://example.com/12345/a_abc"
    );
  });
});
