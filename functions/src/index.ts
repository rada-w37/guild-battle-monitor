import { initializeApp } from "firebase-admin/app";
import {
  getOwnerGuildShare,
  saveOwnerGuildShare,
  verifyGuildShareAccess
} from "./guildShare.js";
import {
  deleteNotificationRule,
  getNotificationSettings,
  saveNotificationDestination,
  saveNotificationRule,
  suspendNotificationRule
} from "./notificationSettings.js";
import { dispatchNotificationRequest } from "./notificationDispatch.js";
import { syncGuildBattleGuildCandidates } from "./guildBattleGuildCandidates.js";

initializeApp();

export {
  deleteNotificationRule,
  dispatchNotificationRequest,
  getNotificationSettings,
  getOwnerGuildShare,
  saveNotificationDestination,
  saveNotificationRule,
  saveOwnerGuildShare,
  syncGuildBattleGuildCandidates,
  suspendNotificationRule,
  verifyGuildShareAccess
};
