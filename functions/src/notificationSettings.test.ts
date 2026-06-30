import { describe, expect, it } from "vitest";
import {
  handleDeleteNotificationRule,
  handleGetNotificationSettings,
  handleGetNotificationSettingsV2,
  handleSaveNotificationDestination,
  handleSaveNotificationRule,
  handleSaveNotificationRuleV2,
  handleSuspendNotificationRule,
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

  it("returns only schemaVersion 2 rules from the v2 settings path", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/legacy-rule": createRule({ name: "Legacy Rule" }),
      "guildShares/guild-1/notificationRules/v2-rule": {
        ...createRuleV2Input({ name: "V2 Rule", targetGuildIds: ["guild-a"] }),
        createdAt: "created-at",
        createdByRole: "guildOwner",
        updatedAt: "updated-at"
      },
      "guildShares/guild-1/notificationDestinations/discord": createDestination({
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123/token"
      })
    });

    await expect(
      handleGetNotificationSettingsV2({ guildId: "guild-1" }, { authUid: "owner-uid" }, createDependencies(firestore))
    ).resolves.toMatchObject({
      rules: [
        {
          id: "v2-rule",
          schemaVersion: 2,
          battleSide: "defense",
          name: "V2 Rule",
          targetGuildIds: ["guild-a"]
        }
      ],
      destination: {
        id: "discord",
        type: "discord_webhook"
      }
    });
  });

  it("defaults missing v2 battleSide to defense when reading existing rules", async () => {
    const ruleWithoutBattleSide: Record<string, unknown> = { ...createRuleV2Input({ name: "Old V2 Rule" }) };
    delete ruleWithoutBattleSide.battleSide;
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/v2-rule": ruleWithoutBattleSide
    });

    await expect(
      handleGetNotificationSettingsV2({ guildId: "guild-1" }, { authUid: "owner-uid" }, createDependencies(firestore))
    ).resolves.toMatchObject({
      rules: [
        {
          id: "v2-rule",
          battleSide: "defense"
        }
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

  it("saves a v2 rule with server-managed metadata", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare()
    });

    await expect(
      handleSaveNotificationRuleV2(
        {
          guildId: "guild-1",
          rule: createRuleV2Input({
            targetGuildIds: ["guild-a"],
            sortOrder: 3
          })
        },
        { authUid: "owner-uid" },
        createDependencies(firestore)
      )
    ).resolves.toMatchObject({
      id: "generated-rule",
      schemaVersion: 2,
      battleSide: "defense",
      sortOrder: 3,
      targetGuildIds: ["guild-a"],
      createdByRole: "guildOwner",
      createdAt: "now-1",
      updatedAt: "now-1"
    });

    expect(firestore.writes).toEqual([
      expect.objectContaining({
        path: "guildShares/guild-1/notificationRules/generated-rule",
        data: expect.objectContaining({
          schemaVersion: 2,
          battleSide: "defense",
          sortOrder: 3,
          targetGuildIds: ["guild-a"],
          createdAt: "now-1",
          createdByRole: "guildOwner",
          updatedAt: "now-1"
        }),
        options: { merge: false }
      })
    ]);
    expect(firestore.writes[0].data).not.toHaveProperty("id");
  });

  it("updates a v2 rule while preserving created metadata", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-v2": {
        ...createRuleV2Input(),
        createdAt: "created-before",
        createdByRole: "admin",
        updatedAt: "updated-before"
      }
    });

    await expect(
      handleSaveNotificationRuleV2(
        {
          guildId: "guild-1",
          accessKey: "a_admin",
          ruleId: "rule-v2",
          rule: createRuleV2Input({ name: "Updated V2" })
        },
        { authUid: null },
        createDependencies(firestore)
      )
    ).resolves.toMatchObject({
      id: "rule-v2",
      name: "Updated V2",
      createdAt: "created-before",
      createdByRole: "admin",
      updatedAt: "now-1"
    });

    expect(firestore.writes[0].data).toMatchObject({
      name: "Updated V2",
      createdAt: "created-before",
      createdByRole: "admin",
      updatedAt: "now-1"
    });
  });

  it("rejects invalid v2 rules through the save callable", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare()
    });

    await expect(
      handleSaveNotificationRuleV2(
        {
          guildId: "guild-1",
          rule: createRuleV2Input({
            detailConditions: {
              operator: "AND",
              children: [
                {
                  type: "group",
                  operator: "AND",
                  children: [{ type: "condition", field: "attackCount", operator: ">=", value: 1 }]
                }
              ]
            }
          })
        },
        { authUid: "owner-uid" },
        createDependencies(firestore)
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });

    expect(firestore.writes).toEqual([]);
  });

  it("rejects unsupported v2 battleSide values", async () => {
    expect(() =>
      validateNotificationRuleV2Input({
        ...createRuleV2Input(),
        battleSide: "both"
      })
    ).toThrow();
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

  it("temporarily suspends an existing rule with a safe owner uid", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-1": createRule()
    });

    await expect(
      handleSuspendNotificationRule(
        { guildId: "guild-1", ruleId: "rule-1" },
        { authUid: "owner-uid" },
        createDependencies(firestore, new Date("2026-06-20T12:00:00.000Z") as never)
      )
    ).resolves.toEqual({
      suspendedAt: "2026-06-20T12:00:00.000Z",
      expiresAt: "2026-06-20T13:00:00.000Z",
      suspendedBy: { uid: "owner-uid" }
    });

    expect(firestore.writes).toEqual([
      {
        path: "guildShares/guild-1/notificationRules/rule-1",
        data: {
          temporarySuspension: {
            suspendedAt: "2026-06-20T12:00:00.000Z",
            expiresAt: "2026-06-20T13:00:00.000Z",
            suspendedBy: { uid: "owner-uid" }
          },
          updatedAt: new Date("2026-06-20T12:00:00.000Z")
        },
        options: { merge: true }
      }
    ]);
  });

  it("temporarily suspends an existing rule with a safe admin role", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1": createShare(),
      "guildShares/guild-1/notificationRules/rule-1": createRule()
    });

    await expect(
      handleSuspendNotificationRule(
        { guildId: "guild-1", accessKey: "a_admin", ruleId: "rule-1" },
        { authUid: null },
        createDependencies(firestore, new Date("2026-06-20T12:00:00.000Z") as never)
      )
    ).resolves.toMatchObject({
      suspendedAt: "2026-06-20T12:00:00.000Z",
      expiresAt: "2026-06-20T13:00:00.000Z",
      suspendedBy: { role: "admin" }
    });

    expect(firestore.writes[0].data.temporarySuspension).toMatchObject({
      suspendedBy: { role: "admin" }
    });
    expect(JSON.stringify(firestore.writes[0].data)).not.toContain("a_admin");
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
    readonly name?: string;
    readonly battleSide?: "defense" | "attack";
    readonly sortOrder?: number;
    readonly targetGuildIds?: readonly string[];
    readonly mention?: { readonly type: string; readonly customText?: string };
    readonly detailConditions?: Record<string, unknown>;
    readonly temporarySuspension?: Record<string, unknown>;
  } = {}
) {
  return {
    schemaVersion: 2,
    battleType: "guildBattle",
    battleSide: overrides.battleSide ?? "defense",
    name: overrides.name ?? "\u898b\u843d\u3068\u3057\u9632\u6b62",
    enabled: true,
    sortOrder: overrides.sortOrder ?? 0,
    schedule: {
      startTime: "21:00",
      endTime: null
    },
    targetGuildIds: overrides.targetGuildIds ?? [],
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

function createDependencies(firestore: ReturnType<typeof createFirestore>, fixedNow?: never) {
  let nowIndex = 0;

  return {
    firestore,
    now: () => {
      if (fixedNow !== undefined) {
        return fixedNow;
      }

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
