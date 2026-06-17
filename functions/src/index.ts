import { initializeApp } from "firebase-admin/app";
import {
  getOwnerGuildShare,
  saveOwnerGuildShare,
  verifyGuildShareAccess
} from "./guildShare.js";

initializeApp();

export { getOwnerGuildShare, saveOwnerGuildShare, verifyGuildShareAccess };
