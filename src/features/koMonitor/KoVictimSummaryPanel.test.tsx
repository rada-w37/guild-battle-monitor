import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("KoVictimSummaryPanel styles", () => {
  it("aligns count cells to the same column start as the count header", () => {
    const styles = readFileSync("src/app/styles.css", "utf8");
    const tableRule = getStyleRule(styles, ".ko-victim-summary__table");
    const gridRule = getStyleRule(styles, ".ko-victim-summary__header, .ko-victim-summary__row");
    const countRule = getStyleRule(styles, ".ko-victim-summary__count");

    expect(tableRule).toContain("--ko-victim-summary-columns: minmax(0, 1fr) 110px;");
    expect(gridRule).toContain("grid-template-columns: var(--ko-victim-summary-columns);");
    expect(countRule).toContain("text-align: left;");
    expect(countRule).not.toContain("text-align: right;");
  });
});

function getStyleRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/, /g, ",\\s*");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[\\s\\S]*?)\\}`));

  return match?.groups?.body ?? "";
}
