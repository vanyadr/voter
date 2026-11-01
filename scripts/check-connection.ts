import { createClient } from "@supabase/supabase-js";
import {
  connectionConfig,
  ConfigurationError,
  databaseFailure,
  loginDiagnostic,
} from "../src/lib/connection";
import { hashValue } from "../src/lib/crypto";

async function main() {
  try {
    const config = connectionConfig();
    console.log("Переменные окружения: OK (значения скрыты)");
    const client = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
      },
    });
    for (const table of ["events", "members", "ballots"]) {
      const result = await client
        .from(table)
        .select("id", { count: "exact", head: true });
      if (result.error) throw databaseFailure(result.error, result.status);
      if (result.count === null) throw new Error("Missing count");
      console.log(`Таблица ${table}: OK`);
    }
    const attempt = await client.rpc("voter_login_attempt", {
      p_key: hashValue("diagnostic-check", config.secret),
    });
    if (attempt.error) throw databaseFailure(attempt.error, attempt.status);
    if (typeof attempt.data !== "boolean")
      throw new Error("Unexpected RPC response");
    console.log("Функция входа voter_login_attempt: OK");
    console.log(
      "Подключение готово. Если ошибка возникает только на Vercel, сравните настройки Production и выполните Redeploy.",
    );
  } catch (error) {
    if (error instanceof ConfigurationError)
      console.error(`Проверьте переменную ${error.field} в .env.local.`);
    const diagnostic = loginDiagnostic(error);
    console.error(diagnostic.message);
    if (diagnostic.upstreamCode)
      console.error(`Код Supabase: ${diagnostic.upstreamCode}`);
    if (diagnostic.status !== undefined)
      console.error(`HTTP status: ${diagnostic.status}`);
    process.exitCode = 1;
  }
}
void main();
