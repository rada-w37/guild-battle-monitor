import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import {
  getOwnerGuildShare,
  saveOwnerGuildShare,
  verifyGuildShareAccess
} from "./guildShare.js";

initializeApp();
setGlobalOptions({ region: "asia-northeast1" });

export { getOwnerGuildShare, saveOwnerGuildShare, verifyGuildShareAccess };
