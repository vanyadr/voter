"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  LockKeyhole,
  X,
} from "lucide-react";
import { submitBallotAction } from "@/app/actions";
import {
  CRITERIA,
  weightedScore,
  type Member,
  type OwnBallot,
} from "@/lib/model";

export function BallotDialog({
  target,
  saved,
  scores,
  onScores,
  onClose,
}: {
  target: Member;
  saved?: OwnBallot;
  scores: number[];
  onScores: (value: number[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const values = saved?.scores ?? scores;
  const complete = values.filter((v) => v >= 1 && v <= 5).length;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function close() {
    if (!pending) onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="ballot-dialog"
      aria-labelledby="ballot-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <div>
            <span className="eyebrow muted">
              {saved ? "ВАШ ОТПРАВЛЕННЫЙ БЛАНК" : "БЛАНК ОЦЕНКИ"}
            </span>
            <h2 id="ballot-title">{target.name}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть бланк"
            onClick={close}
            disabled={pending}
          >
            <X size={21} />
          </button>
        </header>
        {done ? (
          <div className="ballot-success">
            <span>
              <CheckCheck size={34} />
            </span>
            <h3>Спасибо за вашу оценку!</h3>
            <p>
              Бланк сохранён. Каждое мнение помогает выбрать лучшее решение.
            </p>
            <button className="button primary" onClick={onClose}>
              К выступлениям <ArrowRight size={17} />
            </button>
          </div>
        ) : (
          <>
            <p className="dialog-intro">
              {saved
                ? "Бланк сохранён. Изменение оценок недоступно."
                : confirm
                  ? "Проверьте оценки перед отправкой. После сохранения изменить их будет нельзя."
                  : "Оцените выступление по каждому критерию. 1 — минимальная оценка, 5 — максимальная."}
            </p>
            <div className="criteria-list">
              {CRITERIA.map((c, i) => (
                <fieldset
                  key={c.id}
                  className="criterion"
                  disabled={!!saved || confirm || pending}
                >
                  <legend>
                    <span>{c.name}</span>
                    <span className={`weight weight-${c.weight}`}>
                      ×{c.weight}
                    </span>
                  </legend>
                  <p>{c.description}</p>
                  <div className="rating" role="radiogroup" aria-label={c.name}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label
                        key={n}
                        className={`rating-option ${values[i] === n ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name={c.id}
                          value={n}
                          checked={values[i] === n}
                          onChange={() => {
                            const updated = [...scores];
                            updated[i] = n;
                            onScores(updated);
                          }}
                        />
                        <span>{n}</span>
                        <span className="sr-only"> из 5</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer className="dialog-footer">
              <div>
                <span>
                  {complete === 6 ? "Взвешенный балл" : "Заполнено критериев"}
                </span>
                <strong>
                  {complete === 6
                    ? `${weightedScore(values)} / 60`
                    : `${complete} / 6`}
                </strong>
              </div>
              {saved ? (
                <button className="button secondary" onClick={onClose}>
                  <Check size={17} /> Готово
                </button>
              ) : confirm ? (
                <div className="dialog-actions">
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() => setConfirm(false)}
                  >
                    <ArrowLeft size={16} /> Назад
                  </button>
                  <button
                    className="button primary"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await submitBallotAction(
                          target.id,
                          scores,
                        );
                        setError(result.error ?? "");
                        if (result.ok) setDone(true);
                      })
                    }
                  >
                    {pending ? (
                      "Сохраняем…"
                    ) : (
                      <>
                        <LockKeyhole size={16} /> Отправить бланк
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  className="button primary"
                  disabled={complete !== 6}
                  onClick={() => setConfirm(true)}
                >
                  Проверить оценки <ArrowRight size={17} />
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
