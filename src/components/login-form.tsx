"use client";
import { useActionState } from "react";
import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import { loginAction } from "@/app/actions";
import type { ActionResult } from "@/lib/model";

export function LoginForm({
  enabled,
  configurationProblems = [],
}: {
  enabled: boolean;
  configurationProblems?: string[];
}) {
  const [state, action, pending] = useActionState(
    loginAction,
    {} as ActionResult,
  );
  return (
    <form action={action} className="login-form">
      <label htmlFor="code">Ваш персональный код</label>
      <div className="code-input">
        <KeyRound size={19} />
        <input
          id="code"
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          required
          minLength={12}
          maxLength={100}
          disabled={!enabled || pending}
          aria-describedby="code-hint login-error"
        />
      </div>
      <p id="code-hint" className="input-hint">
        Код доступа можно получить у жюри.
      </p>
      {state.error && (
        <p id="login-error" className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {!enabled && (
        <div className="form-error" role="status">
          <p>Текущий деплой не получил корректные настройки:</p>
          <ul className="configuration-problems">
            {configurationProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p>
            В Vercel откройте настройки проекта → Environments → Production,
            сохраните переменные и выполните Redeploy. Секретные значения здесь
            не отображаются.
          </p>
        </div>
      )}
      <button className="button primary full" disabled={!enabled || pending}>
        {pending ? (
          <LoaderCircle size={18} className="spin" />
        ) : (
          <>
            Войти в приложение <ArrowRight size={18} />
          </>
        )}
      </button>
    </form>
  );
}
