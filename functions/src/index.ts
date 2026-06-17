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
  saveNotificationRule
} from "./notificationSettings.js";

initializeApp();

export {
  deleteNotificationRule,
  getNotificationSettings,
  getOwnerGuildShare,
  saveNotificationDestination,
  saveNotificationRule,
  saveOwnerGuildShare,
  verifyGuildShareAccess
};
