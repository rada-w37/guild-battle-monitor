import { useEffect, useMemo, useState } from "react";
import {
  applyNotificationTemplate,
  DEFAULT_NOTIFICATION_USERNAME_TEMPLATE,
  NOTIFICATION_TEMPLATE_VARIABLES
} from "./notificationTemplates";
import {
  deleteNotificationRule as deleteNotificationRuleDefault,
  getNotificationSettings as getNotificationSettingsDefault,
  saveNotificationDestination as saveNotificationDestinationDefault,
  saveNotificationRule as saveNotificationRuleDefault,
  suspendNotificationRule as suspendNotificationRuleDefault,
  type DeleteNotificationRuleRequest,
  type NotificationSettingsRequest,
  type SaveNotificationDestinationRequest,
  type SaveNotificationRuleRequest,
  type SuspendNotificationRuleRequest
} from "./notificationSettingsFunctionsRepository";
import {
  createDefaultNotificationRuleV2Draft,
  createLegacyNotificationRuleInputFromV2Draft,
  createNotificationRuleV2DraftFromLegacy,
  type NotificationRuleV2Draft
} from "./notificationRuleV2Draft";
import type {
  NotificationBattleType,
  NotificationDestination,
  NotificationDetailConditionField,
  NotificationDetailConditionOperator,
  NotificationRule,
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
  readonly suspendNotificationRule?: typeof suspendNotificationRuleDefault;
  readonly saveNotificationDestination?: typeof saveNotificationDestinationDefault;
  readonly onClose: () => void;
}

interface RuleDraft extends NotificationRuleV2Draft {
  readonly id?: string;
}

interface DestinationDraft {
  readonly enabled: boolean;
  readonly webhookUrl: string;
  readonly defaultUsernameTemplate: string;
}

type RuleEditorMode = "empty" | "creating" | "editing";

export function NotificationSettingsDialog({
  request,
  role,
  getNotificationSettings = getNotificationSettingsDefault,
  saveNotificationRule = saveNotificationRuleDefault,
  deleteNotificationRule = deleteNotificationRuleDefault,
  suspendNotificationRule = suspendNotificationRuleDefault,
  saveNotificationDestination = saveNotificationDestinationDefault,
  onClose
}: NotificationSettingsDialogProps) {
  const [activeBattleType, setActiveBattleType] = useState<NotificationBattleType>("guildBattle");
  const [rules, setRules] = useState<readonly NotificationRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleEditorMode, setRuleEditorMode] = useState<RuleEditorMode>("empty");
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() => createDefaultRuleDraft("guildBattle"));
  const [savedRuleDraft, setSavedRuleDraft] = useState<RuleDraft | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft>(createDefaultDestinationDraft());
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [suspendedRuleIds, setSuspendedRuleIds] = useState<readonly string[]>([]);
  const [pendingSuspensionRuleId, setPendingSuspensionRuleId] = useState<string | null>(null);

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
        setSelectedRuleId(null);
        setRuleEditorMode("empty");
        setRuleDraft(createDefaultRuleDraft(activeBattleType));
        setSavedRuleDraft(null);

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
  const isRuleEditorVisible = ruleEditorMode !== "empty";
  const ruleEditorTitle = ruleEditorMode === "creating" ? "通知ルール新規作成" : "通知ルール編集";
  const isRuleDraftDirty =
    ruleEditorMode === "editing" && savedRuleDraft !== null && serializeRuleDraft(ruleDraft) !== serializeRuleDraft(savedRuleDraft);
  const shouldShowRuleActionBar = ruleEditorMode === "creating" || isRuleDraftDirty;
  const isSuspendingSelectedRule = selectedRuleId !== null && pendingSuspensionRuleId === selectedRuleId;

  useEffect(() => {
    if (
      !isRuleDraftDirty ||
      selectedRuleId === null ||
      pendingSuspensionRuleId === selectedRuleId ||
      suspendedRuleIds.includes(selectedRuleId)
    ) {
      return;
    }

    let isDisposed = false;
    const suspendingRuleId = selectedRuleId;
    setPendingSuspensionRuleId(suspendingRuleId);
    setError(null);

    void suspendNotificationRule({
      ...request,
      ruleId: suspendingRuleId
    } satisfies SuspendNotificationRuleRequest)
      .then(() => {
        if (isDisposed) {
          return;
        }

        setSuspendedRuleIds((currentIds) =>
          currentIds.includes(suspendingRuleId) ? currentIds : [...currentIds, suspendingRuleId]
        );
      })
      .catch(() => {
        if (isDisposed) {
          return;
        }

        setError("通知の一時停止に失敗したため、編集を開始できませんでした。時間をおいて再度お試しください。");
        setSelectedRuleId(null);
        setRuleEditorMode("empty");
        setRuleDraft(createDefaultRuleDraft(activeBattleType));
        setSavedRuleDraft(null);
        setRuleError(null);
      })
      .finally(() => {
        if (!isDisposed) {
          setPendingSuspensionRuleId(null);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [
    activeBattleType,
    isRuleDraftDirty,
    pendingSuspensionRuleId,
    request,
    selectedRuleId,
    suspendedRuleIds,
    suspendNotificationRule
  ]);

  function selectBattleType(nextBattleType: NotificationBattleType) {
    setActiveBattleType(nextBattleType);
    setSelectedRuleId(null);
    setRuleEditorMode("empty");
    setRuleDraft(createDefaultRuleDraft(nextBattleType));
    setSavedRuleDraft(null);
    setPendingSuspensionRuleId(null);
    setRuleError(null);
  }

  function selectRule(rule: NotificationRule) {
    const nextDraft = createRuleDraft(rule);
    setSelectedRuleId(rule.id);
    setRuleEditorMode("editing");
    setRuleDraft(nextDraft);
    setSavedRuleDraft(nextDraft);
    setRuleError(null);
    setMessage(null);
    setPendingSuspensionRuleId(null);
  }

  function createNewRule() {
    setSelectedRuleId(null);
    setRuleEditorMode("creating");
    setRuleDraft(createDefaultRuleDraft(activeBattleType));
    setSavedRuleDraft(null);
    setRuleError(null);
    setMessage(null);
    setPendingSuspensionRuleId(null);
  }

  function duplicateRule(rule: NotificationRule) {
    setSelectedRuleId(null);
    setRuleEditorMode("creating");
    setRuleDraft({
      ...createRuleDraft(rule),
      id: undefined,
      name: `${rule.name} コピー`
    });
    setSavedRuleDraft(null);
    setRuleError(null);
    setMessage(null);
    setPendingSuspensionRuleId(null);
  }

  function discardRuleChanges() {
    setRuleError(null);
    setMessage(null);

    if (ruleEditorMode === "creating") {
      setSelectedRuleId(null);
      setRuleEditorMode("empty");
      setRuleDraft(createDefaultRuleDraft(activeBattleType));
      setSavedRuleDraft(null);
      return;
    }

    if (savedRuleDraft !== null) {
      setRuleDraft(savedRuleDraft);
    }
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
      setRuleEditorMode("editing");
      const nextDraft = createRuleDraft(savedRule);
      setRuleDraft(nextDraft);
      setSavedRuleDraft(nextDraft);
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
      setRules(nextRules);
      setSelectedRuleId(null);
      setRuleEditorMode("empty");
      setRuleDraft(createDefaultRuleDraft(activeBattleType));
      setSavedRuleDraft(null);
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
                      {rule.id === selectedRuleId && isRuleDraftDirty ? (
                        <span className="notification-rule-card__pause-status">保存まで一時停止</span>
                      ) : null}
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
              {!isRuleEditorVisible ? (
                <div className="notification-rule-editor__empty-state">
                  <h3>通知ルールを選択してください</h3>
                  <p className="notification-settings-dialog__empty">
                    既存ルールを編集するか、新規作成から通知条件を設定できます。
                  </p>
                  <button className="load-form__button" type="button" onClick={createNewRule}>
                    新規作成
                  </button>
                </div>
              ) : (
                <>
              <div className="notification-settings-dialog__section-header">
                <h3>{ruleEditorTitle}</h3>
                <div className="notification-rule-editor__header-actions">
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
                </div>
              </div>
              <h4 className="notification-rule-editor__section-title">1 基本設定</h4>
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
              <div className="notification-rule-editor__conditions">
                <label className="field">
                  <span className="field__label">開始時刻</span>
                  <input
                    className="field__input"
                    placeholder="21:00"
                    value={ruleDraft.schedule.startTime}
                    onChange={(event) => {
                      const startTime = event.target.value;
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        schedule: { ...currentDraft.schedule, startTime }
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field__label">終了時刻（任意）</span>
                  <input
                    className="field__input"
                    placeholder="未設定"
                    value={ruleDraft.schedule.endTime ?? ""}
                    onChange={(event) => {
                      const endTime = event.target.value.trim();
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        schedule: {
                          ...currentDraft.schedule,
                          endTime: endTime.length === 0 ? null : endTime
                        }
                      }));
                    }}
                  />
                </label>
              </div>

              <h4 className="notification-rule-editor__section-title">2 対象</h4>
              <label className="field">
                <span className="field__label">対象ギルド <span className="field__label-note">未指定の場合は全ギルドが対象です</span></span>
                <input className="field__input field__input--wide" disabled value="未指定（全ギルド対象）" />
              </label>

              <h4 className="notification-rule-editor__section-title">3 詳細条件</h4>
              <p className="notification-settings-dialog__note">いずれかの条件ブロックに一致</p>
              <div className="notification-rule-editor__condition-group">
                <div className="notification-rule-editor__condition-group-header">
                  <span className="notification-rule-editor__condition-group-label is-and">AND</span>
                  <span>条件グループ1</span>
                  <small>すべての条件に一致</small>
                  <button type="button">＋ 条件追加</button>
                </div>
                <div className="notification-rule-editor__conditions">
                  <label className="field">
                    <span className="field__label">防御数</span>
                    <input
                      className="field__input"
                      inputMode="numeric"
                      placeholder="以下"
                      value={getDetailConditionValue(ruleDraft, "defenseCount") ?? ""}
                      onChange={(event) => {
                        const value = parseOptionalInteger(event.target.value);
                        setRuleDraft((currentDraft) => updateDetailConditionValue(currentDraft, "defenseCount", "<=", value));
                      }}
                    />
                  </label>
                <label className="field">
                  <span className="field__label">侵攻数</span>
                  <input
                    className="field__input"
                    inputMode="numeric"
                    placeholder="以上"
                    value={getDetailConditionValue(ruleDraft, "attackCount") ?? ""}
                    onChange={(event) => {
                      const value = parseOptionalInteger(event.target.value);
                      setRuleDraft((currentDraft) => updateDetailConditionValue(currentDraft, "attackCount", ">=", value));
                    }}
                  />
                </label>
                </div>
              </div>
              <div className="notification-rule-editor__condition-actions">
                <button type="button">＋ 条件を追加</button>
                <button type="button">＋ グループを追加</button>
              </div>
              <h4 className="notification-rule-editor__section-title">4 Discord通知内容</h4>
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
              {shouldShowRuleActionBar ? (
                <div className="notification-rule-editor__action-bar">
                  <p>
                    {ruleEditorMode === "creating"
                      ? "作成前の通知ルールです。"
                      : "保存されていない変更があります。保存まで通知は一時停止されています。"}
                  </p>
                  <div className="notification-rule-editor__action-buttons">
                    <button type="button" onClick={discardRuleChanges}>
                      {ruleEditorMode === "creating" ? "破棄" : "破棄して戻す"}
                    </button>
                    <button
                      className="load-form__button"
                      disabled={status !== "idle" || isSuspendingSelectedRule}
                      type="button"
                      onClick={() => void saveRule()}
                    >
                      {ruleEditorMode === "creating" ? "作成" : "保存"}
                    </button>
                  </div>
                </div>
              ) : null}
                </>
              )}
            </section>

            <section className="notification-settings-dialog__panel notification-rule-preview-panel">
              <h3>5 通知プレビュー</h3>
              {isRuleEditorVisible ? (
                <div className="notification-preview">
                  <div className="notification-preview__username">{previewUsername}</div>
                  {previewMention.length > 0 ? <div className="notification-preview__mention">{previewMention}</div> : null}
                  <div className="notification-preview__embed">
                    <strong>{previewTitle}</strong>
                    <p>{previewBody}</p>
                  </div>
                </div>
              ) : (
                <p className="notification-settings-dialog__empty">ルールを選択するとプレビューできます。</p>
              )}
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
    ...createDefaultNotificationRuleV2Draft(battleType, 0)
  };
}

function createRuleDraft(rule: NotificationRule): RuleDraft {
  return {
    id: rule.id,
    ...createNotificationRuleV2DraftFromLegacy(rule, 0)
  };
}

function toRuleInput(ruleDraft: RuleDraft) {
  return createLegacyNotificationRuleInputFromV2Draft(ruleDraft);
}

function serializeRuleDraft(ruleDraft: RuleDraft): string {
  return JSON.stringify(ruleDraft);
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

  if (!START_TIME_PATTERN.test(ruleDraft.schedule.startTime)) {
    return "開始時刻はHH:mm形式で入力してください。";
  }

  if (
    ruleDraft.schedule.endTime !== undefined &&
    ruleDraft.schedule.endTime !== null &&
    !START_TIME_PATTERN.test(ruleDraft.schedule.endTime)
  ) {
    return "終了時刻はHH:mm形式で入力してください。";
  }

  if (
    !isNullableNonNegativeInteger(getDetailConditionValue(ruleDraft, "defenseCount")) ||
    !isNullableNonNegativeInteger(getDetailConditionValue(ruleDraft, "attackCount"))
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

function getDetailConditionValue(ruleDraft: RuleDraft, field: NotificationDetailConditionField): number | null {
  const firstGroup = ruleDraft.detailConditions.children.find((child) => child.type === "group");
  if (firstGroup?.type !== "group") {
    return null;
  }

  const operator: NotificationDetailConditionOperator = field === "defenseCount" ? "<=" : ">=";
  return firstGroup.children.find((condition) => condition.field === field && condition.operator === operator)?.value ?? null;
}

function updateDetailConditionValue(
  ruleDraft: RuleDraft,
  field: NotificationDetailConditionField,
  operator: NotificationDetailConditionOperator,
  value: number | null
): RuleDraft {
  const nextChildren = ruleDraft.detailConditions.children.map((child) => {
    if (child.type !== "group") {
      return child;
    }

    const existingCondition = child.children.find(
      (condition) => condition.field === field && condition.operator === operator
    );
    const filteredChildren = child.children.filter(
      (condition) => !(condition.field === field && condition.operator === operator)
    );

    return {
      ...child,
      children:
        value === null
          ? filteredChildren
          : [
              ...filteredChildren,
              {
                ...(existingCondition ?? { type: "condition" as const, field, operator }),
                value
              }
            ]
    };
  });

  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: nextChildren
    }
  };
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
