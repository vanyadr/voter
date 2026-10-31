import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  SESSION_SECONDS,
  signSession,
  verifySession,
  type Identity,
} from "./crypto";
import type { Dashboard, Event, Member, OwnBallot, Result } from "./model";

export function configured() {
  return !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.APP_SECRET?.length ?? 0) >= 32 &&
    (process.env.BOOTSTRAP_CODE?.length ?? 0) >= 12
  );
}
export function secret() {
  if (!configured()) throw new Error("Приложение ещё не настроено.");
  return process.env.APP_SECRET!;
}
let client: SupabaseClient | undefined;
export function db() {
  if (!configured()) throw new Error("Приложение ещё не настроено.");
  return (client ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          }),
      },
    },
  ));
}
export async function identity(): Promise<Identity | null> {
  if (!configured()) return null;
  return verifySession((await cookies()).get(COOKIE_NAME)?.value, secret());
}
export async function setIdentity(value: Identity) {
  (await cookies()).set(COOKIE_NAME, signSession(value, secret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}
const MEMBER_FIELDS = "id,event_id,name,role,position";
export async function currentMember(): Promise<Member | null> {
  const who = await identity();
  if (!who || !("memberId" in who)) return null;
  const { data, error } = await db()
    .from("members")
    .select(MEMBER_FIELDS)
    .eq("id", who.memberId)
    .maybeSingle();
  if (error)
    throw new Error(
      "Не удалось подключиться к базе данных. Попробуйте ещё раз.",
    );
  return data as Member | null;
}
export async function requireMember() {
  const member = await currentMember();
  if (!member) redirect("/");
  return member;
}
export async function requireJury() {
  const member = await requireMember();
  if (member.role !== "jury")
    throw new Error("Это действие доступно только жюри.");
  return member;
}
export async function eventFor(id: string): Promise<Event> {
  const { data, error } = await db()
    .from("events")
    .select("id,title,status,created_at")
    .eq("id", id)
    .single();
  if (error) throw new Error("Не удалось загрузить мероприятие.");
  return data as Event;
}
export async function membersFor(eventId: string): Promise<Member[]> {
  const { data, error } = await db()
    .from("members")
    .select(MEMBER_FIELDS)
    .eq("event_id", eventId)
    .order("position");
  if (error) throw new Error("Не удалось загрузить участников.");
  return data as Member[];
}
export async function loadDashboard(viewer: Member): Promise<Dashboard> {
  const [event, members, own] = await Promise.all([
    eventFor(viewer.event_id),
    membersFor(viewer.event_id),
    db()
      .from("ballots")
      .select("target_id,scores,weighted_total")
      .eq("voter_id", viewer.id),
  ]);
  if (own.error) throw new Error("Не удалось загрузить бланки.");
  let submitted: number | null = null;
  let results: Result[] | null = null;
  if (viewer.role === "jury") {
    const count = await db()
      .from("ballots")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    if (count.error) throw new Error("Не удалось загрузить прогресс.");
    submitted = count.count ?? 0;
    if (event.status === "completed") {
      const ranked = await db().rpc("voter_results", { p_actor: viewer.id });
      if (ranked.error) throw new Error("Не удалось загрузить результаты.");
      results = (ranked.data ?? []).map((r: Result) => ({
        ...r,
        jury: Number(r.jury),
        peers: Number(r.peers),
        total: Number(r.total),
        rank: Number(r.rank),
      }));
    }
  }
  return {
    event,
    viewer,
    members,
    ballots: own.data as OwnBallot[],
    submitted,
    results,
  };
}

export function publicError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("duplicate key"))
    return "Этот бланк уже отправлен. Обновите страницу.";
  if (/EVENT_LOCKED|VOTING_CLOSED/.test(message))
    return "Голосование ещё не открыто или уже завершено. Обновите страницу.";
  if (message.includes("EVENT_IN_PROGRESS"))
    return "Сначала завершите текущее мероприятие.";
  if (/FORBIDDEN|INVALID_TARGET/.test(message))
    return "Недостаточно прав для этого действия.";
  return "Не удалось сохранить данные. Проверьте соединение и попробуйте ещё раз.";
}
