import { describe, expect, it } from "vitest";
import {
  handleDeleteNotificationRule,
  handleGetNotificationSettings,
  handleSaveNotificationDestination,
  handleSaveNotificationRule,
  shouldReadNotificationRuleV2Document,
  validateNotificationRuleV2Input
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

  it("accepts v2 notification rule validation with here and everyone mentions", () => {
    expect(validateNotificationRuleV2Input(createRuleV2Input({ mention: { type: "here" } }))).toMatchObject({
      schemaVersion: 2,
      message: { mention: { type: "here" } }
    });

    expect(validateNotificationRuleV2Input(createRuleV2Input({ mention: { type: "everyone" } }))).toMatchObject({
      schemaVersion: 2,
      message: { mention: { type: "everyone" } }
    });
  });

  it("prepares v2 document filtering without switching the get settings path", () => {
    expect(shouldReadNotificationRuleV2Document(createRuleV2Input())).toBe(true);
    expect(shouldReadNotificationRuleV2Document(createRule())).toBe(false);
    expect(shouldReadNotificationRuleV2Document(undefined)).toBe(false);
  });

  it("rejects v2 rules when the root detail condition operator is not OR", () => {
    expect(() =>
      validateNotificationRuleV2Input(
        createRuleV2Input({
          detailConditions: {
            operator: "AND",
            children: [
              {
                type: "group",
                operator: "AND",
                children: [{ type: "condition", field: "defenseCount", operator: "<=", value: 30 }]
              }
            ]
          }
        })
      )
    ).toThrowError(expect.objectContaining({ code: "invalid-argument" }));
  });

  it("rejects v2 temporary suspension without a safe role or uid", () => {
    expect(() =>
      validateNotificationRuleV2Input(
        createRuleV2Input({
          temporarySuspension: {
            suspendedAt: "2026-06-20T12:00:00.000Z",
            expiresAt: "2026-06-20T13:00:00.000Z",
            suspendedBy: {}
          }
        })
      )
    ).toThrowError(expect.objectContaining({ code: "invalid-argument" }));
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

function createRuleV2Input(
  overrides: {
    readonly mention?: { readonly type: string; readonly customText?: string };
    readonly detailConditions?: Record<string, unknown>;
    readonly temporarySuspension?: Record<string, unknown>;
  } = {}
) {
  return {
    schemaVersion: 2,
    battleType: "guildBattle",
    name: "見落とし防止",
    enabled: true,
    sortOrder: 0,
    schedule: {
      startTime: "21:00",
      endTime: null
    },
    targetGuildIds: [],
    detailConditions: overrides.detailConditions ?? {
      operator: "OR",
      children: [
        {
          type: "group",
          operator: "AND",
          children: [
            { type: "condition", field: "defenseCount", operator: "<=", value: 30 },
            { type: "condition", field: "attackCount", operator: ">=", value: 1 }
          ]
        }
      ]
    },
    message: {
      usernameTemplate: "ギルバト監視BOT - {拠点名}",
      mention: overrides.mention ?? { type: "none" },
      titleTemplate: "⚠ {拠点名}が攻撃されています！",
      bodyTemplate: "{拠点名}が{侵攻ギルド}から攻撃を受けています。"
    },
    ...(overrides.temporarySuspension === undefined
      ? {}
      : { temporarySuspension: overrides.temporarySuspension })
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
