import { useEffect, useMemo, useState } from "react";
import {
  applyNotificationTemplate,
  DEFAULT_NOTIFICATION_BODY_TEMPLATE,
  DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
  DEFAULT_NOTIFICATION_USERNAME_TEMPLATE,
  NOTIFICATION_TEMPLATE_VARIABLES
} from "./notificationTemplates";
import {
  deleteNotificationRule as deleteNotificationRuleDefault,
  getNotificationSettings as getNotificationSettingsDefault,
  saveNotificationDestination as saveNotificationDestinationDefault,
  saveNotificationRule as saveNotificationRuleDefault,
  type DeleteNotificationRuleRequest,
  type NotificationSettingsRequest,
  type SaveNotificationDestinationRequest,
  type SaveNotificationRuleRequest
} from "./notificationSettingsFunctionsRepository";
import type {
  NotificationBattleType,
  NotificationDestination,
  NotificationRule,
  NotificationRuleInput,
  NotificationSettingsRole
} from "./types";

const DISCORD_WEBHOOK_URL_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^/\s]+\/[^/\s]+$/;
const START_TIME_PATTERN = /^\d{2}:\d{2}$/;

interface NotificationSettingsDialogProps {
  readonly request: NotificationSettingsRequest;
  readonly role: NotificationSettingsRole;
  readonly getNotificationSettings?: typeof getNotificationSettingsDefault;
  readonly saveNotificationRule?: typeof saveNotificationRuleDefault;
  readonly deleteNotificationRule?: typeof deleteNotificationRuleDefault;
  readonly saveNotificationDestination?: typeof saveNotificationDestinationDefault;
  readonly onClose: () => void;
}

interface RuleDraft extends NotificationRuleInput {
  readonly id?: string;
}

interface DestinationDraft {
  readonly enabled: boolean;
  readonly webhookUrl: string;
  readonly defaultUsernameTemplate: string;
}

const DEFAULT_RULE_NAME = "見落とし防止";

export function NotificationSettingsDialog({
  request,
  role,
  getNotificationSettings = getNotificationSettingsDefault,
  saveNotificationRule = saveNotificationRuleDefault,
  deleteNotificationRule = deleteNotificationRuleDefault,
  saveNotificationDestination = saveNotificationDestinationDefault,
  onClose
}: NotificationSettingsDialogProps) {
  const [activeBattleType, setActiveBattleType] = useState<NotificationBattleType>("guildBattle");
  const [rules, setRules] = useState<readonly NotificationRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() => createDefaultRuleDraft("guildBattle"));
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft>(createDefaultDestinationDraft());
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);

  useEffect(() => {
    let isDisposed = false;
    setStatus("loading");
    setError(null);
    setMessage(null);

    void getNotificationSettings(request)
      .then((settings) => {
        if (isDisposed) {
          return;
        }

        setRules(settings.rules);
        const firstRule = settings.rules.find((rule) => rule.battleType === activeBattleType) ?? null;
        setSelectedRuleId(firstRule?.id ?? null);
        setRuleDraft(firstRule === null ? createDefaultRuleDraft(activeBattleType) : createRuleDraft(firstRule));

        if (role === "guildOwner") {
          setDestinationDraft(createDestinationDraft(settings.destination));
        }
        setStatus("idle");
      })
      .catch(() => {
        if (!isDisposed) {
          setError("通知設定の読込に失敗しました。");
          setStatus("idle");
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [activeBattleType, getNotificationSettings, request, role]);

  const visibleRules = useMemo(
    () => rules.filter((rule) => rule.battleType === activeBattleType),
    [activeBattleType, rules]
  );
  const canSaveDestination = role === "guildOwner";
  const previewMention = createMentionPreview(ruleDraft.message.mention);
  const previewUsername = applyNotificationTemplate(ruleDraft.message.usernameTemplate);
  const previewTitle = applyNotificationTemplate(ruleDraft.message.titleTemplate);
  const previewBody = applyNotificationTemplate(ruleDraft.message.bodyTemplate);

  function selectBattleType(nextBattleType: NotificationBattleType) {
    const nextRule = rules.find((rule) => rule.battleType === nextBattleType) ?? null;
    setActiveBattleType(nextBattleType);
    setSelectedRuleId(nextRule?.id ?? null);
    setRuleDraft(nextRule === null ? createDefaultRuleDraft(nextBattleType) : createRuleDraft(nextRule));
    setRuleError(null);
  }

  function selectRule(rule: NotificationRule) {
    setSelectedRuleId(rule.id);
    setRuleDraft(createRuleDraft(rule));
    setRuleError(null);
    setMessage(null);
  }

  function createNewRule() {
    setSelectedRuleId(null);
    setRuleDraft(createDefaultRuleDraft(activeBattleType));
    setRuleError(null);
    setMessage(null);
  }

  function duplicateRule(rule: NotificationRule) {
    setSelectedRuleId(null);
    setRuleDraft({
      ...createRuleDraft(rule),
      id: undefined,
      name: `${rule.name} コピー`
    });
    setRuleError(null);
    setMessage(null);
  }

  async function saveRule() {
    const validation = validateRuleDraft(ruleDraft);
    setRuleError(validation);
    setMessage(null);
    setError(null);

    if (validation !== null) {
      return;
    }

    setStatus("saving");
    try {
      const savedRule = await saveNotificationRule({
        ...request,
        ...(selectedRuleId === null ? {} : { ruleId: selectedRuleId }),
        rule: toRuleInput(ruleDraft)
      } satisfies SaveNotificationRuleRequest);
      setRules((currentRules) => {
        const exists = currentRules.some((rule) => rule.id === savedRule.id);
        return exists
          ? currentRules.map((rule) => (rule.id === savedRule.id ? savedRule : rule))
          : [...currentRules, savedRule];
      });
      setSelectedRuleId(savedRule.id);
      setRuleDraft(createRuleDraft(savedRule));
      setMessage("通知ルールを保存しました。");
    } catch {
      setError("通知ルールの保存に失敗しました。");
    } finally {
      setStatus("idle");
    }
  }

  async function deleteRule(rule: NotificationRule) {
    if (!window.confirm(`通知ルール「${rule.name}」を削除しますか？`)) {
      return;
    }

    setStatus("saving");
    setMessage(null);
    setError(null);
    try {
      await deleteNotificationRule({
        ...request,
        ruleId: rule.id
      } satisfies DeleteNotificationRuleRequest);
      const nextRules = rules.filter((currentRule) => currentRule.id !== rule.id);
      const nextRule = nextRules.find((currentRule) => currentRule.battleType === activeBattleType) ?? null;
      setRules(nextRules);
      setSelectedRuleId(nextRule?.id ?? null);
      setRuleDraft(nextRule === null ? createDefaultRuleDraft(activeBattleType) : createRuleDraft(nextRule));
      setMessage("通知ルールを削除しました。");
    } catch {
      setError("通知ルールの削除に失敗しました。");
    } finally {
      setStatus("idle");
    }
  }

  async function saveDestination() {
    const validation = validateDestinationDraft(destinationDraft);
    setDestinationError(validation);
    setMessage(null);
    setError(null);

    if (validation !== null) {
      return;
    }

    setStatus("saving");
    try {
      const savedDestination = await saveNotificationDestination({
        guildId: request.guildId,
        destination: {
          enabled: destinationDraft.enabled,
          webhookUrl: destinationDraft.webhookUrl.trim(),
          defaultUsernameTemplate: destinationDraft.defaultUsernameTemplate
        }
      } satisfies SaveNotificationDestinationRequest);
      setDestinationDraft(createDestinationDraft(savedDestination));
      setMessage("通知先設定を保存しました。");
    } catch {
      setError("通知先設定の保存に失敗しました。");
    } finally {
      setStatus("idle");
    }
  }

  function insertVariable(variableName: string) {
    setRuleDraft((currentDraft) => ({
      ...currentDraft,
      message: {
        ...currentDraft.message,
        bodyTemplate: `${currentDraft.message.bodyTemplate}${variableName}`
      }
    }));
  }

  return (
    <div className="settings-dialog-backdrop notification-settings-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="notification-settings-dialog-title"
        aria-modal="true"
        className="notification-settings-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog__header">
          <div>
            <h2 id="notification-settings-dialog-title">Discord通知設定</h2>
            <p className="notification-settings-dialog__subtitle">通知ルールを管理します。</p>
          </div>
          <button className="settings-dialog__close" type="button" aria-label="通知設定を閉じる" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="notification-settings-dialog__body">
          {canSaveDestination ? (
            <section className="notification-settings-dialog__destination">
              <div className="notification-settings-dialog__section-header">
                <h3>Discord Webhook設定</h3>
                <button className="load-form__button" disabled={status !== "idle"} type="button" onClick={() => void saveDestination()}>
                  保存
                </button>
              </div>
              <label className="notification-settings-dialog__checkbox">
                <input
                  checked={destinationDraft.enabled}
                  disabled={status !== "idle"}
                  type="checkbox"
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setDestinationDraft((currentDraft) => ({ ...currentDraft, enabled }));
                  }}
                />
                有効
              </label>
              <label className="field">
                <span className="field__label">Discord Webhook URL</span>
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  className="field__input field__input--wide"
                  disabled={status !== "idle"}
                  spellCheck={false}
                  type="url"
                  value={destinationDraft.webhookUrl}
                  onChange={(event) => {
                    const webhookUrl = event.target.value;
                    setDestinationDraft((currentDraft) => ({ ...currentDraft, webhookUrl }));
                  }}
                  onInput={(event) => {
                    const webhookUrl = event.currentTarget.value;
                    setDestinationDraft((currentDraft) => ({
                      ...currentDraft,
                      webhookUrl
                    }));
                  }}
                />
              </label>
              <p className="notification-settings-dialog__note">Webhook URLはguild ownerのみ表示・編集できます。</p>
              {destinationError !== null ? <p className="firebase-message firebase-message--error">{destinationError}</p> : null}
            </section>
          ) : null}

          <div className="notification-settings-dialog__tabs" role="tablist" aria-label="通知対象">
            <button
              className={activeBattleType === "guildBattle" ? "notification-settings-dialog__tab is-active" : "notification-settings-dialog__tab"}
              type="button"
              onClick={() => selectBattleType("guildBattle")}
            >
              Guild Battle
            </button>
            <button
              className={activeBattleType === "grandBattle" ? "notification-settings-dialog__tab is-active" : "notification-settings-dialog__tab"}
              type="button"
              onClick={() => selectBattleType("grandBattle")}
            >
              Grand Battle
            </button>
          </div>

          <div className="notification-settings-dialog__grid">
            <section className="notification-settings-dialog__panel">
              <div className="notification-settings-dialog__section-header">
                <h3>通知ルール一覧</h3>
                <button className="load-form__button" type="button" onClick={createNewRule}>
                  新規ルール追加
                </button>
              </div>
              {status === "loading" ? <p className="firebase-message">通知設定を読込中です。</p> : null}
              {visibleRules.length === 0 && status !== "loading" ? (
                <p className="notification-settings-dialog__empty">通知ルールはまだありません。</p>
              ) : null}
              <div className="notification-rule-list">
                {visibleRules.map((rule) => (
                  <article
                    className={rule.id === selectedRuleId ? "notification-rule-card is-selected" : "notification-rule-card"}
                    key={rule.id}
                  >
                    <button className="notification-rule-card__main" type="button" onClick={() => selectRule(rule)}>
                      <span className="notification-rule-card__title">{rule.name}</span>
                      <span className={rule.enabled ? "notification-rule-card__status is-enabled" : "notification-rule-card__status"}>
                        {rule.enabled ? "有効" : "無効"}
                      </span>
                      <span className="notification-rule-card__summary">{createConditionSummary(rule)}</span>
                    </button>
                    <div className="notification-rule-card__actions">
                      <button type="button" onClick={() => selectRule(rule)}>編集</button>
                      <button type="button" onClick={() => duplicateRule(rule)}>複製</button>
                      <button type="button" onClick={() => void deleteRule(rule)}>削除</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="notification-settings-dialog__panel notification-rule-editor">
              <div className="notification-settings-dialog__section-header">
                <h3>通知ルール編集</h3>
                <button className="load-form__button" disabled={status !== "idle"} type="button" onClick={() => void saveRule()}>
                  保存
                </button>
              </div>
              <label className="field">
                <span className="field__label">通知ルール名</span>
                <input
                  className="field__input field__input--wide"
                  value={ruleDraft.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setRuleDraft((currentDraft) => ({ ...currentDraft, name }));
                  }}
                />
              </label>
              <label className="notification-settings-dialog__checkbox">
                <input
                  checked={ruleDraft.enabled}
                  type="checkbox"
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setRuleDraft((currentDraft) => ({ ...currentDraft, enabled }));
                  }}
                />
                有効
              </label>
              <div className="notification-rule-editor__conditions">
                <label className="field">
                  <span className="field__label">開始時刻</span>
                  <input
                    className="field__input"
                    placeholder="21:00"
                    value={ruleDraft.conditions.startTime}
                    onChange={(event) => {
                      const startTime = event.target.value;
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        conditions: { ...currentDraft.conditions, startTime }
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field__label">防御数条件</span>
                  <input
                    className="field__input"
                    inputMode="numeric"
                    placeholder="以下"
                    value={ruleDraft.conditions.defenseCountMax ?? ""}
                    onChange={(event) => {
                      const defenseCountMax = parseOptionalInteger(event.target.value);
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        conditions: {
                          ...currentDraft.conditions,
                          defenseCountMax
                        }
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field__label">侵攻数条件</span>
                  <input
                    className="field__input"
                    inputMode="numeric"
                    placeholder="以上"
                    value={ruleDraft.conditions.attackCountMin ?? ""}
                    onChange={(event) => {
                      const attackCountMin = parseOptionalInteger(event.target.value);
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        conditions: {
                          ...currentDraft.conditions,
                          attackCountMin
                        }
                      }));
                    }}
                  />
                </label>
              </div>
              <label className="field">
                <span className="field__label">Discord表示名</span>
                <input
                  className="field__input field__input--wide"
                  value={ruleDraft.message.usernameTemplate}
                  onChange={(event) => {
                    const usernameTemplate = event.target.value;
                    setRuleDraft((currentDraft) => ({
                      ...currentDraft,
                      message: { ...currentDraft.message, usernameTemplate }
                    }));
                  }}
                />
              </label>
              <label className="field">
                <span className="field__label">メンション先</span>
                <select
                  className="field__input field__input--wide"
                  value={ruleDraft.message.mention.type}
                  onChange={(event) => {
                    const mentionType = event.target.value;
                    setRuleDraft((currentDraft) => ({
                      ...currentDraft,
                      message: {
                        ...currentDraft.message,
                        mention:
                          mentionType === "custom"
                            ? { type: "custom", customText: "" }
                            : { type: mentionType as "none" | "here" | "everyone" }
                      }
                    }));
                  }}
                >
                  <option value="none">なし</option>
                  <option value="here">@here</option>
                  <option value="everyone">@everyone</option>
                  <option value="custom">カスタム</option>
                </select>
              </label>
              {ruleDraft.message.mention.type === "custom" ? (
                <label className="field">
                  <span className="field__label">カスタムメンション</span>
                  <input
                    className="field__input field__input--wide"
                    value={ruleDraft.message.mention.customText ?? ""}
                    onChange={(event) => {
                      const customText = event.target.value;
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        message: {
                          ...currentDraft.message,
                          mention: { type: "custom", customText }
                        }
                      }));
                    }}
                  />
                </label>
              ) : null}
              <label className="field">
                <span className="field__label">通知タイトル</span>
                <input
                  className="field__input field__input--wide"
                  value={ruleDraft.message.titleTemplate}
                  onChange={(event) => {
                    const titleTemplate = event.target.value;
                    setRuleDraft((currentDraft) => ({
                      ...currentDraft,
                      message: { ...currentDraft.message, titleTemplate }
                    }));
                  }}
                />
              </label>
              <label className="field">
                <span className="field__label">通知本文</span>
                <textarea
                  className="field__input field__input--wide notification-rule-editor__textarea"
                  value={ruleDraft.message.bodyTemplate}
                  onChange={(event) => {
                    const bodyTemplate = event.target.value;
                    setRuleDraft((currentDraft) => ({
                      ...currentDraft,
                      message: { ...currentDraft.message, bodyTemplate }
                    }));
                  }}
                />
              </label>
              <div className="notification-rule-editor__variables" aria-label="変数を挿入">
                {NOTIFICATION_TEMPLATE_VARIABLES.map((variableName) => (
                  <button key={variableName} type="button" onClick={() => insertVariable(variableName)}>
                    {variableName}
                  </button>
                ))}
              </div>
              {ruleError !== null ? <p className="firebase-message firebase-message--error">{ruleError}</p> : null}
            </section>

            <section className="notification-settings-dialog__panel">
              <h3>通知プレビュー</h3>
              <div className="notification-preview">
                <div className="notification-preview__username">{previewUsername}</div>
                {previewMention.length > 0 ? <div className="notification-preview__mention">{previewMention}</div> : null}
                <div className="notification-preview__embed">
                  <strong>{previewTitle}</strong>
                  <p>{previewBody}</p>
                </div>
              </div>
              {message !== null ? <p className="firebase-message firebase-message--success">{message}</p> : null}
              {error !== null ? <p className="firebase-message firebase-message--error">{error}</p> : null}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function createDefaultRuleDraft(battleType: NotificationBattleType): RuleDraft {
  return {
    battleType,
    name: DEFAULT_RULE_NAME,
    enabled: true,
    conditions: {
      startTime: "21:00",
      defenseCountMax: 20,
      attackCountMin: 15
    },
    message: {
      usernameTemplate: DEFAULT_NOTIFICATION_USERNAME_TEMPLATE,
      mention: { type: "here" },
      titleTemplate: DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_NOTIFICATION_BODY_TEMPLATE
    }
  };
}

function createRuleDraft(rule: NotificationRule): RuleDraft {
  return {
    id: rule.id,
    battleType: rule.battleType,
    name: rule.name,
    enabled: rule.enabled,
    conditions: { ...rule.conditions },
    message: {
      ...rule.message,
      mention: { ...rule.message.mention }
    }
  };
}

function toRuleInput(ruleDraft: RuleDraft): NotificationRuleInput {
  return {
    battleType: ruleDraft.battleType,
    name: ruleDraft.name,
    enabled: ruleDraft.enabled,
    conditions: { ...ruleDraft.conditions },
    message: {
      ...ruleDraft.message,
      mention: { ...ruleDraft.message.mention }
    }
  };
}

function createDefaultDestinationDraft(): DestinationDraft {
  return {
    enabled: false,
    webhookUrl: "",
    defaultUsernameTemplate: DEFAULT_NOTIFICATION_USERNAME_TEMPLATE
  };
}

function createDestinationDraft(destination: NotificationDestination | undefined): DestinationDraft {
  return {
    enabled: destination?.enabled ?? false,
    webhookUrl: destination?.webhookUrl ?? "",
    defaultUsernameTemplate: destination?.defaultUsernameTemplate ?? DEFAULT_NOTIFICATION_USERNAME_TEMPLATE
  };
}

function validateRuleDraft(ruleDraft: RuleDraft): string | null {
  if (ruleDraft.name.trim().length === 0) {
    return "通知ルール名を入力してください。";
  }

  if (!START_TIME_PATTERN.test(ruleDraft.conditions.startTime)) {
    return "開始時刻はHH:mm形式で入力してください。";
  }

  if (
    !isNullableNonNegativeInteger(ruleDraft.conditions.defenseCountMax) ||
    !isNullableNonNegativeInteger(ruleDraft.conditions.attackCountMin)
  ) {
    return "防御数条件と侵攻数条件は0以上の整数で入力してください。";
  }

  if (
    ruleDraft.message.usernameTemplate.trim().length === 0 ||
    ruleDraft.message.titleTemplate.trim().length === 0 ||
    ruleDraft.message.bodyTemplate.trim().length === 0
  ) {
    return "Discord表示名、通知タイトル、通知本文を入力してください。";
  }

  if (
    ruleDraft.message.mention.type === "custom" &&
    (ruleDraft.message.mention.customText ?? "").trim().length === 0
  ) {
    return "カスタムメンションを入力してください。";
  }

  return null;
}

function validateDestinationDraft(destinationDraft: DestinationDraft): string | null {
  const webhookUrl = destinationDraft.webhookUrl.trim();

  if (destinationDraft.enabled && webhookUrl.length === 0) {
    return "有効にする場合はDiscord Webhook URLを入力してください。";
  }

  if (webhookUrl.length > 0 && !DISCORD_WEBHOOK_URL_PATTERN.test(webhookUrl)) {
    return "Discord Webhook URLの形式を確認してください。";
  }

  return null;
}

function isNullableNonNegativeInteger(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function parseOptionalInteger(value: string): number | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const nextValue = Number(trimmedValue);
  return Number.isSafeInteger(nextValue) ? nextValue : null;
}

function createMentionPreview(mention: NotificationRule["message"]["mention"]): string {
  if (mention.type === "here") {
    return "@here";
  }

  if (mention.type === "everyone") {
    return "@everyone";
  }

  if (mention.type === "custom") {
    return mention.customText ?? "";
  }

  return "";
}

function createConditionSummary(rule: NotificationRule): string {
  const defense = rule.conditions.defenseCountMax === null ? "防御未指定" : `防御${rule.conditions.defenseCountMax}以下`;
  const attack = rule.conditions.attackCountMin === null ? "侵攻未指定" : `侵攻${rule.conditions.attackCountMin}以上`;
  return `${rule.conditions.startTime} / ${defense} / ${attack}`;
}
