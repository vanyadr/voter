// Shared by the server and the local diagnostic command. Never log its return value.
export type ConnectionConfig = {
  url: string;
  key: string;
  secret: string;
  bootstrapCode: string;
};

export class ConfigurationError extends Error {
  constructor(readonly field: string) {
    super(`Check environment variable ${field}`);
    this.name = "ConfigurationError";
  }
}

export function connectionConfig(
  env: Record<string, string | undefined> = process.env,
): ConnectionConfig {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new ConfigurationError("SUPABASE_URL");
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
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
    throw new ConfigurationError("SUPABASE_URL");
  }
  if (!key || /[\s"']/.test(key))
    throw new ConfigurationError("SUPABASE_SERVICE_ROLE_KEY");
  if ((env.APP_SECRET?.length ?? 0) < 32)
    throw new ConfigurationError("APP_SECRET");
  if ((env.BOOTSTRAP_CODE?.length ?? 0) < 12)
    throw new ConfigurationError("BOOTSTRAP_CODE");
  return {
    url,
    key,
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
};

export function loginDiagnostic(error: unknown): LoginDiagnostic {
  if (error instanceof ConfigurationError)
    return {
      category: "CONFIG",
      message:
        "Не удалось войти (CONFIG). Организатору нужно проверить переменные окружения и повторить деплой.",
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
