import { describe, expect, it } from "vitest";

import {
  applyNotificationTemplate,
  DEFAULT_NOTIFICATION_BODY_TEMPLATE,
  NOTIFICATION_TEMPLATE_VARIABLES
} from "./notificationTemplates";

describe("notification templates", () => {
  it("shows defense count with the UI wording", () => {
    expect(NOTIFICATION_TEMPLATE_VARIABLES).toContain("{防衛数}");
    expect(NOTIFICATION_TEMPLATE_VARIABLES).not.toContain("{防御数}");
    expect(DEFAULT_NOTIFICATION_BODY_TEMPLATE).toContain("防衛数：{防衛数}");
  });

  it("supports the defending guild variable for UI buttons and preview", () => {
    expect(NOTIFICATION_TEMPLATE_VARIABLES).toContain("{防衛ギルド}");
    expect(applyNotificationTemplate("侵攻：{侵攻ギルド} / 防衛：{防衛ギルド}")).toBe(
      "侵攻：敵ギルドA / 防衛：敵ギルドB"
    );
  });

  it("keeps preview compatibility for the old defense count variable", () => {
    expect(applyNotificationTemplate("防衛数：{防衛数} / 防御数：{防御数}")).toBe("防衛数：20 / 防御数：20");
  });
});
