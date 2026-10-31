"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  AudioLines,
  BookOpen,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Eye,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Medal,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sparkle,
  Trophy,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Brand } from "./brand";
import { BallotDialog } from "./ballot-dialog";
import { ManageEvent } from "./event-forms";
import {
  CRITERIA,
  formatScore,
  type Dashboard,
  type Member,
} from "@/lib/model";

type Tab = "vote" | "rules" | "results" | "manage";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

export function DashboardView({ data }: { data: Dashboard }) {
  const { viewer, event, members, ballots, submitted, results } = data;
  const jury = viewer.role === "jury";
  const [tab, setTab] = useState<Tab>(
    event.status === "draft" && jury ? "manage" : "vote",
  );
  const [selected, setSelected] = useState<Member | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (event.status === "completed") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [event.status, router]);
  useEffect(() => {
    if (event.status !== "draft" && tab === "manage") setTab("vote");
  }, [event.status, tab]);
  const targets = members.filter(
    (m) => m.role === "participant" && m.id !== viewer.id,
  );
  const done = ballots.length;
  const allDone = done === targets.length;
  const title =
    tab === "rules"
      ? "Как устроена оценка"
      : tab === "results"
        ? "Результаты чемпионата"
        : tab === "manage"
          ? "Подготовка мероприятия"
          : "Оценка выступлений";
  function nav(next: Tab) {
    setTab(next);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-event">
          <span className="eyebrow muted">ВАШЕ МЕРОПРИЯТИЕ</span>
          <strong>{event.title}</strong>
          <span className={`status ${event.status}`}>
            <i />
            {event.status === "draft"
              ? "Подготовка"
              : event.status === "completed"
                ? "Завершено"
                : "Голосование открыто"}
          </span>
        </div>
        <nav aria-label="Разделы приложения" className="main-nav">
          <button
            className={tab === "vote" ? "active" : ""}
            onClick={() => nav("vote")}
          >
            <LayoutGrid size={19} /> Выступления{" "}
            <span className="nav-count">4</span>
          </button>
          <button
            className={tab === "rules" ? "active" : ""}
            onClick={() => nav("rules")}
          >
            <BookOpen size={19} /> Правила оценки
          </button>
          {jury && (
            <button
              className={tab === "results" ? "active" : ""}
              onClick={() => nav("results")}
            >
              <Trophy size={19} /> Результаты{" "}
              {event.status !== "completed" && (
                <LockKeyhole size={14} className="nav-end" />
              )}
            </button>
          )}
          {jury && event.status === "draft" && (
            <button
              className={tab === "manage" ? "active" : ""}
              onClick={() => nav("manage")}
            >
              <Settings2 size={19} /> Подготовка
            </button>
          )}
        </nav>
        <div className="sidebar-note">
          <div className="little-sparkle">
            <Sparkles size={19} />
          </div>
          <strong>Каждая оценка важна</strong>
          <p>
            Посмотрите на идею с разных сторон. Именно из деталей складывается
            лучший результат.
          </p>
          <button onClick={() => nav("rules")}>
            О критериях <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-user">
          <span className="avatar user-avatar">{initials(viewer.name)}</span>
          <div>
            <strong>{viewer.name}</strong>
            <span>{jury ? "Член жюри" : "Участник"}</span>
          </div>
          <form action={logoutAction}>
            <button
              className="icon-button"
              aria-label="Выйти из приложения"
              title="Выйти"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            Кейс-чемпионат <ChevronRight size={14} />
            <span>
              {tab === "rules"
                ? "Правила"
                : tab === "results"
                  ? "Результаты"
                  : tab === "manage"
                    ? "Подготовка"
                    : "Выступления"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="anonymous">
              <ShieldCheck size={16} /> Анонимное голосование
            </span>
            <span className="role-tag">{jury ? "Жюри" : "Участник"}</span>
          </div>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <span className="eyebrow muted">{event.title}</span>
              <h1>
                {title}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {tab === "vote"
                  ? "Большие идеи начинаются с внимательного взгляда. Дайте свою оценку."
                  : tab === "results"
                    ? "Каждое мнение учтено. Познакомьтесь с итогами выступлений."
                    : tab === "manage"
                      ? "Добавьте имена, раздайте коды и откройте голосование."
                      : "Прозрачные правила, чтобы каждое выступление получило честную оценку."}
              </p>
            </div>
            <button
              className={`button secondary refresh-button ${refreshing ? "refreshing" : ""}`}
              onClick={() => {
                setRefreshing(true);
                router.refresh();
                setTimeout(() => setRefreshing(false), 800);
              }}
              aria-label="Обновить данные"
            >
              <RefreshCw size={16} />
              <span>Обновить</span>
            </button>
          </div>

          {tab === "vote" && (
            <>
              <section className="overview-grid">
                <div className="overview-card personal-progress">
                  <span className="stat-icon purple">
                    <ClipboardList size={21} />
                  </span>
                  <div>
                    <span className="stat-label">Мои оценки</span>
                    <strong>
                      {done}
                      <span> / {targets.length}</span>
                    </strong>
                  </div>
                  <div className="progress-track">
                    <div
                      style={{ width: `${(done / targets.length) * 100}%` }}
                    />
                  </div>
                  <p>
                    {allDone
                      ? "Все ваши бланки отправлены"
                      : "Отправленные бланки нельзя изменить"}
                  </p>
                </div>
                <div className="overview-card">
                  <span className="stat-icon peach">
                    <Sparkles size={21} />
                  </span>
                  <div>
                    <span className="stat-label">Критерии оценки</span>
                    <strong>
                      6<span> критериев</span>
                    </strong>
                  </div>
                  <p>По шкале от 1 до 5 с разными весами</p>
                  <button className="stat-link" onClick={() => nav("rules")}>
                    Посмотреть критерии <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="overview-card">
                  <span className="stat-icon green">
                    <Users size={21} />
                  </span>
                  <div>
                    <span className="stat-label">Вес мнения</span>
                    <strong>
                      70<span>%</span>
                      <span className="stat-divider">/</span>30<span>%</span>
                    </strong>
                  </div>
                  <p>Жюри / участники</p>
                  <span className="stat-footnote">
                    <ShieldCheck size={13} /> Баланс экспертного и общего
                    взгляда
                  </span>
                </div>
              </section>
              {event.status === "draft" ? (
                <div className="notice info">
                  <Clock3 size={18} />
                  <span>
                    Жюри готовят мероприятие. Бланки станут доступны после
                    открытия голосования.
                  </span>
                </div>
              ) : allDone ? (
                <div className="notice success">
                  <CheckCheck size={19} />
                  <span>
                    Вы оценили все выступления.{" "}
                    {jury
                      ? event.status === "completed"
                        ? "Итоги уже доступны в разделе «Результаты»."
                        : "Результаты откроются после отправки остальных бланков."
                      : "Спасибо за участие в чемпионате!"}
                  </span>
                </div>
              ) : (
                <div className="notice info">
                  <CircleHelp size={18} />
                  <span>
                    Выберите выступление и заполните бланк.{" "}
                    {jury
                      ? "Ваши оценки составляют экспертную часть результата."
                      : "Своё выступление оценивать не нужно."}
                  </span>
                </div>
              )}
              <div className="section-heading">
                <div>
                  <h2>
                    Участники чемпионата <span className="count-pill">4</span>
                  </h2>
                  <p>
                    У каждой идеи есть автор. У каждого выступления — ваш
                    взгляд.
                  </p>
                </div>
                <span className="small-muted">
                  {event.status === "draft"
                    ? "Ожидаем старта"
                    : "Оценивайте в любом порядке"}
                </span>
              </div>
              <div className="participant-grid">
                {members
                  .filter((m) => m.role === "participant")
                  .map((member, i) => {
                    const self = viewer.id === member.id;
                    const ballot = ballots.find(
                      (b) => b.target_id === member.id,
                    );
                    const disabled = self || event.status === "draft";
                    return (
                      <article
                        className={`participant-card ${self ? "self-card" : ""}`}
                        key={member.id}
                      >
                        <div className={`participant-art art-${i}`}>
                          <span className="presentation-number">
                            ВЫСТУПЛЕНИЕ 0{i + 1}
                          </span>
                          <div className="abstract-shape shape-a" />
                          <div className="abstract-shape shape-b" />
                          <div className="abstract-shape shape-c" />
                          <span className="art-symbol" aria-hidden="true">
                            {i === 0 ? (
                              <Asterisk />
                            ) : i === 1 ? (
                              <ArrowUpRight />
                            ) : i === 2 ? (
                              <Sparkle />
                            ) : (
                              <span className="half-circle" />
                            )}
                          </span>
                          <span className="art-caption">
                            {
                              [
                                "Внимание к деталям",
                                "Смелость решений",
                                "Сила идеи",
                                "Простота формы",
                              ][i]
                            }
                          </span>
                        </div>
                        <div className="participant-body">
                          <div className="participant-identity">
                            <span className={`avatar avatar-${i}`}>
                              {initials(member.name)}
                            </span>
                            <div>
                              <h3>{member.name}</h3>
                              <span>
                                {self
                                  ? "Это ваше выступление"
                                  : `Участник ${i + 1}`}
                              </span>
                            </div>
                          </div>
                          <div className="participant-status">
                            {self ? (
                              <span className="small-muted">
                                <Users size={14} /> Оценивают другие участники
                              </span>
                            ) : ballot ? (
                              <span className="success-text">
                                <CheckCheck size={15} /> Бланк отправлен
                              </span>
                            ) : (
                              <span className="small-muted">
                                <Clock3 size={14} />{" "}
                                {event.status === "draft"
                                  ? "Скоро начнём"
                                  : "Ждёт вашей оценки"}
                              </span>
                            )}
                          </div>
                          <button
                            className={`button full ${ballot ? "secondary" : "primary"}`}
                            disabled={disabled}
                            onClick={() => setSelected(member)}
                          >
                            {self ? (
                              <>
                                <LockKeyhole size={16} /> Ваше выступление
                              </>
                            ) : ballot ? (
                              <>
                                <Eye size={17} /> Посмотреть бланк
                              </>
                            ) : (
                              <>
                                Оценить выступление <ArrowRight size={17} />
                              </>
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              {jury && (
                <section className="panel jury-progress">
                  <div className="stat-icon purple">
                    <AudioLines size={23} />
                  </div>
                  <div>
                    <h3>Общий прогресс голосования</h3>
                    <p>
                      Результаты откроются, когда будут отправлены все 20
                      бланков.
                    </p>
                  </div>
                  <div className="jury-progress-value">
                    <strong>
                      {submitted ?? 0}
                      <span> / 20</span>
                    </strong>
                    <div className="progress-track">
                      <div style={{ width: `${(submitted ?? 0) * 5}%` }} />
                    </div>
                  </div>
                  <button
                    className="button secondary small"
                    onClick={() => nav("results")}
                  >
                    {event.status === "completed"
                      ? "К результатам"
                      : "Результаты"}
                    {event.status === "completed" ? (
                      <ArrowRight size={15} />
                    ) : (
                      <LockKeyhole size={14} />
                    )}
                  </button>
                </section>
              )}
            </>
          )}

          {tab === "rules" && (
            <div className="rules-layout">
              <section className="panel rules-criteria">
                <div className="panel-heading">
                  <div>
                    <h2>Шесть сторон хорошего решения</h2>
                    <p>Каждый критерий оценивается целым числом от 1 до 5.</p>
                  </div>
                  <Sparkles size={24} />
                </div>
                {CRITERIA.map((c, i) => (
                  <div className="rule-row" key={c.id}>
                    <span className="rule-number">0{i + 1}</span>
                    <div>
                      <strong>{c.name}</strong>
                      <p>{c.description}</p>
                    </div>
                    <span className={`weight weight-${c.weight}`}>
                      ×{c.weight}
                    </span>
                  </div>
                ))}
              </section>
              <div>
                <section className="panel formula-panel">
                  <span className="section-icon">
                    <Trophy size={24} />
                  </span>
                  <h3>Как выбирается победитель</h3>
                  <p>
                    Сначала считаем сумму оценок с весами критериев. Один бланк
                    — от 12 до 60 баллов.
                  </p>
                  <div className="formula-line">
                    <strong>70%</strong>
                    <span>среднего балла двух жюри</span>
                  </div>
                  <span className="formula-plus">+</span>
                  <div className="formula-line">
                    <strong>30%</strong>
                    <span>среднего балла трёх участников</span>
                  </div>
                  <p className="notice">
                    При равенстве итогов выше участник с большим баллом жюри.
                    Если он тоже одинаковый — общее место.
                  </p>
                </section>
                <section className="panel rules-note">
                  <ShieldCheck size={23} />
                  <h3>Несколько важных правил</h3>
                  <ul>
                    <li>Каждый участник оценивает всех, кроме себя.</li>
                    <li>Отправленный бланк нельзя изменить.</li>
                    <li>Чужие бланки и авторы оценок скрыты.</li>
                    <li>Итоги доступны только жюри после всех 20 бланков.</li>
                  </ul>
                </section>
              </div>
            </div>
          )}

          {tab === "results" &&
            jury &&
            (results ? (
              <>
                <section className="result-banner">
                  <span className="winner-icon">
                    <Trophy size={34} />
                  </span>
                  <div>
                    <span className="eyebrow">ЧЕМПИОНАТ ЗАВЕРШЁН</span>
                    <h2>
                      {results
                        .filter((r) => r.rank === 1)
                        .map((r) => r.name)
                        .join(" и ")}
                    </h2>
                    <p>
                      {results.filter((r) => r.rank === 1).length > 1
                        ? "Разделяют первое место. Поздравляем!"
                        : "Первое место. Поздравляем с отличным результатом!"}
                    </p>
                  </div>
                  <span className="winner-score">
                    {formatScore(results[0].total)}
                    <small>из 60 баллов</small>
                  </span>
                </section>
                <section className="panel results-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Итоговый рейтинг</h2>
                      <p>Учтены все 20 бланков. Авторы оценок скрыты.</p>
                    </div>
                    <span className="status completed">
                      <i />
                      Все оценки получены
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Место</th>
                          <th>Участник</th>
                          <th>
                            Жюри <span>70%</span>
                          </th>
                          <th>
                            Участники <span>30%</span>
                          </th>
                          <th>
                            Итог <ArrowDown size={12} />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <span className={`rank rank-${r.rank}`}>
                                {r.rank === 1 ? <Medal size={19} /> : r.rank}
                              </span>
                            </td>
                            <td>
                              <strong>{r.name}</strong>
                            </td>
                            <td>
                              {formatScore(r.jury)}
                              <small>вклад {formatScore(r.jury * 0.7)}</small>
                            </td>
                            <td>
                              {formatScore(r.peers)}
                              <small>вклад {formatScore(r.peers * 0.3)}</small>
                            </td>
                            <td className="total-score">
                              {formatScore(r.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="table-note">
                    Баллы на экране округлены до сотых. Места рассчитаны по
                    точным значениям с учётом балла жюри при равенстве.
                  </p>
                </section>
                <div className="next-event">
                  <div>
                    <h3>Хорошие идеи не заканчиваются</h3>
                    <p>
                      Можно провести новый чемпионат. Текущие результаты
                      сохранятся и останутся доступны по прежним кодам жюри.
                    </p>
                  </div>
                  <Link href="/setup" className="button secondary">
                    <Plus size={17} /> Новое мероприятие
                  </Link>
                </div>
              </>
            ) : (
              <section className="panel locked-results">
                <span className="locked-icon">
                  <LockKeyhole size={32} />
                </span>
                <span className="eyebrow muted">НЕМНОГО ТЕРПЕНИЯ</span>
                <h2>Каждое мнение должно быть услышано</h2>
                <p>
                  Рейтинг станет доступен после отправки всех бланков.
                  <br />
                  Пока можно продолжить оценку выступлений.
                </p>
                <strong>
                  {submitted ?? 0}
                  <span> / 20 бланков</span>
                </strong>
                <div className="progress-track">
                  <div style={{ width: `${(submitted ?? 0) * 5}%` }} />
                </div>
                <button className="button primary" onClick={() => nav("vote")}>
                  К выступлениям <ArrowRight size={17} />
                </button>
              </section>
            ))}

          {tab === "manage" && jury && event.status === "draft" && (
            <ManageEvent event={event} members={members} />
          )}
          <footer className="workspace-footer">
            <span>
              Сделано для хороших идей <span className="footer-sparkle">✦</span>
            </span>
            <span>
              <ShieldCheck size={14} /> Оцениваем идеи. Уважаем людей.
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <BallotDialog
          key={selected.id}
          target={selected}
          saved={ballots.find((b) => b.target_id === selected.id)}
          scores={drafts[selected.id] ?? [0, 0, 0, 0, 0, 0]}
          onScores={(value) =>
            setDrafts((prev) => ({ ...prev, [selected.id]: value }))
          }
          onClose={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
