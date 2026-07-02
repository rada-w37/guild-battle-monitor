export const NOTIFICATION_TEMPLATE_VARIABLES = [
  "{拠点名}",
  "{侵攻ギルド}",
  "{防衛ギルド}",
  "{防衛数}",
  "{侵攻数}",
  "{通知時刻}",
  "{通知ルール名}"
] as const;

export const DEFAULT_NOTIFICATION_PREVIEW_CONTEXT = {
  拠点名: "ブラッセル",
  侵攻ギルド: "敵ギルドA",
  防衛ギルド: "防衛ギルド",
  防衛数: "20",
  防御数: "20",
  侵攻数: "15",
  通知時刻: "21:16",
  通知ルール名: "見落とし防止"
} as const;

export const DEFAULT_NOTIFICATION_USERNAME_TEMPLATE = "ギルバト監視BOT - {拠点名}";
export const DEFAULT_NOTIFICATION_TITLE_TEMPLATE = "⚠ {拠点名}が攻撃されています！";
export const DEFAULT_NOTIFICATION_BODY_TEMPLATE =
  "{拠点名}が{侵攻ギルド}から攻撃を受けています。\n防衛数：{防衛数}　侵攻数：{侵攻数}\n通知時刻：{通知時刻}";

export function applyNotificationTemplate(template: string): string {
  return Object.entries(DEFAULT_NOTIFICATION_PREVIEW_CONTEXT).reduce(
    (currentText, [key, value]) => currentText.replaceAll(`{${key}}`, value),
    template
  );
}
