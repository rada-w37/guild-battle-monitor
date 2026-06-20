export const featureFlags = {
  firebase: import.meta.env.VITE_ENABLE_FIREBASE === "true",
  notificationRuleV2: import.meta.env.VITE_ENABLE_NOTIFICATION_RULE_V2 === "true"
};
