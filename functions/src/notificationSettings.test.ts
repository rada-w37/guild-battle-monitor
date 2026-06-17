import { describe, expect, it } from "vitest";
import {
  handleDeleteNotificationRule,
  handleGetNotificationSettings,
  handleSaveNotificationDestination,
  handleSaveNotificationRule
} from "./notificationSettings.js";

describe("notification settings callables", () => {
  it("returns rules and the webhook destination to the guild owner", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-1": createRule({ name: "Owner Rule" }),
      "guildShares/guild-1/notificationDestinations/discord": createDestination({
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123/token"
      })
    });

    await expect(
      handleGetNotificationSettings({ guildId: "guild-1" }, { authUid: "owner-uid" }, createDependencies(firestore))
    ).resolves.toMatchObject({
      rules: [{ id: "rule-1", name: "Owner Rule" }],
      destination: {
        id: "discord",
        type: "discord_webhook",
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123/token"
      }
    });
  });

  it("returns rules without the webhook destination to admin access", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-1": createRule({ name: "Admin Rule" }),
      "guildShares/guild-1/notificationDestinations/discord": createDestination({
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123/token"
      })
    });

    await expect(
      handleGetNotificationSettings(
        { guildId: "guild-1", accessKey: "a_admin" },
        { authUid: null },
        createDependencies(firestore)
      )
    ).resolves.toEqual({
      rules: [
        expect.objectContaining({
          id: "rule-1",
          name: "Admin Rule"
        })
      ]
    });
  });

  it("rejects viewer, anonymous, and signed-in non-owner access", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare()
    });
    const dependencies = createDependencies(firestore);

    await expect(
      handleGetNotificationSettings({ guildId: "guild-1", accessKey: "g_viewer" }, { authUid: null }, dependencies)
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      handleGetNotificationSettings({ guildId: "guild-1" }, { authUid: null }, dependencies)
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      handleGetNotificationSettings({ guildId: "guild-1" }, { authUid: "other-uid" }, dependencies)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("creates a rule with server-managed create metadata and no body id", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare()
    });

    await expect(
      handleSaveNotificationRule(
        {
          guildId: "guild-1",
          rule: {
            ...createRuleInput(),
            id: "client-id",
            createdAt: "client-created",
            createdByRole: "admin",
            updatedAt: "client-updated"
          }
        },
        { authUid: "owner-uid" },
        createDependencies(firestore)
      )
    ).resolves.toMatchObject({
      id: "generated-rule",
      createdAt: "now-1",
      createdByRole: "guildOwner",
      updatedAt: "now-1"
    });

    expect(firestore.writes).toEqual([
      expect.objectContaining({
        path: "guildShares/guild-1/notificationRules/generated-rule",
        data: expect.objectContaining({
          createdAt: "now-1",
          createdByRole: "guildOwner",
          updatedAt: "now-1"
        }),
        options: { merge: false }
      })
    ]);
    expect(firestore.writes[0].data).not.toHaveProperty("id");
  });

  it("updates a rule while preserving createdAt and createdByRole", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-1": createRule({
        createdAt: "created-before",
        createdByRole: "admin",
        name: "Before"
      })
    });

    await expect(
      handleSaveNotificationRule(
        {
          guildId: "guild-1",
          accessKey: "a_admin",
          ruleId: "rule-1",
          rule: {
            ...createRuleInput(),
            name: "After",
            createdAt: "client-created",
            createdByRole: "guildOwner",
            updatedByRole: "admin"
          }
        },
        { authUid: null },
        createDependencies(firestore)
      )
    ).resolves.toMatchObject({
      id: "rule-1",
      name: "After",
      createdAt: "created-before",
      createdByRole: "admin",
      updatedAt: "now-1"
    });

    expect(firestore.writes[0].data).toMatchObject({
      createdAt: "created-before",
      createdByRole: "admin",
      updatedAt: "now-1"
    });
    expect(firestore.writes[0].data).not.toHaveProperty("updatedByRole");
  });

  it("allows an empty webhook URL only when destination is disabled", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare()
    });
    const dependencies = createDependencies(firestore);

    await expect(
      handleSaveNotificationDestination(
        { guildId: "guild-1", destination: { enabled: true, webhookUrl: "" } },
        { authUid: "owner-uid" },
        dependencies
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });

    await expect(
      handleSaveNotificationDestination(
        { guildId: "guild-1", destination: { enabled: false, webhookUrl: "" } },
        { authUid: "owner-uid" },
        dependencies
      )
    ).resolves.toMatchObject({
      enabled: false,
      webhookUrl: ""
    });
  });

  it("rejects non-Discord webhook URLs and admin destination saves", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare()
    });
    const dependencies = createDependencies(firestore);

    await expect(
      handleSaveNotificationDestination(
        { guildId: "guild-1", destination: { enabled: true, webhookUrl: "https://example.com/webhook" } },
        { authUid: "owner-uid" },
        dependencies
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });

    await expect(
      handleSaveNotificationDestination(
        {
          guildId: "guild-1",
          accessKey: "a_admin",
          destination: { enabled: true, webhookUrl: "https://discord.com/api/webhooks/123/token" }
        },
        { authUid: null },
        dependencies
      )
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("deletes rules for admin access", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-1": createRule()
    });

    await expect(
      handleDeleteNotificationRule(
        { guildId: "guild-1", accessKey: "a_admin", ruleId: "rule-1" },
        { authUid: null },
        createDependencies(firestore)
      )
    ).resolves.toEqual({ ok: true });

    expect(firestore.deletes).toEqual(["guildShares/guild-1/notificationRules/rule-1"]);
  });
});

function createShare() {
  return {
    guildOwnerUid: "owner-uid",
    adminAccessKey: "a_admin",
    guestAccessKey: "g_viewer"
  };
}

function createRule(overrides: Record<string, unknown> = {}) {
  return {
    ...createRuleInput(),
    createdAt: "created-at",
    createdByRole: "guildOwner",
    updatedAt: "updated-at",
    ...overrides
  };
}

function createRuleInput() {
  return {
    battleType: "guildBattle",
    name: "見落とし防止",
    enabled: true,
    conditions: {
      startTime: "21:00",
      defenseCountMax: 20,
      attackCountMin: 15
    },
    message: {
      usernameTemplate: "ギルバト監視BOT - {拠点名}",
      mention: { type: "here" },
      titleTemplate: "⚠ {拠点名}が攻撃されています！",
      bodyTemplate: "{拠点名}が{侵攻ギルド}から攻撃を受けています。"
    }
  };
}

function createDestination(overrides: Record<string, unknown>) {
  return {
    type: "discord_webhook",
    createdAt: "created-at",
    updatedAt: "updated-at",
    ...overrides
  };
}

function createDependencies(firestore: ReturnType<typeof createFirestore>) {
  let nowIndex = 0;

  return {
    firestore,
    now: () => {
      nowIndex += 1;
      return `now-${nowIndex}` as never;
    },
    createRuleId: () => "generated-rule"
  };
}

function createFirestore(documents: Record<string, Record<string, unknown>>) {
  const writes: Array<{
    readonly path: string;
    readonly data: Record<string, unknown>;
    readonly options?: { readonly merge: boolean };
  }> = [];
  const deletes: string[] = [];

  function createDocumentRef(path: string) {
    return {
      id: path.split("/").at(-1) ?? path,
      get: async () => ({
        exists: Object.prototype.hasOwnProperty.call(documents, path),
        id: path.split("/").at(-1) ?? path,
        data: () => documents[path]
      }),
      set: async (data: Record<string, unknown>, options?: { readonly merge: boolean }) => {
        writes.push({ path, data, options });
        documents[path] = data;
      },
      delete: async () => {
        deletes.push(path);
        delete documents[path];
      }
    };
  }

  return {
    writes,
    deletes,
    doc: createDocumentRef,
    collection: (path: string) => ({
      doc: (id = "generated-rule") => createDocumentRef(`${path}/${id}`),
      get: async () => ({
        docs: Object.entries(documents)
          .filter(([documentPath]) => documentPath.startsWith(`${path}/`))
          .map(([documentPath, data]) => ({
            exists: true,
            id: documentPath.slice(path.length + 1),
            data: () => data
          }))
      })
    })
  };
}
