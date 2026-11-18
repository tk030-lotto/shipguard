import type { Rule, ScanContext, Violation } from "../types/index.js";
import { corsRule } from "./cors.js";
import { databaseRlsRule } from "./database.js";
import { clientEnvSecretsRule, envSyncRule } from "./env.js";
import { secretsRule } from "./secrets.js";

// 全監査ルール一覧
export const ALL_RULES: Rule[] = [
  secretsRule,
  clientEnvSecretsRule,
  databaseRlsRule,
  corsRule,
  envSyncRule,
];

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
      // Rule メタデータおよびユーザー設定の Severity を単一真実源として適用
      violation.ruleName = rule.name;
      violation.severity = configuredSeverity ?? rule.defaultSeverity;
      allViolations.push(violation);
    }
  }

  return allViolations;
}
