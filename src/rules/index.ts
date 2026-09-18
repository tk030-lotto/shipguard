import type { Rule, ScanContext, Violation } from "../types/index.js";
import { secretsRule } from "./secrets.js";

// 現在有効なルール一覧（Phase 1 は SEC-001）
export const ALL_RULES: Rule[] = [secretsRule];

/**
 * 登録されたすべてのルールを実行し、設定に応じたSeverityを適用して結果を返す
 */
export async function executeRules(context: ScanContext): Promise<Violation[]> {
  const allViolations: Violation[] = [];

  for (const rule of ALL_RULES) {
    // 設定で "off" になっている場合はスキップ
    const configuredSeverity = context.config.rules?.[rule.id];
    if (configuredSeverity === "off") {
      continue;
    }

    const ruleViolations = await rule.check(context);

    for (const violation of ruleViolations) {
      // ユーザー設定の Severity があれば上書き
      if (configuredSeverity) {
        violation.severity = configuredSeverity;
      }
      allViolations.push(violation);
    }
  }

  return allViolations;
}
