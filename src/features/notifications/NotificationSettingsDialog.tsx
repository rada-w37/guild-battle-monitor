import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
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
  canConditionNodeMatchWithoutAttack,
  canMatchWithoutAttack,
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
const START_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DETAIL_CONDITION_FIELDS: readonly NotificationDetailConditionField[] = ["defenseCount", "attackCount"];
const DETAIL_CONDITION_OPERATORS: readonly NotificationDetailConditionOperator[] = ["<=", ">="];
const DRAFT_RULE_ID = "__notification_rule_draft__";
const NEW_RULE_DRAFT_NAME = "新規ルール";
const NON_ATTACKING_WARNING_TITLE = "攻撃中でない拠点もこの条件に一致する可能性があります。";
const NOTIFICATION_SUMMARY_MAX_LENGTH = 120;
const CONDITION_DROP_HYSTERESIS_PX = 10;
const DRAG_HANDLE_LABEL = "\u22ee\u22ee";
const DRAG_HANDLE_ARIA_LABEL = "\u4e26\u3079\u66ff\u3048";
const DETAIL_RULE_OFF_DISABLED_VARIABLES = [
  "{拠点名}",
  "{侵攻ギルド}",
  "{防衛ギルド}",
  "{防衛数}",
  "{侵攻数}"
] as const;
const DETAIL_RULE_OFF_VARIABLE_DISABLED_REASON = "詳細ルールOFF時は利用できません";

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
  readonly initialBattleType?: NotificationBattleType;
  readonly useRuleV2Storage?: boolean;
  readonly onClose: () => void;
}

interface RuleDraft extends NotificationRuleV2Draft {
  readonly id?: string;
  readonly guildFilterSelectionMode: "all" | "specific";
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
type PendingDiscardAction =
  | { readonly type: "create" }
  | { readonly type: "duplicate"; readonly ruleId: string }
  | { readonly type: "select"; readonly ruleId: string };
type RuleListItem = { readonly type: "saved" | "draft"; readonly rule: RuleRecord };
type DropIndexScope =
  | { readonly scope: "root" }
  | { readonly scope: "group"; readonly groupIndex: number };
type TemplateFieldName = "usernameTemplate" | "titleTemplate" | "bodyTemplate";
type TemplateFieldElement = HTMLInputElement | HTMLTextAreaElement;
interface TemplateFieldTarget {
  readonly field: TemplateFieldName;
  readonly element: TemplateFieldElement;
}
interface RuleCardPointerState {
  readonly ruleId: string;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}
interface DiscardConfirmationContent {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
}

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
  initialBattleType = "guildBattle",
  useRuleV2Storage = false,
  onClose
}: NotificationSettingsDialogProps) {
  const [activeBattleType, setActiveBattleType] = useState<NotificationBattleType>(initialBattleType);
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
  const [openRuleMenuId, setOpenRuleMenuId] = useState<string | null>(null);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<PendingDiscardAction | null>(null);
  const ruleEditorScrollRef = useRef<HTMLElement | null>(null);
  const usernameTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const titleTemplateInputRef = useRef<HTMLInputElement | null>(null);
  const bodyTemplateTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const ruleCardPointerRef = useRef<RuleCardPointerState | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (openRuleMenuId === null) {
      return;
    }

    function closeMenuOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".notification-rule-card__actions") !== null) {
        return;
      }

      setOpenRuleMenuId(null);
    }

    function closeMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenRuleMenuId(null);
      }
    }

    document.addEventListener("click", closeMenuOnOutsideClick);
    document.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      document.removeEventListener("click", closeMenuOnOutsideClick);
      document.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [openRuleMenuId]);

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
  const visibleRuleItems = useMemo<readonly RuleListItem[]>(() => {
    const savedItems = visibleRules.map((rule) => ({ type: "saved" as const, rule }));
    if (ruleEditorMode !== "creating" || ruleDraft.battleType !== activeBattleType) {
      return savedItems;
    }

    return [...savedItems, { type: "draft" as const, rule: createDraftRuleRecord(ruleDraft) }];
  }, [activeBattleType, ruleDraft, ruleEditorMode, visibleRules]);
  const canSaveDestination = role === "guildOwner";
  const previewMention = createMentionPreview(ruleDraft.message.mention);
  const previewUsername = applyNotificationTemplate(ruleDraft.message.usernameTemplate);
  const previewTitle = applyNotificationTemplate(ruleDraft.message.titleTemplate);
  const previewBody = applyNotificationTemplate(ruleDraft.message.bodyTemplate);
  const previewUsernameDisplay = previewUsername.trim().length === 0 ? "Webhook側の表示名" : previewUsername;
  const previewContentLines = previewMention.length > 0 ? [previewMention, previewTitle] : [previewTitle];
  const shouldShowPreviewBody = previewBody.trim().length > 0;
  const shouldShowNonAttackingTargetWarning = hasNonAttackingTargetWarning(ruleDraft.detailConditions);
  const detailRuleOffForbiddenVariables = collectDetailRuleOffForbiddenVariables(ruleDraft);
  const detailRuleOffVariableWarning =
    !ruleDraft.detailRuleEnabled && detailRuleOffForbiddenVariables.length > 0
      ? createDetailRuleOffVariableWarning(detailRuleOffForbiddenVariables)
      : null;
  const hasDetailConditionNodes = ruleDraft.detailConditions.children.length > 0;
  const isGrandBattleRuleDraft = ruleDraft.battleType === "grandBattle";
  const isRuleEditorVisible = ruleEditorMode !== "empty";
  const ruleEditorTitle = ruleEditorMode === "creating" ? "通知ルール新規作成" : "通知ルール編集";
  const isRuleDraftDirty =
    ruleEditorMode === "editing" && savedRuleDraft !== null && serializeRuleDraft(ruleDraft) !== serializeRuleDraft(savedRuleDraft);
  const shouldShowRuleActionBar = ruleEditorMode === "creating" || isRuleDraftDirty;
  const selectedRuleListId = ruleEditorMode === "creating" ? DRAFT_RULE_ID : selectedRuleId;
  const pendingDiscardTargetRule =
    pendingDiscardAction !== null && "ruleId" in pendingDiscardAction
      ? rules.find((rule) => rule.id === pendingDiscardAction.ruleId)
      : undefined;
  const discardConfirmationContent =
    pendingDiscardAction === null
      ? null
      : createDiscardConfirmationContent(pendingDiscardAction, ruleEditorMode, pendingDiscardTargetRule);
  const targetGuildOptions = useMemo(
    () => createTargetGuildOptions(targetGuildCandidates, ruleDraft.guildFilter),
    [ruleDraft.guildFilter, targetGuildCandidates]
  );

  useEffect(() => {
    if (pendingDiscardAction === null) {
      return;
    }

    function cancelDiscardOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingDiscardAction(null);
      }
    }

    document.addEventListener("keydown", cancelDiscardOnEscape);

    return () => {
      document.removeEventListener("keydown", cancelDiscardOnEscape);
    };
  }, [pendingDiscardAction]);

  useEffect(() => {
    if (activeBattleType !== "guildBattle" || targetGuildWorld === null) {
      setTargetGuildCandidates([]);
      setTargetGuildCandidateStatus("idle");
      return;
    }

    let isDisposed = false;
    setTargetGuildCandidateStatus("loading");

    void syncGuildBattleGuildCandidates({ ...request, world: targetGuildWorld })
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
    setOpenRuleMenuId(null);
    setPendingDiscardAction(null);
  }

  function requestSelectRule(rule: RuleRecord) {
    if (rule.id === selectedRuleListId) {
      return;
    }

    if (shouldConfirmDiscardCurrentDraft()) {
      setPendingDiscardAction({ type: "select", ruleId: rule.id });
      return;
    }

    selectRule(rule);
  }

  function startRuleCardPointerTracking(ruleId: string, event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      ruleCardPointerRef.current = null;
      return;
    }

    ruleCardPointerRef.current = {
      ruleId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }

  function updateRuleCardPointerTracking(ruleId: string, event: ReactPointerEvent<HTMLElement>) {
    const pointerState = ruleCardPointerRef.current;
    if (pointerState === null || pointerState.ruleId !== ruleId) {
      return;
    }

    const deltaX = Math.abs(event.clientX - pointerState.startX);
    const deltaY = Math.abs(event.clientY - pointerState.startY);
    if (deltaX > 6 || deltaY > 6) {
      pointerState.moved = true;
    }
  }

  function requestSelectRuleFromCard(rule: RuleRecord, event?: ReactKeyboardEvent<HTMLElement>) {
    if (event !== undefined) {
      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }

      event.preventDefault();
    }

    const pointerState = ruleCardPointerRef.current;
    ruleCardPointerRef.current = null;
    if (event === undefined && pointerState?.ruleId === rule.id && pointerState.moved) {
      return;
    }

    requestSelectRule(rule);
  }

  function selectRule(rule: RuleRecord) {
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
    setOpenRuleMenuId(null);
    setPendingDiscardAction(null);
  }

  function requestCreateNewRule() {
    if (shouldConfirmDiscardCurrentDraft()) {
      setPendingDiscardAction({ type: "create" });
      return;
    }

    createNewRule();
  }

  function createNewRule() {
    setSelectedRuleId(null);
    setRuleEditorMode("creating");
    setRuleDraft(createNewRuleDraft(activeBattleType));
    setSavedRuleDraft(null);
    setRuleError(null);
    setMessage(null);
    setPendingSuspensionRuleId(null);
    setDragSource(null);
    setDropTarget(null);
    setOpenRuleMenuId(null);
    setPendingDiscardAction(null);
  }

  function requestDuplicateRule(rule: RuleRecord) {
    setOpenRuleMenuId(null);
    if (shouldConfirmDiscardCurrentDraft()) {
      setPendingDiscardAction({ type: "duplicate", ruleId: rule.id });
      return;
    }

    duplicateRule(rule);
  }

  function duplicateRule(rule: RuleRecord) {
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
    setOpenRuleMenuId(null);
    setPendingDiscardAction(null);
  }

  function shouldConfirmDiscardCurrentDraft(): boolean {
    return ruleEditorMode === "creating" || isRuleDraftDirty;
  }

  async function releaseSelectedRuleTemporarySuspension(): Promise<boolean> {
    if (
      ruleEditorMode !== "editing" ||
      selectedRuleId === null ||
      savedRuleDraft === null ||
      !suspendedRuleIds.includes(selectedRuleId)
    ) {
      return true;
    }

    const releasingRuleId = selectedRuleId;
    setStatus("saving");
    setError(null);

    try {
      const savedRule = useRuleV2Storage
        ? createRuleRecordFromV2(
            await saveNotificationRuleV2({
              ...request,
              ruleId: releasingRuleId,
              rule: toRuleV2Input(savedRuleDraft)
            } satisfies SaveNotificationRuleV2Request)
          )
        : createRuleRecordFromLegacy(
            await saveNotificationRule({
              ...request,
              ruleId: releasingRuleId,
              rule: toLegacyRuleInput(savedRuleDraft)
            } satisfies SaveNotificationRuleRequest)
          );
      setRules((currentRules) => currentRules.map((rule) => (rule.id === savedRule.id ? savedRule : rule)));
      setSuspendedRuleIds((currentIds) => currentIds.filter((ruleId) => ruleId !== releasingRuleId));
      return true;
    } catch {
      setError("通知の一時停止解除に失敗しました。時間をおいて再度お試しください。");
      return false;
    } finally {
      setStatus("idle");
    }
  }

  async function confirmPendingDiscardAction() {
    if (pendingDiscardAction === null) {
      return;
    }

    const action = pendingDiscardAction;
    const canContinue = await releaseSelectedRuleTemporarySuspension();
    if (!canContinue) {
      return;
    }

    setPendingDiscardAction(null);

    if (action.type === "create") {
      createNewRule();
      return;
    }

    const sourceRule = rules.find((rule) => rule.id === action.ruleId);
    if (sourceRule !== undefined && action.type === "duplicate") {
      duplicateRule(sourceRule);
      return;
    }

    if (sourceRule !== undefined) {
      selectRule(sourceRule);
    }
  }

  function cancelPendingDiscardAction() {
    setPendingDiscardAction(null);
  }

  async function discardRuleChanges() {
    setRuleError(null);
    setMessage(null);

    if (ruleEditorMode === "creating") {
      setSelectedRuleId(null);
      setRuleEditorMode("empty");
      setRuleDraft(createDefaultRuleDraft(activeBattleType));
      setSavedRuleDraft(null);
      setOpenRuleMenuId(null);
      return;
    }

    if (savedRuleDraft !== null) {
      const canContinue = await releaseSelectedRuleTemporarySuspension();
      if (!canContinue) {
        return;
      }

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
    } catch {
      setError("通知ルールの保存に失敗しました。");
    } finally {
      setStatus("idle");
    }
  }

  async function toggleRuleEnabled(rule: RuleRecord, enabled: boolean) {
    if (status !== "idle") {
      return;
    }

    const nextDraft = { ...createRuleDraft(rule), enabled };
    setStatus("saving");
    setMessage(null);
    setError(null);
    try {
      const savedRule = useRuleV2Storage
        ? createRuleRecordFromV2(
            await saveNotificationRuleV2({
              ...request,
              ruleId: rule.id,
              rule: toRuleV2Input(nextDraft)
            } satisfies SaveNotificationRuleV2Request)
          )
        : createRuleRecordFromLegacy(
            await saveNotificationRule({
              ...request,
              ruleId: rule.id,
              rule: toLegacyRuleInput(nextDraft)
            } satisfies SaveNotificationRuleRequest)
          );
      setRules((currentRules) => currentRules.map((currentRule) => (currentRule.id === savedRule.id ? savedRule : currentRule)));
    } catch {
      setError("通知ルールの有効状態を更新できませんでした。");
    } finally {
      setStatus("idle");
    }
  }

  function changeRuleListEnabled(rule: RuleRecord, isDraftRule: boolean, enabled: boolean) {
    if (status !== "idle") {
      return;
    }

    if (isDraftRule || rule.id === selectedRuleId) {
      setRuleDraft((currentDraft) => ({ ...currentDraft, enabled }));
      return;
    }

    void toggleRuleEnabled(rule, enabled);
  }

  function deleteDraftRule() {
    setOpenRuleMenuId(null);
    setRuleError(null);
    setMessage("作成前の通知ルールを破棄しました。");
    setSelectedRuleId(null);
    setRuleEditorMode("empty");
    setRuleDraft(createDefaultRuleDraft(activeBattleType));
    setSavedRuleDraft(null);
  }

  async function deleteRule(rule: RuleRecord) {
    setOpenRuleMenuId(null);
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
      if (rule.id === selectedRuleId) {
        setSelectedRuleId(null);
        setRuleEditorMode("empty");
        setRuleDraft(createDefaultRuleDraft(activeBattleType));
        setSavedRuleDraft(null);
      }
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
    if (isTemplateVariableDisabled(ruleDraft, variableName)) {
      return;
    }

    const target = getFocusedTemplateTarget();
    if (target === null) {
      return;
    }

    const selectionStart = target.element.selectionStart ?? target.element.value.length;
    const selectionEnd = target.element.selectionEnd ?? selectionStart;

    if (insertVariableWithNativeUndo(target, variableName, selectionStart, selectionEnd)) {
      return;
    }

    insertVariableWithRangeText(target, variableName, selectionStart, selectionEnd);
  }

  function insertVariableWithNativeUndo(
    target: TemplateFieldTarget,
    variableName: string,
    selectionStart: number,
    selectionEnd: number
  ): boolean {
    if (typeof document.execCommand !== "function") {
      return false;
    }

    target.element.focus();
    target.element.setSelectionRange(selectionStart, selectionEnd);
    const didInsert = document.execCommand("insertText", false, variableName);
    if (!didInsert) {
      return false;
    }

    dispatchTemplateInputEvent(target.element, variableName);
    restoreTemplateFocusWithUndoBoundary(target.element);
    return true;
  }

  function insertVariableWithRangeText(
    target: TemplateFieldTarget,
    variableName: string,
    selectionStart: number,
    selectionEnd: number
  ) {
    const safeSelectionStart = Math.min(selectionStart, target.element.value.length);
    const safeSelectionEnd = Math.min(Math.max(selectionEnd, safeSelectionStart), target.element.value.length);
    target.element.focus();
    target.element.setRangeText(variableName, safeSelectionStart, safeSelectionEnd, "end");
    dispatchTemplateInputEvent(target.element, variableName);
    restoreTemplateFocusWithUndoBoundary(target.element);
  }

  function dispatchTemplateInputEvent(element: TemplateFieldElement, variableName: string) {
    const inputEvent =
      typeof InputEvent === "function"
        ? new InputEvent("input", {
            bubbles: true,
            data: variableName,
            inputType: "insertText"
          })
        : new Event("input", { bubbles: true });

    element.dispatchEvent(inputEvent);
  }

  function restoreTemplateFocusWithUndoBoundary(element: TemplateFieldElement) {
    const cursorPosition = element.selectionStart ?? element.value.length;
    element.blur();
    element.focus();
    element.setSelectionRange(cursorPosition, cursorPosition);
  }

  function getFocusedTemplateTarget(): TemplateFieldTarget | null {
    const activeElement = document.activeElement;
    if (activeElement === usernameTemplateInputRef.current && usernameTemplateInputRef.current !== null) {
      return { field: "usernameTemplate", element: usernameTemplateInputRef.current };
    }
    if (activeElement === titleTemplateInputRef.current && titleTemplateInputRef.current !== null) {
      return { field: "titleTemplate", element: titleTemplateInputRef.current };
    }
    if (activeElement === bodyTemplateTextareaRef.current && bodyTemplateTextareaRef.current !== null) {
      return { field: "bodyTemplate", element: bodyTemplateTextareaRef.current };
    }

    return null;
  }

  function scrollRuleEditorToBottom() {
    const scrollContainer = ruleEditorScrollRef.current;
    if (scrollContainer === null) {
      return;
    }

    const scroll = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(scroll);
      return;
    }

    window.setTimeout(scroll, 0);
  }

  function addRootConditionAndScroll() {
    setRuleDraft(addRootCondition);
    scrollRuleEditorToBottom();
  }

  function addRootConditionGroupAndScroll() {
    setRuleDraft(addRootConditionGroup);
    scrollRuleEditorToBottom();
  }

  function addGroupConditionAndScroll(groupIndex: number) {
    setRuleDraft((currentDraft) => addGroupCondition(currentDraft, groupIndex));
    scrollRuleEditorToBottom();
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
    setDropTarget((currentTarget) => (isSameDropTarget(currentTarget, target) ? currentTarget : target));
  }

  function updateConditionEndDropTarget(event: DragEvent<HTMLElement>, target: NotificationDetailConditionDropTarget) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY < rect.bottom - CONDITION_DROP_HYSTERESIS_PX) {
      return;
    }

    updateConditionDropTarget(event, target);
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
    <div className="settings-dialog-backdrop notification-settings-dialog-backdrop" role="presentation">
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
            <details className="notification-settings-dialog__destination">
              <summary className="notification-settings-dialog__destination-summary">
                <span>Discord Webhook設定</span>
                <span className={destinationDraft.enabled ? "notification-settings-dialog__destination-status is-enabled" : "notification-settings-dialog__destination-status"}>
                  {destinationDraft.enabled ? "有効" : "無効"}
                </span>
              </summary>
              <div className="notification-settings-dialog__destination-body">
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
              <div className="notification-settings-dialog__destination-actions">
                <button className="load-form__button" disabled={status !== "idle"} type="button" onClick={() => void saveDestination()}>
                  保存
                </button>
              </div>
              {destinationError !== null ? <p className="firebase-message firebase-message--error">{destinationError}</p> : null}
              </div>
            </details>
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
            <section className="notification-settings-dialog__panel notification-rule-list-panel">
              <div className="notification-settings-dialog__section-header">
                <h3>通知ルール一覧</h3>
                <button className="load-form__button" type="button" onClick={requestCreateNewRule}>
                  新規ルール追加
                </button>
              </div>
              {status === "loading" ? <p className="firebase-message">通知設定を読込中です。</p> : null}
              {visibleRuleItems.length === 0 && status !== "loading" ? (
                <p className="notification-settings-dialog__empty">通知ルールはまだありません。</p>
              ) : null}
              <div className="notification-rule-list">
                {visibleRuleItems.map((item) => {
                  const rule = item.rule;
                  const isDraftRule = item.type === "draft";
                  const isSelectedRule = rule.id === selectedRuleListId;
                  const ruleMenuId = isDraftRule ? DRAFT_RULE_ID : rule.id;
                  const draftStatus = isDraftRule ? "作成前" : null;
                  const pauseStatus = !isDraftRule && rule.id === selectedRuleId && isRuleDraftDirty ? "保存まで一時停止" : null;
                  const displayedEnabled = isSelectedRule ? ruleDraft.enabled : rule.enabled;

                  return (
                    <article
                      aria-current={isSelectedRule ? "true" : undefined}
                      aria-label={rule.name}
                      className={isSelectedRule ? "notification-rule-card is-selected" : "notification-rule-card"}
                      key={ruleMenuId}
                      role={isDraftRule ? undefined : "button"}
                      tabIndex={isDraftRule ? undefined : 0}
                      onClick={() => {
                        if (!isDraftRule) {
                          requestSelectRuleFromCard(rule);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (!isDraftRule) {
                          requestSelectRuleFromCard(rule, event);
                        }
                      }}
                      onPointerCancel={() => {
                        ruleCardPointerRef.current = null;
                      }}
                      onPointerDown={(event) => {
                        if (!isDraftRule) {
                          startRuleCardPointerTracking(rule.id, event);
                        }
                      }}
                      onPointerMove={(event) => {
                        if (!isDraftRule) {
                          updateRuleCardPointerTracking(rule.id, event);
                        }
                      }}
                    >
                      <label
                        className="notification-rule-card__enabled-toggle"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          aria-label={`${rule.name}の有効状態`}
                          checked={displayedEnabled}
                          disabled={status !== "idle"}
                          type="checkbox"
                          onChange={(event) => {
                            changeRuleListEnabled(rule, isDraftRule, event.currentTarget.checked);
                          }}
                        />
                        <span className="notification-rule-card__toggle-track" aria-hidden="true">
                          <span className="notification-rule-card__toggle-thumb" />
                        </span>
                      </label>
                      <div
                        className="notification-rule-card__main"
                      >
                        <span className="notification-rule-card__heading">
                          <span className="notification-rule-card__title">{rule.name}</span>
                          <span className="notification-rule-card__time">{createRuleScheduleSummary(rule)}</span>
                        </span>
                        <span className={displayedEnabled ? "notification-rule-card__status is-enabled" : "notification-rule-card__status"}>
                          {displayedEnabled ? "有効" : "無効"}
                        </span>
                        <span className="notification-rule-card__summary">{createRuleConditionSummary(rule)}</span>
                        {draftStatus !== null ? <span className="notification-rule-card__draft-status">{draftStatus}</span> : null}
                        {pauseStatus !== null ? <span className="notification-rule-card__pause-status">{pauseStatus}</span> : null}
                      </div>
                      <div className="notification-rule-card__actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          aria-expanded={openRuleMenuId === ruleMenuId}
                          aria-label={`${rule.name}の操作`}
                          className="notification-rule-card__actions-trigger"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenRuleMenuId((currentId) => (currentId === ruleMenuId ? null : ruleMenuId));
                          }}
                        >
                          ...
                        </button>
                        {openRuleMenuId === ruleMenuId ? (
                          <div className="notification-rule-card__actions-menu">
                            {isDraftRule ? null : (
                              <button type="button" onClick={() => requestDuplicateRule(rule)}>
                                複製
                              </button>
                            )}
                            <button type="button" onClick={() => (isDraftRule ? deleteDraftRule() : void deleteRule(rule))}>
                              削除
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section
              className={
                !isRuleEditorVisible
                  ? "notification-settings-dialog__panel notification-rule-workspace is-empty"
                  : shouldShowRuleActionBar
                    ? "notification-settings-dialog__panel notification-rule-workspace has-action-bar"
                    : "notification-settings-dialog__panel notification-rule-workspace"
              }
            >
              {isRuleEditorVisible ? (
                <div className="notification-rule-workspace__topbar">
                  <h3>{ruleEditorTitle}</h3>
                </div>
              ) : null}
              <div
                className={
                  isRuleEditorVisible
                    ? "notification-rule-workspace__columns"
                    : "notification-rule-workspace__columns is-empty"
                }
              >
            <section className="notification-rule-workspace__pane notification-rule-editor" ref={ruleEditorScrollRef}>
              {!isRuleEditorVisible ? (
                <div className="notification-rule-editor__empty-state">
                  <h3>{"\u901a\u77e5\u30eb\u30fc\u30eb\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044"}</h3>
                  <p className="notification-settings-dialog__empty">
                    {"\u65e2\u5b58\u30eb\u30fc\u30eb\u3092\u7de8\u96c6\u3059\u308b\u304b\u3001\u65b0\u898f\u4f5c\u6210\u304b\u3089\u901a\u77e5\u6761\u4ef6\u3092\u8a2d\u5b9a\u3067\u304d\u307e\u3059\u3002"}
                  </p>
                  <button className="load-form__button" type="button" onClick={requestCreateNewRule}>
                    {"\u65b0\u898f\u4f5c\u6210"}
                  </button>
                </div>
              ) : (
                <>
              <h4 className="notification-settings-dialog__numbered-heading">
                <span>1</span>
                基本ルール
              </h4>
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
              <h4 className="notification-settings-dialog__numbered-heading">
                <span>2</span>
                {"詳細ルール"}
              </h4>
              <label className="notification-rule-card__enabled-toggle notification-rule-editor__detail-toggle">
                <input
                  checked={ruleDraft.detailRuleEnabled}
                  type="checkbox"
                  onChange={(event) => {
                    const detailRuleEnabled = event.target.checked;
                    setRuleDraft((currentDraft) => {
                      const nextDraft = { ...currentDraft, detailRuleEnabled };
                      setRuleError(validateRuleDraft(nextDraft));
                      return nextDraft;
                    });
                  }}
                />
                <span className="notification-rule-card__toggle-track" aria-hidden="true">
                  <span className="notification-rule-card__toggle-thumb" />
                </span>
                <span>{ruleDraft.detailRuleEnabled ? "ON" : "OFF"}</span>
              </label>
              {!ruleDraft.detailRuleEnabled ? (
                <p className="notification-settings-dialog__note">
                  {"詳細ルールOFF時は時刻だけで通知します。対象拠点・対象ギルド・詳細条件の保存値は保持されます。"}
                </p>
              ) : null}
              <fieldset className="notification-rule-editor__battle-side" aria-label="対象拠点" disabled={!ruleDraft.detailRuleEnabled}>
                <legend className="field__label">対象拠点</legend>
                <label className="notification-rule-editor__target-guild-radio">
                  <input
                    checked={ruleDraft.battleSide === "defense"}
                    type="radio"
                    name="notification-battle-side"
                    onChange={() =>
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        battleSide: "defense"
                      }))
                    }
                  />
                  防衛拠点
                </label>
                <label className="notification-rule-editor__target-guild-radio">
                  <input
                    checked={ruleDraft.battleSide === "attack"}
                    type="radio"
                    name="notification-battle-side"
                    onChange={() =>
                      setRuleDraft((currentDraft) => ({
                        ...currentDraft,
                        battleSide: "attack"
                      }))
                    }
                  />
                  侵攻拠点
                </label>
              </fieldset>
              <h5 className="field__label">{"対象ギルド"}</h5>
              {isGrandBattleRuleDraft ? (
                <>
                  <p className="notification-settings-dialog__note">{"\u30b0\u30e9\u30f3\u30c9\u30d0\u30c8\u30eb\u3067\u306f\u5168\u30ae\u30eb\u30c9\u56fa\u5b9a\u3067\u3059\u3002"}</p>
                  <fieldset className="notification-rule-editor__target-guilds is-readonly" aria-label="対象ギルド">
                    <div
                      className="notification-rule-editor__target-guild-radio"
                      aria-disabled="true"
                      role="radio"
                      aria-checked="true"
                    >
                      <span className="notification-rule-editor__readonly-radio is-checked" aria-hidden="true" />
                      {"\u5168\u30ae\u30eb\u30c9"}
                    </div>
                    <div
                      className="notification-rule-editor__target-guild-radio"
                      aria-disabled="true"
                      role="radio"
                      aria-checked="false"
                    >
                      <span className="notification-rule-editor__readonly-radio" aria-hidden="true" />
                      {"\u6307\u5b9a\u30ae\u30eb\u30c9"}
                    </div>
                  </fieldset>
                </>
              ) : (
                <>
                  <fieldset className="notification-rule-editor__target-guilds" aria-label="対象ギルド" disabled={!ruleDraft.detailRuleEnabled}>
                    <label className="notification-rule-editor__target-guild-radio">
                      <input
                        checked={ruleDraft.guildFilterSelectionMode === "all"}
                        type="radio"
                        name="notification-target-guild-mode"
                        onChange={() =>
                          setRuleDraft((currentDraft) => ({
                            ...currentDraft,
                            guildFilterSelectionMode: "all",
                            guildFilter: []
                          }))
                        }
                      />
                      {"\u5168\u30ae\u30eb\u30c9"}
                    </label>
                    <label className="notification-rule-editor__target-guild-radio">
                      <input
                        checked={ruleDraft.guildFilterSelectionMode === "specific"}
                        disabled={targetGuildWorld === null && ruleDraft.guildFilter.length === 0}
                        type="radio"
                        name="notification-target-guild-mode"
                        onChange={() =>
                          setRuleDraft((currentDraft) => ({
                            ...currentDraft,
                            guildFilterSelectionMode: "specific"
                          }))
                        }
                      />
                      {"\u6307\u5b9a\u30ae\u30eb\u30c9"}
                    </label>
                    {ruleDraft.guildFilterSelectionMode === "specific" ? (
                      <div className="notification-rule-editor__target-guild-list">
                        {targetGuildOptions.length === 0 ? (
                          <p className="notification-settings-dialog__note">{"\u8868\u793a\u3067\u304d\u308b\u5bfe\u8c61\u30ae\u30eb\u30c9\u5019\u88dc\u304c\u3042\u308a\u307e\u305b\u3093\u3002"}</p>
                        ) : (
                          targetGuildOptions.map((candidate) => (
                            <label key={candidate.guildId} className="notification-rule-editor__target-guild-checkbox">
                              <input
                                checked={ruleDraft.guildFilter.includes(candidate.guildId)}
                                type="checkbox"
                                onChange={(event) => {
                                  const isChecked = event.target.checked;
                                  setRuleDraft((currentDraft) => ({
                                    ...currentDraft,
                                    guildFilter: isChecked
                                      ? addGuildFilterId(currentDraft.guildFilter, candidate.guildId)
                                      : currentDraft.guildFilter.filter((guildId) => guildId !== candidate.guildId)
                                  }));
                                }}
                              />
                              {candidate.guildName}
                            </label>
                          ))
                        )}
                      </div>
                    ) : null}
                  </fieldset>
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
                </>
              )}
              <h5 className="field__label">{"詳細条件"}</h5>
              {hasDetailConditionNodes ? (
                <p className="notification-settings-dialog__note">{"\u3044\u305a\u308c\u304b\u306e\u6761\u4ef6\u30d6\u30ed\u30c3\u30af\u306b\u4e00\u81f4"}</p>
              ) : null}
              <div
                className="notification-rule-editor__condition-tree"
                onDragOver={(event) =>
                  updateConditionEndDropTarget(event, {
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
                        onDragEnd={endConditionDrag}
                        onDragOver={(event) =>
                          updateConditionDropTarget(event, {
                            scope: "root",
                            index: getDropIndex(event, nodeIndex, dropTarget, { scope: "root" })
                          })
                        }
                        onDrop={dropConditionNode}
                      >
                        <div className="notification-rule-editor__condition-group-header">
                        <button
                          className="notification-rule-editor__drag-handle"
                          draggable
                          type="button"
                          aria-label={DRAG_HANDLE_ARIA_LABEL}
                          onDragEnd={endConditionDrag}
                          onDragStart={(event) => startConditionDrag(event, { scope: "root", index: nodeIndex })}
                        >
                          {DRAG_HANDLE_LABEL}
                        </button>
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
                        {canConditionNodeMatchWithoutAttack(conditionNode) ? <WarningIcon /> : null}
                        <div className="notification-rule-editor__condition-group-actions">
                          <button type="button" onClick={() => addGroupConditionAndScroll(nodeIndex)}>
                            {"\uff0b \u6761\u4ef6\u8ffd\u52a0"}
                          </button>
                          <button type="button" onClick={() => setRuleDraft((currentDraft) => removeRootConditionNode(currentDraft, nodeIndex))}>
                            {"\u524a\u9664"}
                          </button>
                        </div>
                      </div>
                      <div
                        className="notification-rule-editor__condition-list"
                        onDragOver={(event) =>
                          updateConditionEndDropTarget(event, {
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
                              showWarning={conditionNode.operator === "OR" && canMatchWithoutAttack(condition)}
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
                                  index: getDropIndex(event, conditionIndex, dropTarget, { scope: "group", groupIndex: nodeIndex })
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
                      onDragEnd={endConditionDrag}
                      onDragOver={(event) =>
                        updateConditionDropTarget(event, {
                          scope: "root",
                          index: getDropIndex(event, nodeIndex, dropTarget, { scope: "root" })
                        })
                      }
                      onDrop={dropConditionNode}
                    >
                      <ConditionRow
                        condition={conditionNode}
                        draggable
                        showWarning={canMatchWithoutAttack(conditionNode)}
                        onChange={(nextCondition) =>
                          setRuleDraft((currentDraft) => updateRootCondition(currentDraft, nodeIndex, nextCondition))
                        }
                        onDragEnd={endConditionDrag}
                        onDragStart={(event) => startConditionDrag(event, { scope: "root", index: nodeIndex })}
                        onRemove={() => setRuleDraft((currentDraft) => removeRootConditionNode(currentDraft, nodeIndex))}
                      />
                    </div>
                    </div>
                  )
                )}
                <DropIndicator isActive={isRootDropTarget(dropTarget, ruleDraft.detailConditions.children.length)} />
              </div>
              <div className="notification-rule-editor__condition-actions">
                <button type="button" onClick={addRootConditionGroupAndScroll}>
                  {"\uff0b \u30b0\u30eb\u30fc\u30d7\u3092\u8ffd\u52a0"}
                </button>
                <button type="button" onClick={addRootConditionAndScroll}>
                  {"\uff0b \u6761\u4ef6\u3092\u8ffd\u52a0"}
                </button>
              </div>
              {!hasDetailConditionNodes ? (
                <div className="notification-rule-editor__condition-warning">
                  {"\u958b\u59cb\u6642\u523b\u306b\u306a\u3063\u305f\u3089\u901a\u77e5\u3055\u308c\u307e\u3059\u3002"}
                </div>
              ) : shouldShowNonAttackingTargetWarning ? (
                <div className="notification-rule-editor__condition-warning">
                  {"\u653b\u6483\u4e2d\u3067\u306a\u3044\u62e0\u70b9\u3082\u901a\u77e5\u5bfe\u8c61\u306b\u306a\u308b\u6761\u4ef6\u304c\u3042\u308a\u307e\u3059\u3002"}
                  <br />
                  {"\u9632\u885b\u914d\u7f6e\u5fd8\u308c\u691c\u77e5\u306a\u3069\u3092\u76ee\u7684\u3068\u3059\u308b\u5834\u5408\u306f\u3001\u3053\u306e\u307e\u307e\u3067\u554f\u984c\u3042\u308a\u307e\u305b\u3093\u3002"}
                </div>
              ) : null}
              {ruleError !== null ? <p className="firebase-message firebase-message--error">{ruleError}</p> : null}
                </>
              )}
            </section>

            {isRuleEditorVisible ? (
            <section className="notification-rule-workspace__pane notification-rule-preview-panel">
                <>
                  <h3 className="notification-settings-dialog__numbered-heading">
                    <span>3</span>
                    {"通知内容"}
                  </h3>
                  <div className="field">
                    <span className="field__label-row">
                      <label className="field__label" htmlFor="notification-rule-username-template">
                        {"Discord\u8868\u793a\u540d"}
                      </label>
                      <button
                        className="field__info-button"
                        type="button"
                        aria-label="Discord表示名の補足説明"
                        aria-describedby="notification-rule-username-tooltip"
                      >
                        <span aria-hidden="true">i</span>
                      </button>
                      <span className="field__tooltip" id="notification-rule-username-tooltip" role="tooltip">
                        {"\u7a7a\u6b04\u306e\u5834\u5408\u306fDiscord\u5074\u3067\u8a2d\u5b9a\u3055\u308c\u305f\u8868\u793a\u540d\u3092\u4f7f\u7528\u3057\u307e\u3059\u3002"}
                      </span>
                    </span>
                    <input
                      id="notification-rule-username-template"
                      className="field__input field__input--wide"
                      ref={usernameTemplateInputRef}
                      placeholder="任意"
                      value={ruleDraft.message.usernameTemplate}
                      onChange={(event) => {
                        const usernameTemplate = event.target.value;
                        setRuleDraft((currentDraft) => ({
                          ...currentDraft,
                          message: { ...currentDraft.message, usernameTemplate }
                        }));
                      }}
                      onBlur={() => setRuleError(validateRuleDraft(ruleDraft))}
                    />
                  </div>
                  <label className="field">
                    <span className="field__label">{"\u30e1\u30f3\u30b7\u30e7\u30f3\u5148"}</span>
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
                      <option value="none">{"\u306a\u3057"}</option>
                      <option value="here">@here</option>
                      <option value="everyone">@everyone</option>
                      <option value="custom">{"\u30ab\u30b9\u30bf\u30e0"}</option>
                    </select>
                  </label>
                  {ruleDraft.message.mention.type === "custom" ? (
                    <label className="field">
                      <span className="field__label">{"\u30ab\u30b9\u30bf\u30e0\u30e1\u30f3\u30b7\u30e7\u30f3"}</span>
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
                  <div className="field">
                    <span className="field__label-row">
                      <label className="field__label" htmlFor="notification-rule-title-template">
                        {"\u901a\u77e5\u30b5\u30de\u30ea\u30fc"}
                      </label>
                      <button
                        className="field__info-button"
                        type="button"
                        aria-label="通知サマリーの補足説明"
                        aria-describedby="notification-rule-summary-tooltip"
                      >
                        <span aria-hidden="true">i</span>
                      </button>
                      <span className="field__tooltip" id="notification-rule-summary-tooltip" role="tooltip">
                        {"\u30b9\u30de\u30db\u901a\u77e5\u306b\u3082\u8868\u793a\u3055\u308c\u308b\u77ed\u3044\u8981\u7d04\u3067\u3059\u3002"}
                      </span>
                    </span>
                    <input
                      id="notification-rule-title-template"
                      className="field__input field__input--wide"
                      ref={titleTemplateInputRef}
                      value={ruleDraft.message.titleTemplate}
                      onChange={(event) => {
                        const titleTemplate = event.target.value;
                        setRuleDraft((currentDraft) => ({
                          ...currentDraft,
                          message: { ...currentDraft.message, titleTemplate }
                        }));
                      }}
                      onBlur={() => setRuleError(validateRuleDraft(ruleDraft))}
                    />
                  </div>
                  <label className="field">
                    <span className="field__label">{"\u901a\u77e5\u672c\u6587"}</span>
                    <textarea
                      className="field__input field__input--wide notification-rule-editor__textarea"
                      ref={bodyTemplateTextareaRef}
                      value={ruleDraft.message.bodyTemplate}
                      onChange={(event) => {
                        const bodyTemplate = event.target.value;
                        setRuleDraft((currentDraft) => ({
                          ...currentDraft,
                          message: { ...currentDraft.message, bodyTemplate }
                        }));
                      }}
                      onBlur={() => setRuleError(validateRuleDraft(ruleDraft))}
                    />
                  </label>
                  <div className="notification-rule-editor__variables-block">
                    <h4>{"\u5229\u7528\u3067\u304d\u308b\u5909\u6570"}</h4>
                    <div className="notification-rule-editor__variables" aria-label="利用できる変数">
                      {NOTIFICATION_TEMPLATE_VARIABLES.map((variableName) => {
                        const isDisabled = isTemplateVariableDisabled(ruleDraft, variableName);
                        return (
                          <button
                            key={variableName}
                            type="button"
                            disabled={isDisabled}
                            title={isDisabled ? DETAIL_RULE_OFF_VARIABLE_DISABLED_REASON : undefined}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertVariable(variableName)}
                          >
                            {createTemplateVariableLabel(variableName)}
                          </button>
                        );
                      })}
                    </div>
                    {!ruleDraft.detailRuleEnabled ? (
                      <p className="notification-settings-dialog__note">{DETAIL_RULE_OFF_VARIABLE_DISABLED_REASON}</p>
                    ) : null}
                  </div>
                  <div className="notification-rule-preview-panel__divider" />
                </>
              <h4 className="field__label">通知プレビュー</h4>
                <div className="notification-preview">
                  <div className="notification-preview__avatar" aria-hidden="true">
                    <svg className="notification-preview__avatar-icon" viewBox="0 0 24 24" focusable="false">
                      <path d="M20.32 4.37A19.8 19.8 0 0 0 15.43 2.86a.08.08 0 0 0-.08.04c-.21.37-.44.86-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04A19.7 19.7 0 0 0 3.68 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.1.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.23.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.98 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
                    </svg>
                  </div>
                  <div className="notification-preview__body">
                    <div className="notification-preview__username">{previewUsernameDisplay}</div>
                    {previewUsername.trim().length === 0 ? (
                      <div className="notification-preview__note">Discord側で設定された表示名を使用します</div>
                    ) : null}
                    <div className="notification-preview__content">
                      {previewContentLines.map((line, lineIndex) =>
                        previewMention.length > 0 && lineIndex === 0 ? (
                          <div key={`${lineIndex}-${line}`} className="notification-preview__mention">
                            {line}
                          </div>
                        ) : (
                          <p key={`${lineIndex}-${line}`}>{line}</p>
                        )
                      )}
                    </div>
                    {shouldShowPreviewBody ? (
                      <div className="notification-preview__embed">
                        <p>{previewBody}</p>
                      </div>
                    ) : null}
                    {detailRuleOffVariableWarning !== null ? (
                      <div className="notification-rule-editor__condition-warning">
                        <p>{detailRuleOffVariableWarning.title}</p>
                        <ul>
                          {detailRuleOffVariableWarning.variables.map((variableName) => (
                            <li key={variableName}>{variableName}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              {message !== null ? <p className="firebase-message firebase-message--success">{message}</p> : null}
              {error !== null ? <p className="firebase-message firebase-message--error">{error}</p> : null}
            </section>
              ) : (
                <>
                  {message !== null ? <p className="firebase-message firebase-message--success">{message}</p> : null}
                  {error !== null ? <p className="firebase-message firebase-message--error">{error}</p> : null}
                </>
              )}
              </div>
              {shouldShowRuleActionBar ? (
                <div className="notification-rule-workspace__action-bar">
                  <p>
                    {ruleEditorMode === "creating"
                      ? "\u4f5c\u6210\u524d\u306e\u901a\u77e5\u30eb\u30fc\u30eb\u3067\u3059\u3002"
                      : "\u4fdd\u5b58\u3055\u308c\u3066\u3044\u306a\u3044\u5909\u66f4\u304c\u3042\u308a\u307e\u3059\u3002\u4fdd\u5b58\u307e\u3067\u901a\u77e5\u306f\u4e00\u6642\u505c\u6b62\u3055\u308c\u3066\u3044\u307e\u3059\u3002"}
                  </p>
                  <div className="notification-rule-editor__action-buttons">
                    <button className="load-form__button load-form__button--secondary" type="button" onClick={() => void discardRuleChanges()}>
                      {ruleEditorMode === "creating" ? "\u7834\u68c4" : "\u7834\u68c4\u3057\u3066\u623b\u3059"}
                    </button>
                    <button
                      className="load-form__button notification-rule-footer-save-button"
                      disabled={status !== "idle" || detailRuleOffVariableWarning !== null}
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
        {discardConfirmationContent !== null ? (
          <div
            className="notification-settings-dialog__confirm-backdrop"
            role="presentation"
            onMouseDown={cancelPendingDiscardAction}
          >
            <div
              aria-labelledby="notification-settings-dialog-discard-title"
              className="notification-settings-dialog__confirm"
              role="alertdialog"
              aria-modal="true"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div>
                <strong id="notification-settings-dialog-discard-title">{discardConfirmationContent.title}</strong>
                <p>{discardConfirmationContent.message}</p>
              </div>
              <div className="notification-settings-dialog__confirm-actions">
                <button
                  type="button"
                  disabled={status !== "idle"}
                  onClick={() => void confirmPendingDiscardAction()}
                >
                  {discardConfirmationContent.confirmLabel}
                </button>
                <button className="load-form__button" type="button" onClick={cancelPendingDiscardAction}>
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function createDefaultRuleDraft(battleType: NotificationBattleType): RuleDraft {
  return {
    ...createDefaultNotificationRuleV2Draft(battleType, 0),
    guildFilterSelectionMode: "all"
  };
}

function createNewRuleDraft(battleType: NotificationBattleType): RuleDraft {
  return {
    ...createDefaultRuleDraft(battleType),
    name: NEW_RULE_DRAFT_NAME
  };
}

function createRuleRecordFromLegacy(rule: NotificationRule): RuleRecord {
  return {
    id: rule.id,
    ...createNotificationRuleV2DraftFromLegacy(rule, 0),
    guildFilterSelectionMode: "all"
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
    guildFilter: [...rule.guildFilter],
    guildFilterSelectionMode: rule.guildFilter.length > 0 ? "specific" : "all",
    detailConditions: normalizeDetailConditionRoot(rule.detailConditions)
  };
}

function createDraftRuleRecord(ruleDraft: RuleDraft): RuleRecord {
  const draft = createRuleDraft({
    ...ruleDraft,
    id: DRAFT_RULE_ID
  });

  return {
    ...draft,
    id: DRAFT_RULE_ID
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
    guildFilter: [...rule.guildFilter],
    guildFilterSelectionMode: rule.guildFilterSelectionMode,
    detailConditions: normalizeDetailConditionRoot(rule.detailConditions)
  };
}

function toLegacyRuleInput(ruleDraft: RuleDraft) {
  const { guildFilterSelectionMode: _guildFilterSelectionMode, ...draft } = ruleDraft;
  return createLegacyNotificationRuleInputFromV2Draft(draft);
}

function toRuleV2Input(ruleDraft: RuleDraft): NotificationRuleV2Input {
  const { id: _id, guildFilterSelectionMode: _guildFilterSelectionMode, ...input } = ruleDraft;
  return {
    ...input,
    guildFilter: input.battleType === "grandBattle" ? [] : input.guildFilter,
    detailConditions: normalizeDetailConditionRoot(input.detailConditions)
  };
}

function normalizeDetailConditionRoot(detailConditions: RuleDraft["detailConditions"]): RuleDraft["detailConditions"] {
  const children: RuleDraft["detailConditions"]["children"][number][] = [];

  for (const node of detailConditions.children) {
    if (node.type === "condition") {
      children.push({ ...node });
      continue;
    }

    if (node.children.length > 0) {
      children.push({
        ...node,
        children: node.children.map((condition) => ({ ...condition }))
      });
    }
  }

  return {
    operator: "OR",
    children
  };
}

function serializeRuleDraft(ruleDraft: RuleDraft): string {
  return JSON.stringify(ruleDraft);
}

function addGuildFilterId(guildFilter: readonly string[], guildId: string): readonly string[] {
  return guildFilter.includes(guildId) ? guildFilter : [...guildFilter, guildId];
}

function createTargetGuildOptions(
  candidates: readonly GuildBattleGuildCandidate[],
  selectedGuildIds: readonly string[]
): readonly GuildBattleGuildCandidate[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.guildId));
  const missingSelectedCandidates = selectedGuildIds
    .filter((guildId) => !candidateIds.has(guildId))
    .map((guildId) => ({
      guildId,
      guildName: `${guildId}\uff08\u73fe\u5728Stock\u4e0a\u4f4d16\u4f4d\u5916\uff09`,
      rank: 0
    }));

  return [...candidates, ...missingSelectedCandidates];
}

function ConditionRow({
  condition,
  draggable = false,
  showWarning = false,
  onChange,
  onDragEnd,
  onDragOver,
  onDragStart,
  onRemove
}: {
  readonly condition: NotificationDetailCondition;
  readonly draggable?: boolean;
  readonly showWarning?: boolean;
  readonly onChange: (condition: NotificationDetailCondition) => void;
  readonly onDragEnd?: () => void;
  readonly onDragOver?: (event: DragEvent<HTMLElement>) => void;
  readonly onDragStart?: (event: DragEvent<HTMLElement>) => void;
  readonly onRemove: () => void;
}) {
  const [valueText, setValueText] = useState(() => String(condition.value));
  const [isValueFocused, setIsValueFocused] = useState(false);

  useEffect(() => {
    if (!isValueFocused) {
      setValueText(String(condition.value));
    }
  }, [condition.value, isValueFocused]);

  return (
    <div
      className={draggable ? "notification-rule-editor__condition-row is-draggable" : "notification-rule-editor__condition-row"}
      onDragOver={onDragOver}
    >
      <button
        className="notification-rule-editor__drag-handle"
        draggable={draggable}
        type="button"
        aria-label={DRAG_HANDLE_ARIA_LABEL}
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
      >
        {DRAG_HANDLE_LABEL}
      </button>
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
        pattern="[0-9]*"
        type="text"
        value={valueText}
        onBlur={() => {
          setIsValueFocused(false);
          if (valueText.length === 0) {
            setValueText("0");
            onChange({
              ...condition,
              value: 0
            });
            return;
          }

          const normalizedValue = normalizeDetailConditionValue(valueText);
          setValueText(String(normalizedValue));
          onChange({
            ...condition,
            value: normalizedValue
          });
        }}
        onChange={(event) => {
          const nextValueText = event.target.value.replace(/\D/g, "");
          setValueText(nextValueText);
          if (nextValueText.length === 0) {
            return;
          }

          onChange({
            ...condition,
            value: normalizeDetailConditionValue(nextValueText)
          });
        }}
        onFocus={() => setIsValueFocused(true)}
      />
      {showWarning ? <WarningIcon /> : <span className="notification-rule-editor__condition-warning-placeholder" />}
      <button type="button" onClick={onRemove}>
        {"\u524a\u9664"}
      </button>
    </div>
  );
}

function WarningIcon() {
  return (
    <span className="notification-rule-editor__condition-warning-icon" title={NON_ATTACKING_WARNING_TITLE} aria-label={NON_ATTACKING_WARNING_TITLE}>
      ⚠️
    </span>
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
  return {
    ...ruleDraft,
    detailConditions: {
      ...ruleDraft.detailConditions,
      children: ruleDraft.detailConditions.children.flatMap((currentNode, currentIndex) => {
        if (currentIndex !== groupIndex || currentNode.type !== "group") {
          return [currentNode];
        }

        const nextChildren = currentNode.children.filter((_, currentConditionIndex) => currentConditionIndex !== conditionIndex);
        return nextChildren.length === 0 ? [] : [{ ...currentNode, children: nextChildren }];
      })
    }
  };
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
      children: nextChildren
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

function createTemplateVariableLabel(variableName: string): string {
  return variableName.startsWith("{") && variableName.endsWith("}") ? variableName.slice(1, -1) : variableName;
}

function createDiscardConfirmationContent(
  action: PendingDiscardAction,
  editorMode: RuleEditorMode,
  targetRule: RuleRecord | undefined
): DiscardConfirmationContent {
  const isCreating = editorMode === "creating";
  const title = isCreating ? "作成中の通知ルールがあります。" : "保存されていない変更があります。";
  const discardSubject = isCreating ? "作成内容" : "変更";

  if (action.type === "create") {
    return {
      title,
      message: `${discardSubject}を破棄して新規作成しますか？`,
      confirmLabel: "破棄して新規作成"
    };
  }

  if (action.type === "duplicate") {
    return {
      title,
      message: `${discardSubject}を破棄して複製しますか？`,
      confirmLabel: "破棄して複製"
    };
  }

  return {
    title,
    message:
      targetRule === undefined
        ? `${discardSubject}を破棄して選択したルールを編集しますか？`
        : `${discardSubject}を破棄して「${targetRule.name}」を編集しますか？`,
    confirmLabel: "破棄して編集"
  };
}

function getDropIndex(
  event: DragEvent<HTMLElement>,
  itemIndex: number,
  currentTarget: NotificationDetailConditionDropTarget | null,
  scope: DropIndexScope
): number {
  const rect = event.currentTarget.getBoundingClientRect();
  const middleY = rect.top + rect.height / 2;
  const distanceFromMiddle = Math.abs(event.clientY - middleY);
  if (
    distanceFromMiddle <= CONDITION_DROP_HYSTERESIS_PX &&
    isDropTargetInScope(currentTarget, scope) &&
    (currentTarget.index === itemIndex || currentTarget.index === itemIndex + 1)
  ) {
    return currentTarget.index;
  }

  return event.clientY > middleY ? itemIndex + 1 : itemIndex;
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

function isDropTargetInScope(
  target: NotificationDetailConditionDropTarget | null,
  scope: DropIndexScope
): target is NotificationDetailConditionDropTarget {
  if (target === null || target.scope !== scope.scope) {
    return false;
  }

  if (scope.scope === "root") {
    return true;
  }

  return target.scope === "group" && target.groupIndex === scope.groupIndex;
}

function isSameDropTarget(
  currentTarget: NotificationDetailConditionDropTarget | null,
  nextTarget: NotificationDetailConditionDropTarget
): boolean {
  if (currentTarget === null || currentTarget.scope !== nextTarget.scope || currentTarget.index !== nextTarget.index) {
    return false;
  }

  return nextTarget.scope === "root" || (currentTarget.scope === "group" && currentTarget.groupIndex === nextTarget.groupIndex);
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

function isTemplateVariableDisabled(ruleDraft: RuleDraft, variableName: string): boolean {
  return !ruleDraft.detailRuleEnabled && DETAIL_RULE_OFF_DISABLED_VARIABLES.includes(variableName as (typeof DETAIL_RULE_OFF_DISABLED_VARIABLES)[number]);
}

function collectDetailRuleOffForbiddenVariables(ruleDraft: RuleDraft): readonly string[] {
  if (ruleDraft.detailRuleEnabled) {
    return [];
  }

  const templateText = [
    ruleDraft.message.usernameTemplate,
    ruleDraft.message.titleTemplate,
    ruleDraft.message.bodyTemplate
  ].join("\n");
  return DETAIL_RULE_OFF_DISABLED_VARIABLES.filter((variableName) => templateText.includes(variableName));
}

function createDetailRuleOffVariableWarning(variables: readonly string[]): {
  readonly title: string;
  readonly variables: readonly string[];
} {
  return {
    title: "⚠ 詳細ルールがOFFのため、以下の変数は利用できません。",
    variables
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

  if (ruleDraft.detailRuleEnabled) {
    if (ruleDraft.battleType === "guildBattle" && ruleDraft.guildFilterSelectionMode === "specific" && ruleDraft.guildFilter.length === 0) {
      return "対象ギルドを1件以上選択してください。";
    }

    if (!isValidDetailConditionRoot(ruleDraft.detailConditions)) {
      return "\u8a73\u7d30\u6761\u4ef6\u306f0\u4ee5\u4e0a\u306e\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
    }
  }

  if (ruleDraft.message.titleTemplate.trim().length === 0) {
    return "通知サマリーを入力してください。";
  }

  if (ruleDraft.message.titleTemplate.length > NOTIFICATION_SUMMARY_MAX_LENGTH) {
    return `通知サマリーは${NOTIFICATION_SUMMARY_MAX_LENGTH}文字以内で入力してください。`;
  }

  if (
    ruleDraft.message.mention.type === "custom" &&
    (ruleDraft.message.mention.customText ?? "").trim().length === 0
  ) {
    return "カスタムメンションを入力してください。";
  }

  const forbiddenVariables = collectDetailRuleOffForbiddenVariables(ruleDraft);
  if (forbiddenVariables.length > 0) {
    return createDetailRuleOffVariableWarning(forbiddenVariables).title;
  }

  return null;
}

function isValidDetailConditionRoot(detailConditions: RuleDraft["detailConditions"]): boolean {
  return (
    detailConditions.operator === "OR" &&
    detailConditions.children.every((node) =>
      node.type === "condition"
        ? isValidDetailCondition(node)
        : node.children.every(isValidDetailCondition)
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

function normalizeDetailConditionValue(valueText: string): number {
  const parsedValue = Number(valueText);
  return Number.isSafeInteger(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
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

function createRuleScheduleSummary(rule: RuleRecord): string {
  const endTime = rule.schedule.endTime;
  return typeof endTime === "string" && endTime.length > 0
    ? `${rule.schedule.startTime}\u301c${endTime}`
    : `${rule.schedule.startTime}\u301c`;
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
