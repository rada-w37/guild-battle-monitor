import { describe, expect, it } from "vitest";
import { handleNotificationRequestCreated } from "./notificationDispatch.js";

describe("notification dispatch trigger", () => {
  it("posts a valid request to Discord and marks the request and history as sent", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({ source: { observedAt: createTimestampLike("2026-06-17T20:55:00.000Z") } }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts).toEqual([
      {
        webhookUrl: "https://discord.com/api/webhooks/webhook-id/webhook-token",
        payload: {
          username: "KOO Rule",
          content: "<@123>\nBase is under attack",
          allowed_mentions: { parse: ["users"] },
          embeds: [
            {
              description: "Defense 3 / Attack 5",
              timestamp: "2026-06-17T20:55:00.000Z"
            }
          ]
        }
      }
    ]);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toMatchObject({
      requestId: "request-1",
      duplicateKey: "duplicate-key",
      ruleId: "rule-1",
      status: "sent",
      createdAt: "now-1",
      updatedAt: "now-2",
      notifiedAt: "now-2"
    });
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "sent",
      processedAt: "now-2"
    });
    expect(firestore.documents["notificationRequests/request-1"]).not.toHaveProperty("errorMessage");
  });

  it("posts a rule-level time request without battle observation fields", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-time-1",
      createRuleLevelTimeRequest(),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts).toEqual([
      {
        webhookUrl: "https://discord.com/api/webhooks/webhook-id/webhook-token",
        payload: {
          username: "KOO Rule",
          content: "Scheduled notice"
        }
      }
    ]);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-time-1"]).toMatchObject({
      requestId: "request-time-1",
      duplicateKey: "guild-1:guildBattle:1001:2026-06-17:rule-1:time:21:00-open",
      ruleId: "rule-1",
      activeTimeWindow: "21:00-open",
      status: "sent"
    });
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-time-1"]).not.toHaveProperty(
      "baseName"
    );
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-time-1"]).not.toHaveProperty(
      "defenseCount"
    );
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-time-1"]).not.toHaveProperty(
      "attackCount"
    );
    expect(firestore.documents["notificationRequests/request-time-1"]).toMatchObject({
      status: "sent"
    });
  });

  it("posts a repeat request with a 30 second repeat interval", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-repeat-1",
      createRequest({
        repeatNotification: {
          enabled: true,
          intervalSeconds: 30
        },
        baseNotificationKey: "base-notification-key",
        repeatSeq: 1,
        isRepeat: true
      }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts).toHaveLength(1);
    expect(firestore.documents["notificationRequests/request-repeat-1"]).toMatchObject({
      status: "sent"
    });
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-repeat-1"]).toMatchObject({
      status: "sent"
    });
  });

  it("does not alter sent or processing histories when skipping duplicates", async () => {
    const sentHistory = createHistory({ status: "sent", createdAt: "created-sent", updatedAt: "updated-sent" });
    const processingHistory = createHistory({
      status: "processing",
      createdAt: "created-processing",
      updatedAt: "updated-processing"
    });
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination(),
      "guildShares/guild-1/notificationHistories/request-sent": sentHistory,
      "guildShares/guild-1/notificationHistories/request-processing": processingHistory
    });
    const discordPosts: DiscordPost[] = [];
    const dependencies = createDependencies(firestore, { discordPosts });

    await handleNotificationRequestCreated("request-sent", createRequest(), dependencies);
    await handleNotificationRequestCreated("request-processing", createRequest(), dependencies);

    expect(discordPosts).toEqual([]);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-sent"]).toEqual(sentHistory);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-processing"]).toEqual(
      processingHistory
    );
    expect(firestore.documents["notificationRequests/request-sent"]).toMatchObject({
      status: "skipped",
      errorCode: "duplicate_sent"
    });
    expect(firestore.documents["notificationRequests/request-processing"]).toMatchObject({
      status: "skipped",
      errorCode: "duplicate_processing"
    });
  });

  it("does not alter failed or skipped histories when terminal duplicates are found", async () => {
    const failedHistory = createHistory({ status: "failed", createdAt: "created-failed" });
    const skippedHistory = createHistory({ status: "skipped", createdAt: "created-skipped" });
    const firestore = createFirestore({
      "guildShares/guild-1/notificationHistories/request-failed": failedHistory,
      "guildShares/guild-1/notificationHistories/request-skipped": skippedHistory
    });
    const discordPosts: DiscordPost[] = [];
    const dependencies = createDependencies(firestore, { discordPosts });

    await handleNotificationRequestCreated("request-failed", createRequest(), dependencies);
    await handleNotificationRequestCreated("request-skipped", createRequest(), dependencies);

    expect(discordPosts).toEqual([]);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-failed"]).toEqual(failedHistory);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-skipped"]).toEqual(skippedHistory);
    expect(firestore.documents["notificationRequests/request-failed"]).toMatchObject({
      status: "skipped",
      errorCode: "duplicate_finalized"
    });
    expect(firestore.documents["notificationRequests/request-skipped"]).toMatchObject({
      status: "skipped",
      errorCode: "duplicate_finalized"
    });
  });

  it("marks a newly locked history as skipped when destination is unavailable", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination({ enabled: false })
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated("request-1", createRequest(), createDependencies(firestore, { discordPosts }));

    expect(discordPosts).toEqual([]);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toMatchObject({
      status: "skipped",
      errorCode: "destination_unavailable",
      createdAt: "now-1",
      updatedAt: "now-2"
    });
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "skipped",
      errorCode: "destination_unavailable",
      processedAt: "now-2"
    });
  });

  it("treats missing, empty, or invalid destinations as unavailable", async () => {
    const scenarios: Array<Record<string, Record<string, unknown>>> = [
      {},
      { "guildShares/guild-1/notificationDestinations/discord": createDestination({ webhookUrl: "" }) },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://example.com/api/webhooks/webhook-id/webhook-token"
        })
      },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://discord.com/api/webhooks/"
        })
      },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://discord.com/api/webhooks/webhook-id"
        })
      },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://discord.com/api/webhooks/webhook-id/webhook-token/extra"
        })
      },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://discord.com/api/webhooks/webhook-id/webhook-token?wait=true"
        })
      },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://discord.com/api/webhooks/webhook-id/webhook-token#fragment"
        })
      },
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({
          webhookUrl: "https://discord.com:8443/api/webhooks/webhook-id/webhook-token"
        })
      }
    ];

    for (const [index, documents] of scenarios.entries()) {
      const firestore = createFirestore(documents);
      const discordPosts: DiscordPost[] = [];
      await handleNotificationRequestCreated(
        `request-${index}`,
        createRequest(),
        createDependencies(firestore, { discordPosts })
      );

      expect(discordPosts).toEqual([]);
      expect(firestore.documents[`notificationRequests/request-${index}`]).toMatchObject({
        status: "skipped",
        errorCode: "destination_unavailable"
      });
    }
  });

  it("allows an explicit HTTPS 443 Discord webhook URL", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination({
        webhookUrl: "https://discord.com:443/api/webhooks/webhook-id/webhook-token"
      })
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated("request-1", createRequest(), createDependencies(firestore, { discordPosts }));

    expect(discordPosts).toHaveLength(1);
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({ status: "sent" });
  });

  it("omits optional Discord payload fields when the request strings are empty or invalid", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({
        baseId: "",
        attackerGuildId: 123,
        message: {
          username: "  ",
          mentionText: "",
          title: "Base is under attack",
          body: ""
        },
        source: { observedAt: "not-a-timestamp" }
      }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts[0].payload).toEqual({
      content: "Base is under attack"
    });
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).not.toHaveProperty("baseId");
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).not.toHaveProperty(
      "attackerGuildId"
    );
  });

  it("keeps here, everyone, role, and user mentions in content with matching allowed mentions", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({
        message: {
          username: "KOO Rule",
          mentionText: "@here <@123> <@&456>",
          title: "Join the battle",
          body: ""
        }
      }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts[0].payload).toEqual({
      username: "KOO Rule",
      content: "@here <@123> <@&456>\nJoin the battle",
      allowed_mentions: { parse: ["everyone", "users", "roles"] }
    });
  });

  it("truncates requests whose notification summary is too long", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];
    const longTitle = "a".repeat(121);

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({
        message: {
          username: "KOO Rule",
          mentionText: "<@123>",
          title: longTitle,
          body: "Defense 3 / Attack 5"
        }
      }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts[0].payload).toMatchObject({
      username: "KOO Rule",
      content: `<@123>\n${"a".repeat(119)}…`,
      allowed_mentions: { parse: ["users"] },
      embeds: [
        {
          description: "Defense 3 / Attack 5"
        }
      ]
    });
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "sent"
    });
  });

  it("truncates notification summaries without breaking emoji surrogate pairs", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];
    const longTitle = `${"a".repeat(118)}😀bc`;
    const expectedSummary = `${"a".repeat(118)}😀…`;

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({
        message: {
          username: "KOO Rule",
          mentionText: "<@123>",
          title: longTitle,
          body: "Defense 3 / Attack 5"
        }
      }),
      createDependencies(firestore, { discordPosts })
    );

    const discordPayload = discordPosts[0].payload as { readonly content: string };
    expect(Array.from(expectedSummary)).toHaveLength(120);
    expect(discordPayload.content).toBe(`<@123>\n${expectedSummary}`);
    expect(discordPayload.content).not.toContain("�");
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "sent"
    });
  });

  it("stores only sanitized HTTP status errors when Discord returns non-2xx", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];
    const responseBodyProbe = {
      get body() {
        throw new Error("response body must not be read");
      },
      ok: false,
      status: 429
    };

    await handleNotificationRequestCreated(
      "request-1",
      createRequest(),
      createDependencies(firestore, { discordPosts, discordResponse: responseBodyProbe })
    );

    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toMatchObject({
      status: "failed",
      errorCode: "discord_http_error",
      errorMessage: "HTTP status: 429",
      createdAt: "now-1",
      updatedAt: "now-2"
    });
    expect(firestore.documents["notificationRequests/request-1"]).toEqual({
      status: "failed",
      processedAt: "now-2",
      errorCode: "discord_http_error"
    });
  });

  it("stores only sanitized fixed errors when Discord POST throws", async () => {
    const secretWebhook = "https://discord.com/api/webhooks/webhook-id/webhook-token";
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination({ webhookUrl: secretWebhook })
    });
    const logs = createLogs();

    await handleNotificationRequestCreated(
      "request-1",
      createRequest(),
      createDependencies(firestore, {
        logs,
        postError: new Error(`network failed for ${secretWebhook}`)
      })
    );

    const serializedWrites = JSON.stringify(firestore.writes);
    const serializedLogs = JSON.stringify(logs.entries);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toMatchObject({
      status: "failed",
      errorCode: "discord_post_failed",
      errorMessage: "Discord POST failed"
    });
    expect(firestore.documents["notificationRequests/request-1"]).toEqual({
      status: "failed",
      processedAt: "now-2",
      errorCode: "discord_post_failed"
    });
    expect(serializedWrites).not.toContain(secretWebhook);
    expect(serializedLogs).not.toContain(secretWebhook);
    expect(serializedLogs).not.toContain("network failed");
  });

  it("does not classify post-send Firestore update failures as discord_post_failed", async () => {
    const secretWebhook = "https://discord.com/api/webhooks/webhook-id/webhook-token";
    const firestore = createFirestore(
      {
        "guildShares/guild-1/notificationDestinations/discord": createDestination({ webhookUrl: secretWebhook })
      },
      {
        failSet: (path, data) =>
          path === "guildShares/guild-1/notificationHistories/request-1" && data.status === "sent"
      }
    );
    const discordPosts: DiscordPost[] = [];
    const logs = createLogs();

    await expect(
      handleNotificationRequestCreated("request-1", createRequest(), createDependencies(firestore, { discordPosts, logs }))
    ).rejects.toThrow("set failed");

    const serializedWrites = JSON.stringify(firestore.writes);
    const serializedLogs = JSON.stringify(logs.entries);
    expect(discordPosts).toHaveLength(1);
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toMatchObject({
      status: "processing",
      createdAt: "now-1",
      updatedAt: "now-1"
    });
    expect(firestore.documents["notificationRequests/request-1"]).toBeUndefined();
    expect(serializedWrites).not.toContain("discord_post_failed");
    expect(serializedLogs).not.toContain("discord_post_failed");
    expect(serializedWrites).not.toContain(secretWebhook);
    expect(serializedLogs).not.toContain(secretWebhook);
  });

  it("does not store raw request payload fields when the request is invalid", async () => {
    const firestore = createFirestore({});
    const logs = createLogs();
    const rawSecret = "raw-secret-value";

    await handleNotificationRequestCreated(
      "request-1",
      { guildId: "guild-1", ruleId: "rule-1", webhookUrl: rawSecret, message: { title: "", body: "" } },
      createDependencies(firestore, { logs })
    );

    expect(firestore.documents["notificationRequests/request-1"]).toEqual({
      status: "failed",
      processedAt: "now-1",
      errorCode: "invalid_request"
    });
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toBeUndefined();
    expect(JSON.stringify(firestore.writes)).not.toContain(rawSecret);
    expect(JSON.stringify(logs.entries)).not.toContain(rawSecret);
  });

  it("treats guildId containing slash as invalid_request", async () => {
    const firestore = createFirestore({
      "guildShares/guild/1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({ guildId: "guild/1" }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts).toEqual([]);
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "failed",
      errorCode: "invalid_request"
    });
    expect(firestore.documents["guildShares/guild/1/notificationHistories/request-1"]).toBeUndefined();
  });

  it("keeps battle observation fields required when activeTimeWindow is missing", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-1",
      createRequest({
        baseName: undefined,
        defenseCount: undefined,
        attackCount: undefined,
        message: {
          username: "KOO Rule",
          title: "Base is under attack",
          body: ""
        }
      }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts).toEqual([]);
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "failed",
      errorCode: "invalid_request"
    });
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toBeUndefined();
  });

  it("does not treat detailRuleEnabled false alone as a rule-level time request", async () => {
    const firestore = createFirestore({
      "guildShares/guild-1/notificationDestinations/discord": createDestination()
    });
    const discordPosts: DiscordPost[] = [];

    await handleNotificationRequestCreated(
      "request-1",
      createRuleLevelTimeRequest({ activeTimeWindow: undefined }),
      createDependencies(firestore, { discordPosts })
    );

    expect(discordPosts).toEqual([]);
    expect(firestore.documents["notificationRequests/request-1"]).toMatchObject({
      status: "failed",
      errorCode: "invalid_request"
    });
    expect(firestore.documents["guildShares/guild-1/notificationHistories/request-1"]).toBeUndefined();
  });
});

type DiscordPost = {
  readonly webhookUrl: string;
  readonly payload: unknown;
};

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    guildId: "guild-1",
    battleType: "guildBattle",
    ruleId: "rule-1",
    ruleName: "Rule",
    duplicateKey: "duplicate-key",
    baseId: "castle-1",
    baseName: "Base",
    attackerGuildId: "attacker-1",
    attackerGuildName: "Attacker",
    defenseCount: 3,
    attackCount: 5,
    message: {
      username: "KOO Rule",
      mentionText: "<@123>",
      title: "Base is under attack",
      body: "Defense 3 / Attack 5"
    },
    ...overrides
  };
}

function createRuleLevelTimeRequest(overrides: Record<string, unknown> = {}) {
  return {
    guildId: "guild-1",
    battleType: "guildBattle",
    ruleId: "rule-1",
    ruleName: "Rule",
    detailRuleEnabled: false,
    duplicateKey: "guild-1:guildBattle:1001:2026-06-17:rule-1:time:21:00-open",
    activeTimeWindow: "21:00-open",
    message: {
      username: "KOO Rule",
      title: "Scheduled notice",
      body: ""
    },
    source: {
      worldId: "1001",
      battleDate: "2026-06-17",
      observedAt: createTimestampLike("2026-06-17T21:00:00.000Z")
    },
    ...overrides
  };
}

function createDestination(overrides: Record<string, unknown> = {}) {
  return {
    type: "discord_webhook",
    enabled: true,
    webhookUrl: "https://discord.com/api/webhooks/webhook-id/webhook-token",
    ...overrides
  };
}

function createHistory(overrides: Record<string, unknown>) {
  return {
    requestId: "request",
    duplicateKey: "duplicate-key",
    ruleId: "rule-1",
    ruleName: "Rule",
    battleType: "guildBattle",
    baseName: "Base",
    defenseCount: 3,
    attackCount: 5,
    destinationId: "discord",
    updatedAt: "updated-at",
    ...overrides
  };
}

function createTimestampLike(isoValue: string) {
  return {
    toDate: () => new Date(isoValue)
  };
}

function createDependencies(
  firestore: ReturnType<typeof createFirestore>,
  options: {
    readonly discordPosts?: DiscordPost[];
    readonly discordResponse?: { readonly ok: boolean; readonly status: number };
    readonly logs?: ReturnType<typeof createLogs>;
    readonly postError?: Error;
  } = {}
) {
  let nowIndex = 0;
  const logs = options.logs ?? createLogs();

  return {
    firestore,
    now: () => {
      nowIndex += 1;
      return `now-${nowIndex}` as never;
    },
    postDiscordWebhook: async (webhookUrl: string, payload: unknown) => {
      if (options.postError !== undefined) {
        throw options.postError;
      }

      options.discordPosts?.push({ webhookUrl, payload });
      return options.discordResponse ?? { ok: true, status: 204 };
    },
    logger: logs.logger
  };
}

function createLogs() {
  const entries: Array<{ readonly level: string; readonly message: string; readonly data?: Record<string, unknown> }> =
    [];
  return {
    entries,
    logger: {
      info: (message: string, data?: Record<string, unknown>) => entries.push({ level: "info", message, data }),
      warn: (message: string, data?: Record<string, unknown>) => entries.push({ level: "warn", message, data }),
      error: (message: string, data?: Record<string, unknown>) => entries.push({ level: "error", message, data })
    }
  };
}

function createFirestore(
  documents: Record<string, Record<string, unknown>>,
  options: {
    readonly failSet?: (path: string, data: Record<string, unknown>) => boolean;
  } = {}
) {
  const writes: Array<{
    readonly method: "create" | "set" | "update";
    readonly path: string;
    readonly data: Record<string, unknown>;
    readonly options?: { readonly merge: boolean };
  }> = [];
  const refs: Record<string, DocumentRefLike> = {};

  function createSnapshot(path: string) {
    return {
      exists: Object.prototype.hasOwnProperty.call(documents, path),
      data: () => documents[path]
    };
  }

  function getRefPath(ref: unknown): string {
    for (const [path, candidate] of Object.entries(refs)) {
      if (candidate === ref) {
        return path;
      }
    }
    throw new Error("unknown ref");
  }

  function createDocumentRef(path: string) {
    refs[path] ??= {
      get: async () => createSnapshot(path),
      set: async (data: Record<string, unknown>, setOptions?: { readonly merge: boolean }) => {
        if (setOptions?.merge === true && options.failSet?.(path, data) === true) {
          throw new Error("set failed");
        }

        writes.push({ method: "set", path, data, options: setOptions });
        documents[path] =
          setOptions?.merge === true && documents[path] !== undefined ? { ...documents[path], ...data } : data;
      },
      update: async (data: Record<string, unknown>) => {
        writes.push({ method: "update", path, data });
        documents[path] = { ...(documents[path] ?? {}), ...data };
      }
    };
    return refs[path];
  }

  return {
    documents,
    writes,
    doc: createDocumentRef,
    runTransaction: async <T>(updateFunction: (transaction: TransactionLike) => Promise<T>) =>
      updateFunction({
        get: (ref) => ref.get(),
        create: (ref, data) => {
          const path = getRefPath(ref);
          if (documents[path] !== undefined) {
            throw new Error("already exists");
          }
          writes.push({ method: "create", path, data });
          documents[path] = data;
        }
      })
  };
}

interface DocumentRefLike {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>, options?: { readonly merge: boolean }): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
}

interface TransactionLike {
  get(ref: DocumentRefLike): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  create(ref: DocumentRefLike, data: Record<string, unknown>): void;
}
