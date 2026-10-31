import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { CreateEventForm } from "@/components/event-forms";
import {
  currentMember,
  db,
  eventFor,
  identity,
  membersFor,
} from "@/lib/server";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";
export default async function SetupPage() {
  const who = await identity();
  if (!who) redirect("/");
  const member = await currentMember();
  if ("memberId" in who && (!member || member.role !== "jury"))
    redirect("/dashboard");
  const event = member ? await eventFor(member.event_id) : null;
  if (event?.status === "open") redirect("/dashboard");
  if ("bootstrap" in who) {
    const { count, error } = await db()
      .from("events")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error("Не удалось проверить состояние настройки.");
    if (count !== 0)
      return (
        <main className="setup-page">
          <Brand />
          <div className="panel">
            <h1>Настройка уже выполнена</h1>
            <p>Войдите по личному коду жюри.</p>
            <form action={logoutAction}>
              <button className="button primary">Вернуться ко входу</button>
            </form>
          </div>
        </main>
      );
  }
  const members =
    member && event?.status === "completed"
      ? await membersFor(member.event_id)
      : undefined;
  return (
    <main className="setup-page">
      <header>
        <Brand />
        {member ? (
          <Link href="/dashboard" className="text-link">
            <ArrowLeft size={16} /> К мероприятию
          </Link>
        ) : (
          <form action={logoutAction}>
            <button className="text-link">Выйти</button>
          </form>
        )}
      </header>
      <div className="setup-heading">
        <span className="eyebrow muted">НАЧИНАЕМ С ХОРОШЕЙ КОМПАНИИ</span>
        <h1>
          {event?.status === "completed"
            ? "Новый кейс-чемпионат"
            : "Подготовим чемпионат"}
        </h1>
        <p>Четыре участника, два члена жюри и много хороших идей.</p>
      </div>
      <CreateEventForm
        existingDraft={event?.status === "draft"}
        members={members}
      />
    </main>
  );
}
