import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const sql = new PGlite();
type Fixture = {
  id: string;
  members: {
    id: string;
    name: string;
    role: string;
    position: number;
    code_hash: string;
  }[];
};
before(async () => {
  await sql.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  await sql.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261101000000_voter.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
beforeEach(async () => {
  await sql.exec(
    "truncate public.ballots, public.members, public.events, public.login_limits cascade",
  );
});
after(async () => {
  await sql.close();
});
async function create(actor: string | null = null): Promise<Fixture> {
  const id = randomUUID();
  const members = Array.from({ length: 6 }, (_, i) => ({
    id: randomUUID(),
    name: `Person ${i + 1}`,
    role: i < 4 ? "participant" : "jury",
    position: i,
    code_hash: createHash("sha256").update(randomUUID()).digest("hex"),
  }));
  await sql.query("select public.voter_create_event($1,$2,$3,$4)", [
    id,
    "Test championship",
    JSON.stringify(members),
    actor,
  ]);
  return { id, members };
}
const open = (e: Fixture) =>
  sql.query("select public.voter_start_event($1)", [e.members[4].id]);
const submit = (
  e: Fixture,
  voter: number,
  target: number,
  scores: unknown = [3, 3, 3, 3, 3, 3],
) =>
  sql.query("select public.voter_submit_ballot($1,$2,$3)", [
    e.members[voter].id,
    e.members[target].id,
    scores,
  ]);
const results = (e: Fixture, actor = 4) =>
  sql.query<{
    id: string;
    name: string;
    jury: string;
    peers: string;
    total: string;
    rank: number;
  }>("select * from public.voter_results($1)", [e.members[actor].id]);

test("draft setup is atomic, requires six people and jury permissions", async () => {
  const e = await create();
  await assert.rejects(
    () =>
      open({
        ...e,
        members: [
          e.members[0],
          e.members[1],
          e.members[2],
          e.members[3],
          e.members[0],
        ],
      }),
    /FORBIDDEN/,
  );
  await assert.rejects(() => submit(e, 0, 1), /VOTING_CLOSED/);
  await assert.rejects(() => create(null), /FORBIDDEN/);
  await assert.rejects(() => create(e.members[4].id), /EVENT_IN_PROGRESS/);
  await sql.query("select public.voter_update_draft($1,$2,$3)", [
    e.members[4].id,
    "New title",
    JSON.stringify(
      e.members.map((m) => ({ id: m.id, name: m.name + " updated" })),
    ),
  ]);
  const changed = await sql.query<{ title: string }>(
    "select title from public.events where id=$1",
    [e.id],
  );
  assert.equal(changed.rows[0].title, "New title");
  await open(e);
  await assert.rejects(
    () =>
      sql.query("select public.voter_update_draft($1,$2,$3)", [
        e.members[4].id,
        "changed",
        JSON.stringify(e.members),
      ]),
    /EVENT_LOCKED/,
  );
});
test("database rejects self-votes, jury targets and all malformed score arrays", async () => {
  const e = await create();
  await open(e);
  await assert.rejects(() => submit(e, 0, 0), /check constraint/);
  await assert.rejects(() => submit(e, 0, 4), /INVALID_TARGET/);
  for (const invalid of [
    [],
    [1, 2],
    [1, 2, 3, 4, 5, 0],
    [1, 2, 3, 4, 5, 6],
    [1, 2, 3, 4, 5, null],
    null,
  ])
    await assert.rejects(() => submit(e, 0, 1, invalid));
  const count = await sql.query<{ n: number }>(
    "select count(*)::int as n from public.ballots",
  );
  assert.equal(count.rows[0].n, 0);
});
test("concurrent duplicate submissions save exactly one immutable ballot", async () => {
  const e = await create();
  await open(e);
  const attempts = await Promise.allSettled([submit(e, 0, 1), submit(e, 0, 1)]);
  assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  await assert.rejects(
    () => sql.query("update public.ballots set scores=ARRAY[5,5,5,5,5,5]"),
    /BALLOT_IMMUTABLE/,
  );
  await assert.rejects(
    () => sql.query("delete from public.ballots"),
    /BALLOT_IMMUTABLE/,
  );
});
test("results stay locked until all 20 ballots; only jury can read aggregates", async () => {
  const e = await create();
  await open(e);
  await assert.rejects(() => results(e), /RESULTS_LOCKED/);
  let sent = 0;
  for (let voter = 0; voter < 6; voter++)
    for (let target = 0; target < 4; target++) {
      if (voter === target) continue;
      await submit(e, voter, target);
      sent++;
      if (sent === 19) {
        const state = await sql.query<{ status: string }>(
          "select status from public.events where id=$1",
          [e.id],
        );
        assert.equal(state.rows[0].status, "open");
        await assert.rejects(() => results(e), /RESULTS_LOCKED/);
      }
    }
  assert.equal(sent, 20);
  const state = await sql.query<{ status: string }>(
    "select status from public.events where id=$1",
    [e.id],
  );
  assert.equal(state.rows[0].status, "completed");
  const ranked = await results(e);
  assert.equal(ranked.rows.length, 4);
  assert.ok(
    ranked.rows.every((r) => Number(r.total) === 36 && Number(r.rank) === 1),
  );
  await assert.rejects(() => results(e, 0), /FORBIDDEN/);
  await assert.rejects(() => submit(e, 0, 1), /VOTING_CLOSED/);
  const next = await create(e.members[5].id);
  assert.notEqual(next.id, e.id);
  assert.equal((await results(e)).rows.length, 4);
});
test("exact 70/30 weighting, jury tiebreak and shared places", async () => {
  const e = await create();
  await open(e);
  for (let voter = 0; voter < 6; voter++)
    for (let target = 0; target < 4; target++) {
      if (voter === target) continue;
      const isJury = voter >= 4;
      const scores =
        target === 0
          ? isJury
            ? [3, 3, 3, 3, 3, 3]
            : [5, 5, 5, 5, 5, 5]
          : target < 3
            ? isJury
              ? [4, 4, 4, 4, 4, 4]
              : [2, 2, 3, 3, 4, 4]
            : [1, 1, 1, 1, 1, 1];
      await submit(e, voter, target, scores);
    }
  const rows = (await results(e)).rows;
  assert.deepEqual(
    rows.map((r) => Number(r.rank)),
    [1, 1, 3, 4],
  );
  assert.ok(rows.slice(0, 3).every((r) => Number(r.total) === 43.2));
  assert.equal(rows[0].id, e.members[1].id);
  assert.equal(Number(rows[0].jury), 48);
  assert.equal(Number(rows[2].jury), 36);
});
test("code rotation is restricted to jury and draft state", async () => {
  const e = await create();
  const updates = e.members.map((m) => ({
    id: m.id,
    code_hash: createHash("sha256").update(randomUUID()).digest("hex"),
  }));
  await assert.rejects(
    () =>
      sql.query("select public.voter_rotate_codes($1,$2)", [
        e.members[0].id,
        JSON.stringify(updates),
      ]),
    /FORBIDDEN/,
  );
  await sql.query("select public.voter_rotate_codes($1,$2)", [
    e.members[4].id,
    JSON.stringify(updates),
  ]);
  const hash = await sql.query<{ code_hash: string }>(
    "select code_hash from public.members where id=$1",
    [updates[0].id],
  );
  assert.equal(hash.rows[0].code_hash, updates[0].code_hash);
  await open(e);
  await assert.rejects(
    () =>
      sql.query("select public.voter_rotate_codes($1,$2)", [
        e.members[4].id,
        JSON.stringify(updates),
      ]),
    /EVENT_LOCKED/,
  );
});
test("public API roles cannot read tables or execute RPCs; server cannot bypass ballot RPC", async () => {
  const e = await create();
  await open(e);
  for (const role of ["anon", "authenticated"]) {
    await sql.exec(`set role ${role}`);
    try {
      await assert.rejects(
        () => sql.query("select * from public.ballots"),
        /permission denied/,
      );
      await assert.rejects(
        () => sql.query("select * from public.members"),
        /permission denied/,
      );
      await assert.rejects(
        () => sql.query("select public.voter_results($1)", [e.members[4].id]),
        /permission denied/,
      );
      await assert.rejects(() => submit(e, 0, 1), /permission denied/);
    } finally {
      await sql.exec("reset role");
    }
  }
  await sql.exec("set role service_role");
  try {
    await assert.rejects(
      () =>
        sql.query(
          "insert into public.ballots(event_id,voter_id,target_id,scores) values($1,$2,$3,ARRAY[3,3,3,3,3,3])",
          [e.id, e.members[0].id, e.members[1].id],
        ),
      /permission denied/,
    );
    await submit(e, 0, 1);
  } finally {
    await sql.exec("reset role");
  }
});
test("persistent login rate limit is atomic", async () => {
  const attempts = await Promise.all(
    Array.from({ length: 17 }, () =>
      sql.query<{ allowed: boolean }>(
        "select public.voter_login_attempt($1) as allowed",
        ["same-ip"],
      ),
    ),
  );
  assert.equal(attempts.filter((a) => a.rows[0].allowed).length, 15);
  const other = await sql.query<{ allowed: boolean }>(
    "select public.voter_login_attempt('other-ip') as allowed",
  );
  assert.equal(other.rows[0].allowed, true);
});
