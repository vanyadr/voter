// Shared by the server and the local diagnostic command. Never log its return value.
export type ConnectionConfig = {
  url: string;
  key: string;
  secret: string;
  bootstrapCode: string;
};

export type ConfigurationField =
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "APP_SECRET"
  | "BOOTSTRAP_CODE";
export type ConfigurationIssue = {
  field: ConfigurationField;
  reason: "missing" | "format" | "too_short";
};

export class ConfigurationError extends Error {
  constructor(
    readonly field: ConfigurationField,
    readonly reason: ConfigurationIssue["reason"] = "format",
  ) {
    super(`Check environment variable ${field}`);
    this.name = "ConfigurationError";
  }
}

export function configurationIssues(
  env: Record<string, string | undefined> = process.env,
): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) issues.push({ field: "SUPABASE_URL", reason: "missing" });
  else
    try {
      const parsed = new URL(url);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(
        parsed.hostname,
      );
      if (
        (parsed.protocol !== "https:" &&
          !(local && parsed.protocol === "http:")) ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("Not a project URL");
      }
    } catch {
      issues.push({ field: "SUPABASE_URL", reason: "format" });
    }
  if (!key)
    issues.push({ field: "SUPABASE_SERVICE_ROLE_KEY", reason: "missing" });
  else if (/[\s"']/.test(key))
    issues.push({ field: "SUPABASE_SERVICE_ROLE_KEY", reason: "format" });
  for (const [field, minimum] of [
    ["APP_SECRET", 32],
    ["BOOTSTRAP_CODE", 12],
  ] as const) {
    if (!env[field]?.trim()) issues.push({ field, reason: "missing" });
    else if (env[field]!.length < minimum)
      issues.push({ field, reason: "too_short" });
  }
  return issues;
}

export function configurationIssueMessage(issue: ConfigurationIssue): string {
  if (issue.reason === "missing")
    return `${issue.field}: переменная отсутствует или пуста в текущем деплое.`;
  if (issue.field === "SUPABASE_URL")
    return "SUPABASE_URL: нужен URL проекта вида https://ваш-проект.supabase.co, без /rest/v1, ссылки на dashboard и кавычек.";
  if (issue.field === "SUPABASE_SERVICE_ROLE_KEY")
    return "SUPABASE_SERVICE_ROLE_KEY: уберите кавычки и внутренние пробелы из значения серверного ключа.";
  return `${issue.field}: значение должно содержать не менее ${issue.field === "APP_SECRET" ? 32 : 12} символов.`;
}

export function connectionConfig(
  env: Record<string, string | undefined> = process.env,
): ConnectionConfig {
  const issue = configurationIssues(env)[0];
  if (issue) throw new ConfigurationError(issue.field, issue.reason);
  return {
    url: env.SUPABASE_URL!.trim(),
    key: env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    secret: env.APP_SECRET!,
    bootstrapCode: env.BOOTSTRAP_CODE!,
  };
}

export type LoginDiagnostic = {
  category:
    | "CONFIG"
    | "DB_AUTH"
    | "DB_PERMISSIONS"
    | "DB_SCHEMA"
    | "DB_UNAVAILABLE"
    | "LOGIN_INTERNAL";
  message: string;
  upstreamCode?: string;
  status?: number;
  configurationField?: ConfigurationField;
  configurationReason?: ConfigurationIssue["reason"];
};

export function loginDiagnostic(error: unknown): LoginDiagnostic {
  if (error instanceof ConfigurationError)
    return {
      category: "CONFIG",
      configurationField: error.field,
      configurationReason: error.reason,
      message: `Не удалось войти (CONFIG). ${configurationIssueMessage(error)} Проверьте настройки Production в Vercel и выполните Redeploy.`,
    };
  const detail =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  // Only bounded machine codes and HTTP status are safe to include in logs.
  const upstreamCode =
    typeof detail.code === "string" && /^[A-Z0-9_]{1,20}$/.test(detail.code)
      ? detail.code
      : undefined;
  const status =
    typeof detail.status === "number" &&
    Number.isInteger(detail.status) &&
    detail.status >= 0 &&
    detail.status <= 599
      ? detail.status
      : undefined;
  const text = typeof detail.message === "string" ? detail.message : "";
  const metadata = { upstreamCode, status };
  if (
    ["PGRST202", "PGRST205", "PGRST106", "42P01", "42883"].includes(
      upstreamCode ?? "",
    )
  )
    return {
      ...metadata,
      category: "DB_SCHEMA",
      message:
        "Не удалось войти (DB_SCHEMA). База данных ещё не подготовлена. Организатору нужно проверить SQL-миграцию и доступность схемы public в Data API.",
    };
  if (upstreamCode === "42501")
    return {
      ...metadata,
      category: "DB_PERMISSIONS",
      message:
        "Не удалось войти (DB_PERMISSIONS). Организатору нужно проверить серверный ключ Supabase и права из SQL-миграции.",
    };
  if (
    status === 401 ||
    status === 403 ||
    ["PGRST301", "PGRST302", "PGRST303"].includes(upstreamCode ?? "") ||
    /invalid api key|invalid jwt/i.test(text)
  )
    return {
      ...metadata,
      category: "DB_AUTH",
      message:
        "Не удалось войти (DB_AUTH). Организатору нужно проверить, что URL и серверный ключ Supabase относятся к одному проекту, и повторить деплой.",
    };
  if (
    status === 0 ||
    (status !== undefined && status >= 500) ||
    [
      "PGRST000",
      "PGRST001",
      "PGRST002",
      "PGRST003",
      "57014",
      "53300",
      "57P01",
    ].includes(upstreamCode ?? "") ||
    /fetch failed|timeout|aborted|ENOTFOUND|ECONNREFUSED/i.test(text)
  )
    return {
      ...metadata,
      category: "DB_UNAVAILABLE",
      message:
        "Не удалось войти (DB_UNAVAILABLE). База данных временно недоступна. Проверьте, что проект Supabase запущен, и повторите попытку.",
    };
  return {
    ...metadata,
    category: "LOGIN_INTERNAL",
    message:
      "Не удалось войти (LOGIN_INTERNAL). Повторите попытку или передайте код ошибки организатору.",
  };
}

export function databaseFailure(
  error: { code: string; message: string },
  status: number,
) {
  // Keep upstream text only for classification, never return it to the browser or log it.
  return { code: error.code, message: error.message, status };
}
