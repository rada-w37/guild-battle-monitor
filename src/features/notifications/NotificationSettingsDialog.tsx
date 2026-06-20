import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  applyNotificationTemplate,
  DEFAULT_NOTIFICATION_USERNAME_TEMPLATE,
  NOTIFICATION_TEMPLATE_VARIABLES
} from "./notificationTemplates";
import {
  deleteNotificationRule as deleteNotificationRuleDefault,
  getNotificationSettings as getNotificationSettingsDefault,
  getNotificationSettingsV2 as getNotificationSettingsV2Default,
  saveNotificationDestination as saveNotificationDestinationDefault,
  saveNotificationRule as saveNotificationRuleDefault,
  saveNotificationRuleV2 as saveNotificationRuleV2Default,
  syncGuildBattleGuildCandidates as syncGuildBattleGuildCandidatesDefault,
  suspendNotificationRule as suspendNotificationRuleDefault,
  type DeleteNotificationRuleRequest,
  type GuildBattleGuildCandidate,
  type NotificationSettingsRequest,
  type SaveNotificationDestinationRequest,
  type SaveNotificationRuleRequest,
  type SaveNotificationRuleV2Request,
  type SuspendNotificationRuleRequest
} from "./notificationSettingsFunctionsRepository";
import {
  createDefaultNotificationRuleV2Draft,
  createLegacyNotificationRuleInputFromV2Draft,
  createNotificationRuleV2DraftFromLegacy,
  type NotificationRuleV2Draft
} from "./notificationRuleV2Draft";
import {
  hasNonAttackingTargetWarning,
  moveDetailConditionNode,
  type NotificationDetailConditionDragSource,
  type NotificationDetailConditionDropTarget
} from "./notificationDetailConditions";
import type {
  NotificationBattleType,
  NotificationDestination,
  NotificationDetailCondition,
  NotificationDetailConditionField,
  NotificationDetailConditionGroupOperator,
  NotificationDetailConditionOperator,
  NotificationRule,
  NotificationRuleV2,
  NotificationRuleV2Input,
  NotificationSettingsRole
} from "./types";

const DISCORD_WEBHOOK_URL_PATTERN = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^/\s]+\/[^/\s]+$/;
const START_TIME_PATTERN = /^\d{2}:\d{2}$/;
const DETAIL_CONDITION_FIELDS: readonly NotificationDetailConditionField[] = ["defenseCount", "attackCount"];
const DETAIL_CONDITION_OPERATORS: readonly NotificationDetailConditionOperator[] = ["<=", ">="];

interface NotificationSettingsDialogProps {
  readonly request: NotificationSettingsRequest;
  readonly role: NotificationSettingsRole;
  readonly getNotificationSettings?: typeof getNotificationSettingsDefault;
  readonly getNotificationSettingsV2?: typeof getNotificationSettingsV2Default;
  readonly saveNotificationRule?: typeof saveNotificationRuleDefault;
  readonly saveNotificationRuleV2?: typeof saveNotificationRuleV2Default;
  readonly deleteNotificationRule?: typeof deleteNotificationRuleDefault;
  readonly suspendNotificationRule?: typeof suspendNotificationRuleDefault;
  readonly saveNotificationDestination?: typeof saveNotificationDestinationDefault;
  readonly syncGuildBattleGuildCandidates?: typeof syncGuildBattleGuildCandidatesDefault;
  readonly targetGuildWorld?: number | null;
  readonly useRuleV2Storage?: boolean;
  readonly onClose: () => void;
}

interface RuleDraft extends NotificationRuleV2Draft {
  readonly id?: string;
}

interface RuleRecord extends RuleDraft {
  readonly id: string;
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
  getNotificationSettingsV2 = getNotificationSettingsV2Default,
  saveNotificationRule = saveNotificationRuleDefault,
  saveNotificationRuleV2 = saveNotificationRuleV2Default,
  deleteNotificationRule = deleteNotificationRuleDefault,
  suspendNotificationRule = suspendNotificationRuleDefault,
  saveNotificationDestination = saveNotificationDestinationDefault,
  syncGuildBattleGuildCandidates = syncGuildBattleGuildCandidatesDefault,
  targetGuildWorld = null,
  useRuleV2Storage = false,
  onClose
}: NotificationSettingsDialogProps) {
  const [activeBattleType, setActiveBattleType] = useState<NotificationBattleType>("guildBattle");
  const [rules, setRules] = useState<readonly RuleRecord[]>([]);
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
  const [targetGuildCandidates, setTargetGuildCandidates] = useState<readonly GuildBattleGuildCandidate[]>([]);
  const [targetGuildCandidateStatus, setTargetGuildCandidateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [suspendedRuleIds, setSuspendedRuleIds] = useState<readonly string[]>([]);
  const [pendingSuspensionRuleId, setPendingSuspensionRuleId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<NotificationDetailConditionDragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<NotificationDetailConditionDropTarget | null>(null);

  useEffect(() => {
    let isDisposed = false;
    setStatus("loading");
    setError(null);
    setMessage(null);

    const settingsPromise = useRuleV2Storage
      ? getNotificationSettingsV2(request).then((settings) => ({
          rules: settings.rules.map(createRuleRecordFromV2),
          destination: settings.destination
        }))
      : getNotificationSettings(request).then((settings) => ({
          rules: settings.rules.map(createRuleRecordFromLegacy),
          destination: settings.destination
        }));

    void settingsPromise
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
  }, [activeBattleType, getNotificationSettings, getNotificationSettingsV2, request, role, useRuleV2Storage]);

  const visibleRules = useMemo(
    () => rules.filter((rule) => rule.battleType === activeBattleType),
    [activeBattleType, rules]
  );
  const canSaveDestination = role === "guildOwner";
  const previewMention = createMentionPreview(ruleDraft.message.mention);
  const previewUsername = applyNotificationTemplate(ruleDraft.message.usernameTemplate);
  const previewTitle = applyNotificationTemplate(ruleDraft.message.titleTemplate);
  const previewBody = applyNotificationTemplate(ruleDraft.message.bodyTemplate);
  const shouldShowNonAttackingTargetWarning = hasNonAttackingTargetWarning(ruleDraft.detailConditions);
  const isGrandBattlePreparing = activeBattleType === "grandBattle";
  const isRuleEditorVisible = ruleEditorMode !== "empty";
  const ruleEditorTitle = ruleEditorMode === "creating" ? "通知ルール新規作成" : "通知ルール編集";
  const isRuleDraftDirty =
    ruleEditorMode === "editing" && savedRuleDraft !== null && serializeRuleDraft(ruleDraft) !== serializeRuleDraft(savedRuleDraft);
  const shouldShowRuleActionBar = ruleEditorMode === "creating" || isRuleDraftDirty;
  const isSuspendingSelectedRule = selectedRuleId !== null && pendingSuspensionRuleId === selectedRuleId;

  useEffect(() => {
    if (activeBattleType !== "guildBattle" || targetGuildWorld === null) {
      setTargetGuildCandidates([]);
      setTargetGuildCandidateStatus("idle");
      return;
    }

    let isDisposed = false;
    setTargetGuildCandidateStatus("loading");

    void syncGuildBattleGuildCandidates(request)
      .then((result) => {
        if (isDisposed) {
          return;
        }

        setTargetGuildCandidates(result.candidates);
        setTargetGuildCandidateStatus("idle");
      })
      .catch(() => {
        if (!isDisposed) {
          setTargetGuildCandidates([]);
          setTargetGuildCandidateStatus("error");
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [activeBattleType, request, syncGuildBattleGuildCandidates, targetGuildWorld]);

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
    setDragSource(null);
    setDropTarget(null);
    setRuleError(null);
  }

  function selectRule(rule: RuleRecord) {
    if (rule.battleType === "grandBattle") {
      setSelectedRuleId(null);
      setRuleEditorMode("empty");
      setRuleDraft(createDefaultRuleDraft(activeBattleType));
      setSavedRuleDraft(null);
      setRuleError(null);
      setMessage(null);
      setDragSource(null);
      setDropTarget(null);
      return;
    }

    const nextDraft = createRuleDraft(rule);
    setSelectedRuleId(rule.id);
    setRuleEditorMode("editing");
    setRuleDraft(nextDraft);
    setSavedRuleDraft(nextDraft);
    setRuleError(null);
    setMessage(null);
    setPendingSuspensionRuleId(null);
    setDragSource(null);
    setDropTarget(null);
  }

  function createNewRule() {
    if (isGrandBattlePreparing) {
      return;
    }

    setSelectedRuleId(null);
    setRuleEditorMode("creating");
    setRuleDraft(createDefaultRuleDraft(activeBattleType));
    setSavedRuleDraft(null);
    setRuleError(null);
    setMessage(null);
    setPendingSuspensionRuleId(null);
    setDragSource(null);
    setDropTarget(null);
  }

  function duplicateRule(rule: RuleRecord) {
    if (rule.battleType === "grandBattle" || isGrandBattlePreparing) {
      return;
    }

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
    setDragSource(null);
    setDropTarget(null);
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
      const savedRule = useRuleV2Storage
        ? createRuleRecordFromV2(
            await saveNotificationRuleV2({
              ...request,
              ...(selectedRuleId === null ? {} : { ruleId: selectedRuleId }),
              rule: toRuleV2Input(ruleDraft)
            } satisfies SaveNotificationRuleV2Request)
          )
        : createRuleRecordFromLegacy(
            await saveNotificationRule({
              ...request,
              ...(selectedRuleId === null ? {} : { ruleId: selectedRuleId }),
              rule: toLegacyRuleInput(ruleDraft)
            } satisfies SaveNotificationRuleRequest)
          );
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

  async function deleteRule(rule: RuleRecord) {
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

  function startConditionDrag(event: DragEvent<HTMLElement>, source: NotificationDetailConditionDragSource) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "notification-condition");
    setDragSource(source);
    setDropTarget(null);
  }

  function updateConditionDropTarget(event: DragEvent<HTMLElement>, target: NotificationDetailConditionDropTarget) {
    if (dragSource === null || !canDropConditionNode(dragSource, target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  }

  function dropConditionNode(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (dragSource !== null && dropTarget !== null && canDropConditionNode(dragSource, dropTarget)) {
      setRuleDraft((currentDraft) => ({
        ...currentDraft,
        detailConditions: moveDetailConditionNode(currentDraft.detailConditions, dragSource, dropTarget)
      }));
    }

    setDragSource(null);
    setDropTarget(null);
  }

  function endConditionDrag() {
    setDragSource(null);
    setDropTarget(null);
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
                <button className="load-form__button" disabled={isGrandBattlePreparing} type="button" onClick={createNewRule}>
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
                    <button
                      className="notification-rule-card__main"
                      disabled={rule.battleType === "grandBattle"}
                      type="button"
                      onClick={() => selectRule(rule)}
                    >
                      <span className="notification-rule-card__title">{rule.name}</span>
                      <span className={rule.enabled ? "notification-rule-card__status is-enabled" : "notification-rule-card__status"}>
                        {rule.enabled ? "有効" : "無効"}
                      </span>
                      <span className="notification-rule-card__summary">{createRuleConditionSummary(rule)}</span>
                      {rule.id === selectedRuleId && isRuleDraftDirty ? (
                        <span className="notification-rule-card__pause-status">保存まで一時停止</span>
                      ) : null}
                    </button>
                    <div className="notification-rule-card__actions">
                      <button disabled={rule.battleType === "grandBattle"} type="button" onClick={() => selectRule(rule)}>編集</button>
                      <button disabled={rule.battleType === "grandBattle"} type="button" onClick={() => duplicateRule(rule)}>複製</button>
                      <button type="button" onClick={() => void deleteRule(rule)}>削除</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="notification-rule-workspace">
              <div className="notification-rule-workspace__columns">
            <section className="notification-settings-dialog__panel notification-rule-editor">
              {!isRuleEditorVisible ? (
                isGrandBattlePreparing ? (
                  <div className="notification-rule-editor__empty-state">
                    <h3>{"Grand Battle\u901a\u77e5\u8a2d\u5b9a\u306f\u6e96\u5099\u4e2d\u3067\u3059"}</h3>
                    <p className="notification-settings-dialog__empty">
                      {"KOO\u5074\u306eGrand Battle v2\u5224\u5b9a\u5bfe\u5fdc\u5f8c\u306b\u4fdd\u5b58\u3067\u304d\u308b\u3088\u3046\u306b\u3057\u307e\u3059\u3002"}
                    </p>
                  </div>
                ) : (
                  <div className="notification-rule-editor__empty-state">
                    <h3>{"\u901a\u77e5\u30eb\u30fc\u30eb\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044"}</h3>
                    <p className="notification-settings-dialog__empty">
                      {"\u65e2\u5b58\u30eb\u30fc\u30eb\u3092\u7de8\u96c6\u3059\u308b\u304b\u3001\u65b0\u898f\u4f5c\u6210\u304b\u3089\u901a\u77e5\u6761\u4ef6\u3092\u8a2d\u5b9a\u3067\u304d\u307e\u3059\u3002"}
                    </p>
                    <button className="load-form__button" type="button" onClick={createNewRule}>
                      {"\u65b0\u898f\u4f5c\u6210"}
                    </button>
                  </div>
                )
              ) : (
                <>
              <div className="notification-rule-editor__topbar">
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

              <h4 className="notification-rule-editor__section-title">{"2 \u5bfe\u8c61"}</h4>
              <label className="field">
                <span className="field__label">
                  {"\u5bfe\u8c61\u30ae\u30eb\u30c9"}
                  <span className="field__label-note">{"\u672a\u6307\u5b9a\u306e\u5834\u5408\u306f\u5168\u30ae\u30eb\u30c9\u304c\u5bfe\u8c61\u3067\u3059"}</span>
                </span>
                <select
                  className="field__input field__input--wide"
                  disabled={targetGuildWorld === null || targetGuildCandidateStatus === "loading"}
                  value={ruleDraft.targetGuildIds[0] ?? ""}
                  onChange={(event) => {
                    const targetGuildId = event.target.value;
                    setRuleDraft((currentDraft) => ({
                      ...currentDraft,
                      targetGuildIds: targetGuildId.length === 0 ? [] : [targetGuildId]
                    }));
                  }}
                >
                  <option value="">{"\u672a\u6307\u5b9a\uff08\u5168\u30ae\u30eb\u30c9\u5bfe\u8c61\uff09"}</option>
                  {targetGuildCandidates.map((candidate) => (
                    <option key={candidate.guildId} value={candidate.guildId}>
                      {candidate.guildName}
                    </option>
                  ))}
                </select>
              </label>
              {targetGuildWorld === null ? (
                <p className="notification-settings-dialog__note">
                  {"\u5bfe\u8c61\u30ae\u30eb\u30c9\u5019\u88dc\u3092\u53d6\u5f97\u3059\u308b\u306b\u306f\u3001\u6240\u5c5e\u30ae\u30eb\u30c9\u8a2d\u5b9a\u3067\u30ef\u30fc\u30eb\u30c9\u3092\u767b\u9332\u3057\u3066\u304f\u3060\u3055\u3044\u3002"}
                </p>
              ) : null}
              {targetGuildCandidateStatus === "error" ? (
                <p className="notification-settings-dialog__note">
                  {"\u5bfe\u8c61\u30ae\u30eb\u30c9\u5019\u88dc\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002"}
                </p>
              ) : null}

              <h4 className="notification-rule-editor__section-title">{"3 \u8a73\u7d30\u6761\u4ef6"}</h4>
              <p className="notification-settings-dialog__note">{"\u3044\u305a\u308c\u304b\u306e\u6761\u4ef6\u30d6\u30ed\u30c3\u30af\u306b\u4e00\u81f4"}</p>
              <div
                className="notification-rule-editor__condition-tree"
                onDragOver={(event) =>
                  updateConditionDropTarget(event, {
                    scope: "root",
                    index: ruleDraft.detailConditions.children.length
                  })
                }
                onDrop={dropConditionNode}
              >
                {ruleDraft.detailConditions.children.map((conditionNode, nodeIndex) =>
                  conditionNode.type === "group" ? (
                    <div key={`group-${nodeIndex}`}>
                      <DropIndicator isActive={isRootDropTarget(dropTarget, nodeIndex)} />
                      <div
                        className={`notification-rule-editor__condition-group is-${conditionNode.operator.toLowerCase()}`}
                        draggable
                        onDragEnd={endConditionDrag}
                        onDragStart={(event) => startConditionDrag(event, { scope: "root", index: nodeIndex })}
                        onDragOver={(event) =>
                          updateConditionDropTarget(event, {
                            scope: "root",
                            index: getDropIndex(event, nodeIndex)
                          })
                        }
                        onDrop={dropConditionNode}
                      >
                        <div className="notification-rule-editor__condition-group-header">
                        <select
                          className="notification-rule-editor__condition-group-label"
                          value={conditionNode.operator}
                          onChange={(event) => {
                            const operator = event.target.value as NotificationDetailConditionGroupOperator;
                            setRuleDraft((currentDraft) => updateConditionGroupOperator(currentDraft, nodeIndex, operator));
                          }}
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                        <span>{"\u6761\u4ef6\u30b0\u30eb\u30fc\u30d7"}{nodeIndex + 1}</span>
                        <small>{conditionNode.operator === "AND" ? "\u3059\u3079\u3066\u306e\u6761\u4ef6\u306b\u4e00\u81f4" : "\u3044\u305a\u308c\u304b\u306e\u6761\u4ef6\u306b\u4e00\u81f4"}</small>
                        <button type="button" onClick={() => setRuleDraft((currentDraft) => addGroupCondition(currentDraft, nodeIndex))}>
                          {"\uff0b \u6761\u4ef6\u8ffd\u52a0"}
                        </button>
                        <button type="button" onClick={() => setRuleDraft((currentDraft) => removeRootConditionNode(currentDraft, nodeIndex))}>
                          {"\u524a\u9664"}
                        </button>
                      </div>
                      <div
                        className="notification-rule-editor__condition-list"
                        onDragOver={(event) =>
                          updateConditionDropTarget(event, {
                            scope: "group",
                            groupIndex: nodeIndex,
                            index: conditionNode.children.length
                          })
                        }
                        onDrop={dropConditionNode}
                      >
                        {conditionNode.children.map((condition, conditionIndex) => (
                          <div key={`group-${nodeIndex}-condition-${conditionIndex}`}>
                            <DropIndicator isActive={isGroupDropTarget(dropTarget, nodeIndex, conditionIndex)} />
                            <ConditionRow
                              condition={condition}
                              draggable
                              onChange={(nextCondition) =>
                                setRuleDraft((currentDraft) =>
                                  updateGroupCondition(currentDraft, nodeIndex, conditionIndex, nextCondition)
                                )
                              }
                              onDragEnd={endConditionDrag}
                              onDragOver={(event) =>
                                updateConditionDropTarget(event, {
                                  scope: "group",
                                  groupIndex: nodeIndex,
                                  index: getDropIndex(event, conditionIndex)
                                })
                              }
                              onDragStart={(event) =>
                                startConditionDrag(event, {
                                  scope: "group",
                                  groupIndex: nodeIndex,
                                  conditionIndex
                                })
                              }
                              onRemove={() =>
                                setRuleDraft((currentDraft) => removeGroupCondition(currentDraft, nodeIndex, conditionIndex))
                              }
                            />
                          </div>
                        ))}
                        <DropIndicator isActive={isGroupDropTarget(dropTarget, nodeIndex, conditionNode.children.length)} />
                      </div>
                      </div>
                    </div>
                  ) : (
                    <div key={`condition-${nodeIndex}`}>
                      <DropIndicator isActive={isRootDropTarget(dropTarget, nodeIndex)} />
                    <div
                      className="notification-rule-editor__condition-card"
                      draggable
                      onDragEnd={endConditionDrag}
                      onDragStart={(event) => startConditionDrag(event, { scope: "root", index: nodeIndex })}
                      onDragOver={(event) =>
                        updateConditionDropTarget(event, {
                          scope: "root",
                          index: getDropIndex(event, nodeIndex)
                        })
                      }
                      onDrop={dropConditionNode}
                    >
                      <ConditionRow
                        condition={conditionNode}
                        onChange={(nextCondition) =>
                          setRuleDraft((currentDraft) => updateRootCondition(currentDraft, nodeIndex, nextCondition))
                        }
                        onRemove={() => setRuleDraft((currentDraft) => removeRootConditionNode(currentDraft, nodeIndex))}
                      />
                    </div>
                    </div>
                  )
                )}
                <DropIndicator isActive={isRootDropTarget(dropTarget, ruleDraft.detailConditions.children.length)} />
              </div>
              <div className="notification-rule-editor__condition-actions">
                <button type="button" onClick={() => setRuleDraft(addRootCondition)}>
                  {"\uff0b \u6761\u4ef6\u3092\u8ffd\u52a0"}
                </button>
                <button type="button" onClick={() => setRuleDraft(addRootConditionGroup)}>
                  {"\uff0b \u30b0\u30eb\u30fc\u30d7\u3092\u8ffd\u52a0"}
                </button>
              </div>
              {shouldShowNonAttackingTargetWarning ? (
                <div className="notification-rule-editor__condition-warning">
                  {"\u653b\u6483\u4e2d\u3067\u306a\u3044\u62e0\u70b9\u3082\u901a\u77e5\u5bfe\u8c61\u306b\u306a\u308b\u6761\u4ef6\u304c\u3042\u308a\u307e\u3059\u3002"}
                  <br />
                  {"\u9632\u885b\u914d\u7f6e\u5fd8\u308c\u691c\u77e5\u306a\u3069\u3092\u76ee\u7684\u3068\u3059\u308b\u5834\u5408\u306f\u3001\u3053\u306e\u307e\u307e\u3067\u554f\u984c\u3042\u308a\u307e\u305b\u3093\u3002"}
                </div>
              ) : null}
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
                <div className="notification-rule-editor__action-bar notification-rule-editor__action-bar--inline">
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
                  <div className="notification-preview__header">
                    <div className="notification-preview__avatar" aria-hidden="true">
                      Discord
                    </div>
                    <div>
                      <div className="notification-preview__username">{previewUsername}</div>
                      {previewMention.length > 0 ? <div className="notification-preview__mention">{previewMention}</div> : null}
                    </div>
                  </div>
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
              {shouldShowRuleActionBar ? (
                <div className="notification-rule-workspace__action-bar">
                  <p>
                    {ruleEditorMode === "creating"
                      ? "\u4f5c\u6210\u524d\u306e\u901a\u77e5\u30eb\u30fc\u30eb\u3067\u3059\u3002"
                      : "\u4fdd\u5b58\u3055\u308c\u3066\u3044\u306a\u3044\u5909\u66f4\u304c\u3042\u308a\u307e\u3059\u3002\u4fdd\u5b58\u307e\u3067\u901a\u77e5\u306f\u4e00\u6642\u505c\u6b62\u3055\u308c\u3066\u3044\u307e\u3059\u3002"}
                  </p>
                  <div className="notification-rule-editor__action-buttons">
                    <button type="button" onClick={discardRuleChanges}>
                      {ruleEditorMode === "creating" ? "\u7834\u68c4" : "\u7834\u68c4\u3057\u3066\u623b\u3059"}
                    </button>
                    <button
                      className="load-form__button"
                      disabled={status !== "idle" || isSuspendingSelectedRule}
                      type="button"
                      onClick={() => void saveRule()}
                    >
                      {ruleEditorMode === "creating" ? "\u4f5c\u6210" : "\u4fdd\u5b58"}
                    </button>
                  </div>
                </div>
              ) : null}
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

function createRuleRecordFromLegacy(rule: NotificationRule): RuleRecord {
  return {
    id: rule.id,
    ...createNotificationRuleV2DraftFromLegacy(rule, 0)
  };
}

function createRuleRecordFromV2(rule: NotificationRuleV2): RuleRecord {
  return {
    ...rule,
    message: {
      ...rule.message,
      mention: { ...rule.message.mention }
    },
    schedule: { ...rule.schedule },
    targetGuildIds: [...rule.targetGuildIds],
    detailConditions: {
      ...rule.detailConditions,
      children: rule.detailConditions.children.map((node) =>
        node.type === "condition" ? { ...node } : { ...node, children: node.children.map((condition) => ({ ...condition })) }
      )
    }
  };
}

function createRuleDraft(rule: RuleRecord): RuleDraft {
  return {
    ...rule,
    id: rule.id,
    message: {
      ...rule.message,
      mention: { ...rule.message.mention }
    },
    schedule: { ...rule.schedule },
    targetGuildIds: [...rule.targetGuildIds],
    detailConditions: {
      ...rule.detailConditions,
      children: rule.detailConditions.children.map((node) =>
        node.type === "condition" ? { ...node } : { ...node, children: node.children.map((condition) => ({ ...condition })) }
      )
    }
  };
}

function toLegacyRuleInput(ruleDraft: RuleDraft) {
  return createLegacyNotificationRuleInputFromV2Draft(ruleDraft);
}

function toRuleV2Input(ruleDraft: RuleDraft): NotificationRuleV2Input {
  const { id: _id, ...input } = ruleDraft;
  return input;
}

function serializeRuleDraft(ruleDraft: RuleDraft): string {
  return JSON.stringify(ruleDraft);
}

function ConditionRow({
  condition,
  draggable = false,
  onChange,
  onDragEnd,
  onDragOver,
  onDragStart,
  onRemove
}: {
  readonly condition: NotificationDetailCondition;
  readonly draggable?: boolean;
  readonly onChange: (condition: NotificationDetailCondition) => void;
  readonly onDragEnd?: () => void;
  readonly onDragOver?: (event: DragEvent<HTMLElement>) => void;
  readonly onDragStart?: (event: DragEvent<HTMLElement>) => void;
  readonly onRemove: () => void;
}) {
  return (
    <div
      className={draggable ? "notification-rule-editor__condition-row is-draggable" : "notification-rule-editor__condition-row"}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
    >
      <select
        className="field__input"
        value={condition.field}
        onChange={(event) => {
          const field = event.target.value as NotificationDetailConditionField;
          onChange({
            ...condition,
            field,
            operator: getDefaultDetailConditionOperator(field),
            value: field === "defenseCount" ? 30 : 1
          });
        }}
      >
        {DETAIL_CONDITION_FIELDS.map((field) => (
          <option key={field} value={field}>
            {getDetailConditionFieldLabel(field)}
          </option>
        ))}
      </select>
      <select
        className="field__input"
        value={condition.operator}
        onChange={(event) =>
          onChange({
            ...condition,
            operator: event.target.value as NotificationDetailConditionOperator
          })
        }
      >
        {DETAIL_CONDITION_OPERATORS.map((operator) => (
          <option key={operator} value={operator}>
            {operator}
          </option>
        ))}
      </select>
      <input
        className="field__input"
        inputMode="numeric"
        min={0}
        type="number"
        value={condition.value}
        onChange={(event) => {
          onChange({
            ...condition,
            value: Math.max(0, parseOptionalInteger(event.target.value) ?? 0)
          });
        }}
      />
      <button type="button" onClick={onRemove}>
        {"\u524a\u9664"}
      </button>
    </div>
  );
}

function DropIndicator({ isActive }: { readonly isActive: boolean }) {
  return <div className={isActive ? "notification-rule-editor__drop-indicator is-active" : "notification-rule-editor__drop-indicator"} />;
}

function addRootCondition(ruleDraft: RuleDraft): RuleDraft {
  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: [...ruleDraft.detailConditions.children, createDefaultDetailCondition("defenseCount")]
    }
  };
}

function addRootConditionGroup(ruleDraft: RuleDraft): RuleDraft {
  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: [
        ...ruleDraft.detailConditions.children,
        {
          type: "group",
          operator: "AND",
          children: [
            createDefaultDetailCondition("defenseCount"),
            createDefaultDetailCondition("attackCount")
          ]
        }
      ]
    }
  };
}

function addGroupCondition(ruleDraft: RuleDraft, groupIndex: number): RuleDraft {
  return updateConditionGroup(ruleDraft, groupIndex, (group) => ({
    ...group,
    children: [...group.children, createDefaultDetailCondition("defenseCount")]
  }));
}

function updateConditionGroupOperator(
  ruleDraft: RuleDraft,
  groupIndex: number,
  operator: NotificationDetailConditionGroupOperator
): RuleDraft {
  return updateConditionGroup(ruleDraft, groupIndex, (group) => ({ ...group, operator }));
}

function updateGroupCondition(
  ruleDraft: RuleDraft,
  groupIndex: number,
  conditionIndex: number,
  condition: NotificationDetailCondition
): RuleDraft {
  return updateConditionGroup(ruleDraft, groupIndex, (group) => ({
    ...group,
    children: group.children.map((currentCondition, currentIndex) =>
      currentIndex === conditionIndex ? condition : currentCondition
    )
  }));
}

function removeGroupCondition(ruleDraft: RuleDraft, groupIndex: number, conditionIndex: number): RuleDraft {
  return updateConditionGroup(ruleDraft, groupIndex, (group) => ({
    ...group,
    children: group.children.filter((_, currentIndex) => currentIndex !== conditionIndex)
  }));
}

function updateRootCondition(ruleDraft: RuleDraft, nodeIndex: number, condition: NotificationDetailCondition): RuleDraft {
  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: ruleDraft.detailConditions.children.map((currentNode, currentIndex) =>
        currentIndex === nodeIndex ? condition : currentNode
      )
    }
  };
}

function removeRootConditionNode(ruleDraft: RuleDraft, nodeIndex: number): RuleDraft {
  const nextChildren = ruleDraft.detailConditions.children.filter((_, currentIndex) => currentIndex !== nodeIndex);
  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: nextChildren.length === 0 ? [createDefaultConditionGroup()] : nextChildren
    }
  };
}

function updateConditionGroup(
  ruleDraft: RuleDraft,
  groupIndex: number,
  update: (group: Extract<RuleDraft["detailConditions"]["children"][number], { readonly type: "group" }>) =>
    Extract<RuleDraft["detailConditions"]["children"][number], { readonly type: "group" }>
): RuleDraft {
  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: ruleDraft.detailConditions.children.map((currentNode, currentIndex) => {
        if (currentIndex !== groupIndex || currentNode.type !== "group") {
          return currentNode;
        }

        const nextGroup = update(currentNode);
        return nextGroup.children.length === 0
          ? { ...nextGroup, children: [createDefaultDetailCondition("defenseCount")] }
          : nextGroup;
      })
    }
  };
}

function createDefaultConditionGroup(): RuleDraft["detailConditions"]["children"][number] {
  return {
    type: "group",
    operator: "AND",
    children: [
      createDefaultDetailCondition("defenseCount"),
      createDefaultDetailCondition("attackCount")
    ]
  };
}

function createDefaultDetailCondition(field: NotificationDetailConditionField): NotificationDetailCondition {
  return {
    type: "condition",
    field,
    operator: getDefaultDetailConditionOperator(field),
    value: field === "defenseCount" ? 30 : 1
  };
}

function getDefaultDetailConditionOperator(
  field: NotificationDetailConditionField
): NotificationDetailConditionOperator {
  return field === "defenseCount" ? "<=" : ">=";
}

function getDetailConditionFieldLabel(field: NotificationDetailConditionField): string {
  return field === "defenseCount" ? "\u9632\u885b\u6570" : "\u4fb5\u653b\u6570";
}

function getDropIndex(event: DragEvent<HTMLElement>, itemIndex: number): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? itemIndex + 1 : itemIndex;
}

function canDropConditionNode(
  source: NotificationDetailConditionDragSource,
  target: NotificationDetailConditionDropTarget
): boolean {
  if (source.scope === "root" && target.scope === "root") {
    return true;
  }

  return source.scope === "group" && target.scope === "group" && source.groupIndex === target.groupIndex;
}

function isRootDropTarget(target: NotificationDetailConditionDropTarget | null, index: number): boolean {
  return target?.scope === "root" && target.index === index;
}

function isGroupDropTarget(
  target: NotificationDetailConditionDropTarget | null,
  groupIndex: number,
  index: number
): boolean {
  return target?.scope === "group" && target.groupIndex === groupIndex && target.index === index;
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

  if (!isValidDetailConditionRoot(ruleDraft.detailConditions)) {
    return "\u8a73\u7d30\u6761\u4ef6\u306f0\u4ee5\u4e0a\u306e\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
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

function isValidDetailConditionRoot(detailConditions: RuleDraft["detailConditions"]): boolean {
  return (
    detailConditions.operator === "OR" &&
    detailConditions.children.length > 0 &&
    detailConditions.children.every((node) =>
      node.type === "condition"
        ? isValidDetailCondition(node)
        : node.children.length > 0 && node.children.every(isValidDetailCondition)
    )
  );
}

function isValidDetailCondition(condition: NotificationDetailCondition): boolean {
  return (
    DETAIL_CONDITION_FIELDS.includes(condition.field) &&
    DETAIL_CONDITION_OPERATORS.includes(condition.operator) &&
    Number.isSafeInteger(condition.value) &&
    condition.value >= 0
  );
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

function createRuleConditionSummary(rule: RuleRecord): string {
  const firstGroup = rule.detailConditions.children.find((child) => child.type === "group");
  const conditions = firstGroup?.type === "group" ? firstGroup.children : [];
  const defenseCondition = conditions.find((condition) => condition.field === "defenseCount" && condition.operator === "<=");
  const attackCondition = conditions.find((condition) => condition.field === "attackCount" && condition.operator === ">=");
  const defense = defenseCondition === undefined ? "\u9632\u885b\u672a\u6307\u5b9a" : `\u9632\u885b${defenseCondition.value}\u4ee5\u4e0b`;
  const attack = attackCondition === undefined ? "\u4fb5\u653b\u672a\u6307\u5b9a" : `\u4fb5\u653b${attackCondition.value}\u4ee5\u4e0a`;
  return `${rule.schedule.startTime} / ${defense} / ${attack}`;
}
