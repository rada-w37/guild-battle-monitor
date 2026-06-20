import { initializeApp } from "firebase-admin/app";
import {
  getOwnerGuildShare,
  saveOwnerGuildShare,
  verifyGuildShareAccess
} from "./guildShare.js";
import {
  deleteNotificationRule,
  getNotificationSettings,
  getNotificationSettingsV2,
  saveNotificationDestination,
  saveNotificationRule,
  saveNotificationRuleV2,
  suspendNotificationRule
} from "./notificationSettings.js";
import { dispatchNotificationRequest } from "./notificationDispatch.js";
import { syncGuildBattleGuildCandidates } from "./guildBattleGuildCandidates.js";

initializeApp();

export {
  deleteNotificationRule,
  dispatchNotificationRequest,
  getNotificationSettings,
  getNotificationSettingsV2,
  getOwnerGuildShare,
  saveNotificationDestination,
  saveNotificationRule,
  saveNotificationRuleV2,
  saveOwnerGuildShare,
  syncGuildBattleGuildCandidates,
  suspendNotificationRule,
  verifyGuildShareAccess
};
