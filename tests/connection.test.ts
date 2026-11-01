import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionConfig,
  ConfigurationError,
  databaseFailure,
  loginDiagnostic,
  configurationIssues,
  configurationIssueMessage,
} from "../src/lib/connection";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_TEST_VALUE",
  APP_SECRET: "s".repeat(64),
  BOOTSTRAP_CODE: "INITIAL-SETUP-CODE",
};

test("connection configuration accepts project origins and trims pasted URL/key whitespace", () => {
  const config = connectionConfig({
    ...env,
    SUPABASE_URL: ` ${env.SUPABASE_URL}\n`,
    SUPABASE_SERVICE_ROLE_KEY: ` ${env.SUPABASE_SERVICE_ROLE_KEY}\n`,
  });
  assert.equal(config.url, env.SUPABASE_URL);
  assert.equal(config.key, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(config.secret, env.APP_SECRET);
  assert.doesNotThrow(() =>
    connectionConfig({ ...env, SUPABASE_URL: "http://127.0.0.1:54321" }),
  );
});
test("configuration rejects dashboard URLs, API subpaths, quoted values and missing variables", () => {
  for (const url of [
    "https://supabase.com/dashboard/project/test",
    "https://example.supabase.co/rest/v1",
    "https://example.supabase.co?apikey=SECRET",
    '"https://example.supabase.co"',
    "http://example.supabase.co",
  ]) {
    assert.throws(
      () => connectionConfig({ ...env, SUPABASE_URL: url }),
      ConfigurationError,
    );
  }
  assert.throws(
    () =>
      connectionConfig({
        ...env,
        SUPABASE_SERVICE_ROLE_KEY: '"sb_secret_TEST_VALUE"',
      }),
    ConfigurationError,
  );
  for (const name of Object.keys(env))
    assert.throws(
      () => connectionConfig({ ...env, [name]: "" }),
      ConfigurationError,
    );
});
test("login diagnostics distinguish missing schema, bad keys, permissions and unavailable database", () => {
  assert.equal(
    loginDiagnostic({ code: "PGRST202", status: 404 }).category,
    "DB_SCHEMA",
  );
  assert.equal(loginDiagnostic({ code: "42P01" }).category, "DB_SCHEMA");
  assert.equal(
    loginDiagnostic({ code: "42501", status: 403 }).category,
    "DB_PERMISSIONS",
  );
  assert.equal(
    loginDiagnostic(
      databaseFailure({ code: "", message: "Invalid API key" }, 401),
    ).category,
    "DB_AUTH",
  );
  assert.equal(loginDiagnostic({ code: "PGRST301" }).category, "DB_AUTH");
  for (const failure of [
    { status: 0 },
    { status: 503 },
    { code: "PGRST002" },
    new Error("TypeError: fetch failed"),
    new Error("TimeoutError: aborted"),
  ])
    assert.equal(loginDiagnostic(failure).category, "DB_UNAVAILABLE");
  assert.equal(
    loginDiagnostic(new ConfigurationError("SUPABASE_URL")).category,
    "CONFIG",
  );
  assert.equal(
    loginDiagnostic(new Error("cookie write failed")).category,
    "LOGIN_INTERNAL",
  );
});
test("upstream error text and untrusted machine codes never leak through diagnostics", () => {
  const marker = "sb_secret_SENSITIVE_VALUE";
  for (const error of [
    { message: `Invalid API key: ${marker}`, status: 401, code: marker },
    { message: marker, code: marker },
    new Error(marker),
    null,
  ]) {
    assert.equal(
      JSON.stringify(loginDiagnostic(error)).includes(marker),
      false,
    );
  }
});

test("configuration diagnostics identify all missing fields without exposing any values", () => {
  assert.deepEqual(configurationIssues({}), [
    { field: "SUPABASE_URL", reason: "missing" },
    { field: "SUPABASE_SERVICE_ROLE_KEY", reason: "missing" },
    { field: "APP_SECRET", reason: "missing" },
    { field: "BOOTSTRAP_CODE", reason: "missing" },
  ]);
  const invalid = {
    ...env,
    APP_SECRET: "PRIVATE_SHORT_SECRET",
    BOOTSTRAP_CODE: "PRIVATE",
  };
  const issues = configurationIssues(invalid);
  assert.deepEqual(issues, [
    { field: "APP_SECRET", reason: "too_short" },
    { field: "BOOTSTRAP_CODE", reason: "too_short" },
  ]);
  const output = issues.map(configurationIssueMessage).join("\n");
  assert.match(output, /APP_SECRET.*32/);
  assert.match(output, /BOOTSTRAP_CODE.*12/);
  assert.equal(output.includes("PRIVATE"), false);
});

test("CONFIG login errors include the offending field and a safe corrective instruction", () => {
  for (const field of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_SECRET",
    "BOOTSTRAP_CODE",
  ] as const) {
    const diagnostic = loginDiagnostic(
      new ConfigurationError(field, "missing"),
    );
    assert.equal(diagnostic.configurationField, field);
    assert.equal(diagnostic.configurationReason, "missing");
    assert.match(diagnostic.message, new RegExp(field));
    assert.match(diagnostic.message, /Redeploy/);
  }
});
