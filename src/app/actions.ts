"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  generateCode,
  hashCode,
  hashValue,
  normalizeCode,
  safeEqual,
} from "@/lib/crypto";
import {
  currentMember,
  db,
  identity,
  membersFor,
  publicError,
  requireJury,
  requireMember,
  secret,
  setIdentity,
} from "@/lib/server";
import { validScores, type AccessCode, type ActionResult } from "@/lib/model";
import { databaseFailure, loginDiagnostic } from "@/lib/connection";

export async function loginAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const code = String(form.get("code") ?? "");
  if (code.length > 100 || normalizeCode(code).length < 12)
    return {
      error: "Проверьте код: он должен содержать не менее 12 символов.",
    };
  let destination = "/dashboard";
  let stage = "rate_limit";
  try {
    const h = await headers();
    // Vercel overwrites this header; other hosts share a conservative fallback bucket.
    const ip =
      h.get("x-vercel-forwarded-for")?.split(",")[0].trim() ?? "shared";
    const attempt = await db().rpc("voter_login_attempt", {
      p_key: hashValue(`login:${ip}`, secret()),
    });
    if (attempt.error) throw databaseFailure(attempt.error, attempt.status);
    if (!attempt.data)
      return { error: "Слишком много попыток. Повторите через 15 минут." };
    const candidate = hashCode(code, secret());
    if (safeEqual(candidate, hashCode(process.env.BOOTSTRAP_CODE!, secret()))) {
      stage = "bootstrap_lookup";
      const { count, error, status } = await db()
        .from("events")
        .select("id", { count: "exact", head: true });
      if (error) throw databaseFailure(error, status);
      if (count === null) throw new Error("Missing event count");
      if (count !== 0)
        return {
          error: "Первичная настройка уже выполнена. Используйте личный код.",
        };
      stage = "session";
      await setIdentity({ bootstrap: true });
      destination = "/setup";
    } else {
      stage = "member_lookup";
      const { data, error, status } = await db()
        .from("members")
        .select("id")
        .eq("code_hash", candidate)
        .maybeSingle();
      if (error) throw databaseFailure(error, status);
      if (!data)
        return { error: "Код не найден. Проверьте его или обратитесь к жюри." };
      stage = "session";
      await setIdentity({ memberId: data.id });
    }
  } catch (error) {
    const diagnostic = loginDiagnostic(error);
    console.error("[voter.login]", {
      stage,
      category: diagnostic.category,
      upstreamCode: diagnostic.upstreamCode,
      status: diagnostic.status,
    });
    return { error: diagnostic.message };
  }
  redirect(destination);
}
export async function logoutAction() {
  (await cookies()).delete(COOKIE_NAME);
  redirect("/");
}

function eventInput(form: FormData) {
  const title = String(form.get("title") ?? "").trim();
  const names = Array.from({ length: 6 }, (_, i) =>
    String(form.get(`name-${i}`) ?? "").trim(),
  );
  if (!title || title.length > 100 || names.some((n) => !n || n.length > 60))
    return { error: "Укажите название и имена всех шести человек." };
  if (new Set(names.map((n) => n.toLocaleLowerCase("ru"))).size !== 6)
    return {
      error: "Имена должны различаться. Добавьте фамилию или инициалы.",
    };
  return { title, names };
}
export async function createEventAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const input = eventInput(form);
  if ("error" in input) return { error: input.error };
  const who = await identity();
  if (!who)
    return { error: "Войдите по коду жюри или коду первичной настройки." };
  const actor = "memberId" in who ? await currentMember() : null;
  if (actor && actor.role !== "jury")
    return { error: "Создавать мероприятие могут только жюри." };
  if ("memberId" in who && !actor)
    return { error: "Сессия недействительна. Войдите ещё раз." };
  const eventId = randomUUID();
  const codes: AccessCode[] = input.names.map((name, i) => ({
    id: randomUUID(),
    name,
    role: i < 4 ? "participant" : "jury",
    code: generateCode(),
  }));
  try {
    const { error } = await db().rpc("voter_create_event", {
      p_event_id: eventId,
      p_title: input.title,
      p_actor: actor?.id ?? null,
      p_members: codes.map((c, position) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        position,
        code_hash: hashCode(c.code, secret()),
      })),
    });
    if (error) throw error;
    await setIdentity({ memberId: codes[4].id });
  } catch (e) {
    return { error: publicError(e) };
  }
  return { ok: true, codes };
}
export async function updateDraftAction(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const input = eventInput(form);
  if ("error" in input) return { error: input.error };
  const actor = await requireJury();
  try {
    const members = await membersFor(actor.event_id);
    const { error } = await db().rpc("voter_update_draft", {
      p_actor: actor.id,
      p_title: input.title,
      p_names: members.map((m, i) => ({ id: m.id, name: input.names[i] })),
    });
    if (error) throw error;
  } catch (e) {
    return { error: publicError(e) };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
export async function rotateCodesAction(): Promise<ActionResult> {
  const actor = await requireJury();
  try {
    const members = await membersFor(actor.event_id);
    const codes = members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      code: generateCode(),
    }));
    const { error } = await db().rpc("voter_rotate_codes", {
      p_actor: actor.id,
      p_codes: codes.map((c) => ({
        id: c.id,
        code_hash: hashCode(c.code, secret()),
      })),
    });
    if (error) throw error;
    return { ok: true, codes };
  } catch (e) {
    return { error: publicError(e) };
  }
}
export async function startEventAction(): Promise<ActionResult> {
  const actor = await requireJury();
  try {
    const { error } = await db().rpc("voter_start_event", {
      p_actor: actor.id,
    });
    if (error) throw error;
  } catch (e) {
    return { error: publicError(e) };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
export async function submitBallotAction(
  targetId: string,
  scores: number[],
): Promise<ActionResult> {
  if (!validScores(scores))
    return { error: "Оцените все шесть критериев целыми числами от 1 до 5." };
  if (!/^[a-f0-9-]{36}$/i.test(targetId))
    return { error: "Некорректный участник." };
  const actor = await requireMember();
  if (actor.id === targetId)
    return { error: "Нельзя оценивать собственное выступление." };
  try {
    const { error } = await db().rpc("voter_submit_ballot", {
      p_voter_id: actor.id,
      p_target_id: targetId,
      p_scores: scores,
    });
    if (error) throw error;
  } catch (e) {
    return { error: publicError(e) };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
