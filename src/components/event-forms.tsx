"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Rocket,
} from "lucide-react";
import {
  createEventAction,
  rotateCodesAction,
  startEventAction,
  updateDraftAction,
} from "@/app/actions";
import type { AccessCode, ActionResult, Event, Member } from "@/lib/model";

export function CodesPanel({ codes }: { codes: AccessCode[] }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        codes
          .map(
            (c) =>
              `${c.name} (${c.role === "jury" ? "жюри" : "участник"}): ${c.code}`,
          )
          .join("\n"),
      );
      setCopied(true);
      setError("");
    } catch {
      setError(
        "Не удалось скопировать автоматически. Выделите и сохраните коды вручную.",
      );
    }
  }
  return (
    <section className="codes-panel">
      <div className="panel-heading">
        <div>
          <h3>Личные коды доступа</h3>
          <p>Сохраните коды и передайте каждому только его код.</p>
        </div>
        <button type="button" className="button secondary small" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </div>
      <p className="notice">
        Коды показаны только сейчас. После ухода со страницы восстановить их
        нельзя. До открытия голосования можно выпустить новый комплект.
      </p>
      <div className="code-list">
        {codes.map((c) => (
          <div key={c.id}>
            <span>
              <strong>{c.name}</strong>
              <small>{c.role === "jury" ? "Жюри" : "Участник"}</small>
            </span>
            <code>{c.code}</code>
          </div>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
function EventFields({
  event,
  members,
}: {
  event?: Event;
  members?: Member[];
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="event-title">Название мероприятия</label>
        <input
          id="event-title"
          name="title"
          required
          maxLength={100}
          defaultValue={event?.title ?? "Кейс-чемпионат"}
        />
      </div>
      <h3 className="form-group-title">
        Участники <span>4 человека</span>
      </h3>
      <div className="form-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="field" key={i}>
            <label htmlFor={`name-${i}`}>Участник {i + 1}</label>
            <input
              id={`name-${i}`}
              name={`name-${i}`}
              required
              maxLength={60}
              placeholder="Имя и фамилия"
              defaultValue={members?.[i]?.name}
            />
          </div>
        ))}
      </div>
      <h3 className="form-group-title">
        Жюри <span>2 человека</span>
      </h3>
      <div className="form-grid">
        {[4, 5].map((i) => (
          <div className="field" key={i}>
            <label htmlFor={`name-${i}`}>Член жюри {i - 3}</label>
            <input
              id={`name-${i}`}
              name={`name-${i}`}
              required
              maxLength={60}
              placeholder="Имя и фамилия"
              defaultValue={members?.[i]?.name}
            />
          </div>
        ))}
      </div>
    </>
  );
}
export function CreateEventForm({
  existingDraft = false,
  members,
}: {
  existingDraft?: boolean;
  members?: Member[];
}) {
  const [state, action, pending] = useActionState(
    createEventAction,
    {} as ActionResult,
  );
  if (state.codes)
    return (
      <>
        <CodesPanel codes={state.codes} />
        <div className="notice success">
          Мероприятие создано. Вы вошли как первый член жюри. Сохраните и свой
          код — он понадобится для повторного входа.
        </div>
        <Link className="button primary" href="/dashboard">
          К подготовке мероприятия <ArrowRight size={18} />
        </Link>
      </>
    );
  if (existingDraft)
    return (
      <div className="panel empty-panel">
        <Check size={30} />
        <h3>Мероприятие уже создано</h3>
        <p>
          Перейдите в подготовку. Если коды не сохранены, выпустите новый
          комплект.
        </p>
        <Link href="/dashboard" className="button primary">
          Открыть мероприятие <ArrowRight size={18} />
        </Link>
      </div>
    );
  return (
    <form action={action} className="panel event-form">
      <EventFields members={members} />
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <div className="form-bottom">
        <p>Веса критериев 3/2/1 · Жюри 70% · Участники 30%</p>
        <button className="button primary" disabled={pending}>
          {pending ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <>
              Создать и получить коды <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
export function ManageEvent({
  event,
  members,
}: {
  event: Event;
  members: Member[];
}) {
  const [state, action, saving] = useActionState(
    updateDraftAction,
    {} as ActionResult,
  );
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  return (
    <div className="manage-layout">
      <form action={action} className="panel event-form">
        <EventFields event={event} members={members} />
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="success-text">
            Изменения сохранены
          </p>
        )}
        <div className="form-bottom">
          <span>
            Сначала сохраните изменения, затем открывайте голосование.
          </span>
          <button className="button secondary" disabled={saving || pending}>
            {saving ? "Сохраняем…" : "Сохранить изменения"}
          </button>
        </div>
      </form>
      <div className="panel launch-panel">
        <div className="section-icon">
          <Rocket size={24} />
        </div>
        <h3>Всё готово к старту?</h3>
        <p>
          Передайте каждому личный код. После открытия голосования имена, коды и
          правила будут зафиксированы.
        </p>
        <button
          className="button secondary full"
          type="button"
          disabled={pending || saving}
          onClick={() => setConfirmRotate(true)}
        >
          <KeyRound size={17} /> Выпустить новые коды
        </button>
        {confirmRotate && (
          <div className="inline-confirm">
            <p>
              Предыдущие коды перестанут работать для нового входа. Уже открытые
              сессии сохранятся.
            </p>
            <div>
              <button
                className="button secondary small"
                onClick={() => setConfirmRotate(false)}
              >
                Отмена
              </button>
              <button
                className="button primary small"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await rotateCodesAction();
                    setError(r.error ?? "");
                    if (r.codes) setCodes(r.codes);
                    setConfirmRotate(false);
                  })
                }
              >
                <RefreshCw size={15} /> Выпустить
              </button>
            </div>
          </div>
        )}
        <button
          className="button primary full"
          disabled={pending || saving}
          onClick={() => setConfirmStart(true)}
        >
          <Rocket size={17} /> Открыть голосование
        </button>
        {confirmStart && (
          <div className="inline-confirm">
            <p>
              Все имена сохранены, а коды переданы? Открытие нельзя отменить.
            </p>
            <div>
              <button
                className="button secondary small"
                onClick={() => setConfirmStart(false)}
              >
                Отмена
              </button>
              <button
                className="button primary small"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await startEventAction();
                    setError(r.error ?? "");
                    setConfirmStart(false);
                  })
                }
              >
                {pending ? "Открываем…" : "Да, открыть"}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {codes && <CodesPanel codes={codes} />}
    </div>
  );
}
