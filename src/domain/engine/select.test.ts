import { describe, expect, it } from "vite-plus/test";
import { SKILL_VALUE } from "../types.ts";
import type { Court, Session, SkillLevel } from "../types.ts";
import { fill } from "./operations.ts";
import { createRng, randomInt } from "./rng.ts";
import {
  balanceOf,
  bestSplitOf,
  domOf,
  fairSets,
  isAllowed,
  lineupPlayerIds,
  makeEnv,
  mixOf,
  owes,
  pickDifferentLineup,
  pickLineup,
  pickSwapLineup,
  rehashBlockReason,
  replaceInLineup,
  restCut,
  restKey,
  restsTier,
  type Env,
} from "./select.ts";
import type { PlayerHistory } from "./stats.ts";
import { MIN, T0, lineupSet, makeCtx, match, player, playersNamed, session } from "./test-utils.ts";

const seedList = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

interface Spec {
  streak?: number;
  recent?: number;
  total?: number;
  rests?: number;
  wait?: number;
  skill?: SkillLevel;
}

/** Hand-made Env: per-player numbers and a table of past meetings, no Session needed. */
function fakeEnv(
  specs: Record<string, Spec>,
  options: { met?: Record<string, number>; restsLimit?: number; seed?: number } = {},
): Env {
  const byPlayer = new Map<string, PlayerHistory>(
    Object.entries(specs).map(([id, spec]) => [
      id,
      {
        streak: spec.streak ?? 0,
        recent: spec.recent ?? 0,
        total: spec.total ?? 0,
        played: spec.total ?? 0,
        rests: spec.rests ?? 0,
        wait: spec.wait ?? 0,
      },
    ]),
  );
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  return {
    history: {
      byPlayer,
      partnered: () => 0,
      met: (a, b) => options.met?.[key(a, b)] ?? options.met?.[key(b, a)] ?? 0,
    },
    skill: new Map(
      Object.entries(specs).map(([id, spec]) => [id, SKILL_VALUE[spec.skill ?? "intermediate"]]),
    ),
    rng: createRng(options.seed ?? 1),
    restsLimit: options.restsLimit ?? 2,
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const specsFor = (names: string[], spec: Spec = {}) =>
  Object.fromEntries(names.map((id) => [id, { ...spec }]));

// ------------------------------------------------------------------------ owes

describe("owes (≻)", () => {
  const env = fakeEnv({
    a: { recent: 0, total: 0 },
    b: { recent: 1, total: 0 },
    c: { recent: 2, total: 0 },
    d: { recent: 0, total: 2 },
    e: { recent: 0, total: 1 },
    f: { recent: 1, total: 3 },
    g: { recent: 2, total: 5 },
    h: { recent: 0, total: 10 },
    k: { recent: 3, total: 0 },
  });

  it("truth table", () => {
    const table: [string, string, boolean][] = [
      // 2+ fewer in the window
      ["a", "c", true],
      ["b", "k", true],
      // only one fewer in the window, same total
      ["a", "b", false],
      ["b", "c", false],
      // same window, 2+ fewer overall
      ["a", "d", true],
      // same window, only one fewer overall
      ["a", "e", false],
      // fewer in the window and 2+ fewer overall
      ["f", "g", true],
      // never owed for being more recent, however low the total
      ["k", "d", false],
      ["b", "d", false],
      // fewer overall but more in the window
      ["b", "h", false],
      // the other direction of the pairs above
      ["c", "a", false],
      ["d", "a", false],
      ["g", "f", false],
    ];
    for (const [x, c, expected] of table) expect([x, c, owes(env, x, c)]).toEqual([x, c, expected]);
  });

  it("is a strict partial order (random property test)", () => {
    for (const seed of seedList(20)) {
      const rng = createRng(seed);
      const names = ids(24);
      const e = fakeEnv(
        Object.fromEntries(
          names.map((id) => [id, { recent: randomInt(rng, 5), total: randomInt(rng, 9) }]),
        ),
      );
      for (const x of names) {
        expect(owes(e, x, x)).toBe(false);
        for (const c of names) {
          if (owes(e, x, c)) {
            // asymmetric, and sorting by (recent, total) never puts c ahead of x
            expect(owes(e, c, x)).toBe(false);
            const hx = e.history.byPlayer.get(x)!;
            const hc = e.history.byPlayer.get(c)!;
            expect(hx.recent < hc.recent || (hx.recent === hc.recent && hx.total < hc.total)).toBe(
              true,
            );
            for (const z of names) if (owes(e, c, z)) expect(owes(e, x, z)).toBe(true);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------- restCut

describe("restCut", () => {
  it("takes whole better Rest groups and leaves the cut group as the field", () => {
    const env = fakeEnv({
      ...specsFor(["p1", "p2", "p3"], { streak: 0 }),
      ...specsFor(["p4", "p5", "p6"], { streak: 2 }),
      ...specsFor(["p7"], { streak: 3 }),
    });
    const cut = restCut(ids(7), 4, env);
    expect(cut.inn.sort()).toEqual(["p1", "p2", "p3"]);
    expect(cut.field.sort()).toEqual(["p4", "p5", "p6"]);
    expect(cut.slots).toBe(1);
    expect(restKey(env, "p4")).toBe(1);
    expect(restKey(env, "p7")).toBe(2);
  });

  it("a Streak of 1 is not rested", () => {
    const env = fakeEnv(specsFor(ids(5), { streak: 1 }));
    expect(restKey(env, "p1")).toBe(0);
    expect(restCut(ids(5), 4, env)).toMatchObject({ inn: [], slots: 4 });
  });

  it("splits the cut Rest group by Rests in a row, highest first", () => {
    const env = fakeEnv(
      {
        p1: { rests: 4 },
        p2: { rests: 2 },
        p3: { rests: 1 },
        p4: { rests: 0 },
        p5: { rests: 0 },
        p6: { rests: 1 },
      },
      { restsLimit: 2 },
    );
    expect([1, 2, 3].map((n) => restsTier(env, `p${n}`))).toEqual([3, 1, 0]);
    const cut = restCut(ids(6), 4, env);
    expect(cut.inn.sort()).toEqual(["p1", "p2"]);
    expect(cut.field.sort()).toEqual(["p3", "p4", "p5", "p6"]);
    expect(cut.slots).toBe(2);
  });

  it("applies Rest before Rests in a row", () => {
    const env = fakeEnv({
      p1: { streak: 2, rests: 9 },
      ...specsFor(["p2", "p3", "p4", "p5"], { rests: 0 }),
    });
    const cut = restCut(ids(5), 4, env);
    expect([...cut.inn, ...cut.field]).not.toContain("p1");
  });

  it("uses a limit of 2 × Courts from the Session", () => {
    const base = session({
      players: playersNamed(6),
      courts: 2,
      matches: [1, 2, 3, 4, 5].map((n) =>
        match({
          id: `m${n}`,
          teams: [
            ["p1", "p2"],
            ["p3", "p4"],
          ],
          startedAt: T0 - (60 - n * 10) * MIN,
          endedAt: T0 - (55 - n * 10) * MIN,
          freeAtStart: ["p5"],
        }),
      ),
    });
    const two = makeEnv(base, makeCtx());
    expect(two.restsLimit).toBe(4);
    expect(restsTier(two, "p5")).toBe(2); // 5 rests − 4 + 1
    const one = makeEnv({ ...base, courts: base.courts.slice(0, 1) }, makeCtx());
    expect(one.restsLimit).toBe(2);
    expect(restsTier(one, "p5")).toBe(4);
    expect(restsTier(one, "p6")).toBe(0);
  });
});

// --------------------------------------------------------------------- fairSets

describe("fairSets and the single score", () => {
  it("only offers sets where nobody is left out for someone they are owed a place behind", () => {
    for (const seed of seedList(60)) {
      const rng = createRng(seed);
      const names = ids(5 + randomInt(rng, 8));
      const env = fakeEnv(
        Object.fromEntries(
          names.map((id) => [id, { recent: randomInt(rng, 4), total: randomInt(rng, 7) }]),
        ),
        { seed },
      );
      const sets = fairSets(names, env);
      expect(sets.length).toBeGreaterThan(0);
      for (const set of sets) {
        expect(new Set(set).size).toBe(4);
        for (const c of set) {
          for (const x of names.filter((id) => !set.includes(id))) {
            expect(owes(env, x, c)).toBe(false);
          }
        }
      }
    }
  });

  it("still includes everyone owed a place before its players with more than 12 Candidates", () => {
    for (const seed of seedList(40)) {
      const rng = createRng(seed);
      const names = ids(13 + randomInt(rng, 30));
      const env = fakeEnv(
        Object.fromEntries(
          names.map((id) => [
            id,
            { recent: randomInt(rng, 4), total: randomInt(rng, 9), wait: randomInt(rng, 100) },
          ]),
        ),
        { seed },
      );
      const sets = fairSets(names, env);
      expect(sets.length).toBeGreaterThan(0);
      for (const set of sets) {
        const chosen = new Set(set);
        expect(isAllowed(domOf(names, env), chosen)).toBe(true);
      }
    }
  });

  it("applies Rest first in the random histories, then Rests in a row, then the ≻ rule", () => {
    for (const seed of seedList(300)) {
      const rng = createRng(seed * 13);
      const count = 6 + randomInt(rng, 9);
      const players = playersNamed(count);
      const total = 4 + randomInt(rng, 8);
      const matches = Array.from({ length: total }, (_, i) => {
        const order = [...players.map((p) => p.id)].sort(() => rng() - 0.5);
        const four = order.slice(0, 4);
        return match({
          id: `m${i}`,
          teams: [
            [four[0]!, four[1]!],
            [four[2]!, four[3]!],
          ],
          startedAt: T0 - (total - i) * 8 * MIN,
          endedAt: T0 - (total - i) * 8 * MIN + 6 * MIN,
          freeAtStart: order.slice(4).filter(() => rng() < 0.9),
        });
      });
      const s = session({ players, matches });
      const ctx = makeCtx(seed);
      const filled = fill(s, ctx);
      const chosen = lineupSet(filled, 1);
      expect(chosen).toHaveLength(4);
      const env = makeEnv(s, makeCtx(seed));
      for (const c of chosen) {
        for (const x of players.map((p) => p.id).filter((id) => !chosen.includes(id))) {
          expect(restKey(env, x) < restKey(env, c)).toBe(false);
          if (restKey(env, x) === restKey(env, c)) {
            expect(restsTier(env, x) > restsTier(env, c)).toBe(false);
            if (restsTier(env, x) === restsTier(env, c)) expect(owes(env, x, c)).toBe(false);
          }
        }
      }
    }
  });

  it("picks a player whose Rests in a row reached the limit over a better-mixed set", () => {
    const names = ids(6);
    // p6 has met everybody many times; without the limit the best-mixed four leaves p6 out.
    const met = Object.fromEntries(names.filter((n) => n !== "p6").map((n) => [`${n}|p6`, 5]));
    const below = fakeEnv(specsFor(names, {}), { met });
    below.history.byPlayer.get("p6")!.rests = 1;
    expect(bestSplitOf(fairSets(names, below), below)!.teams.flat()).not.toContain("p6");

    const at = fakeEnv(specsFor(names, {}), { met });
    at.history.byPlayer.get("p6")!.rests = 2; // = limit → tier 1
    expect(fairSets(names, at).every((set) => set.includes("p6"))).toBe(true);
    for (const seed of seedList(10)) {
      const env = fakeEnv({ ...specsFor(names, {}), p6: { rests: 2 } }, { met, seed });
      expect(bestSplitOf(fairSets(names, env), env)!.teams.flat()).toContain("p6");
    }
  });

  it("lets a split that can be balanced outrank Mixing", () => {
    const env = fakeEnv(
      {
        a1: { skill: "advanced" },
        a2: { skill: "advanced" },
        a3: { skill: "advanced" },
        b1: { skill: "beginner" },
        b2: { skill: "beginner" },
        b3: { skill: "beginner" },
      },
      // the unbalanceable set {a1,a2,a3,b1} has never met; the balanceable {a1,a2,b1,b2} has
      { met: { "a1|a2": 3, "a1|b1": 3, "a1|b2": 3, "a2|b1": 3, "a2|b2": 3, "b1|b2": 3 } },
    );
    const unbalanceable = ["a1", "a2", "a3", "b1"];
    const balanceable = ["a1", "a2", "b1", "b2"];
    expect(mixOf(env, unbalanceable)).toBeLessThan(mixOf(env, balanceable));
    const best = bestSplitOf([unbalanceable, balanceable], env)!;
    expect(best.teams.flat().sort()).toEqual(balanceable);
    for (const team of best.teams) expect(team.filter((id) => id.startsWith("a"))).toHaveLength(1);
  });

  it("prefers fewer past meetings among level players, then the exact counts, then Wait", () => {
    const names = ids(5);
    const mixEnv = fakeEnv(specsFor(names, {}), { met: { "p1|p2": 4, "p1|p3": 4 } });
    // p1 is the one that has met others: the best-mixed four leaves p1 out
    expect(bestSplitOf(fairSets(names, mixEnv), mixEnv)!.teams.flat()).not.toContain("p1");

    const counts = fakeEnv({
      ...specsFor(names, {}),
      p3: { recent: 1, total: 1 },
    });
    // p3 is level with the rest (one match) but has the larger exact counts
    expect(bestSplitOf(fairSets(names, counts), counts)!.teams.flat()).not.toContain("p3");

    const wait = fakeEnv({
      p1: { wait: 10 * MIN },
      p2: { wait: 50 * MIN },
      p3: { wait: 40 * MIN },
      p4: { wait: 30 * MIN },
      p5: { wait: 20 * MIN },
    });
    expect(bestSplitOf(fairSets(names, wait), wait)!.teams.flat().sort()).toEqual([
      "p2",
      "p3",
      "p4",
      "p5",
    ]);
  });
});

describe("latecomer", () => {
  it("is in the first Lineup after joining", () => {
    const veterans = ids(8).map((id) => player(id, "intermediate", T0 - 120 * MIN));
    const a: [[string, string], [string, string]] = [
      ["p1", "p2"],
      ["p3", "p4"],
    ];
    const b: [[string, string], [string, string]] = [
      ["p5", "p6"],
      ["p7", "p8"],
    ];
    // Everybody has played exactly 2 Matches, none of them recently.
    const matches = [
      { id: "q0", teams: a, at: 100, free: ["p5", "p6", "p7", "p8"] },
      { id: "q1", teams: b, at: 95, free: ["p1", "p2", "p3", "p4"] },
      { id: "q2", teams: a, at: 60, free: ["p5", "p6", "p7", "p8"] },
      { id: "q3", teams: b, at: 55, free: ["p1", "p2", "p3", "p4"] },
    ].map((m) =>
      match({
        id: m.id,
        teams: m.teams,
        startedAt: T0 - m.at * MIN,
        endedAt: T0 - (m.at - 5) * MIN,
        freeAtStart: m.free,
      }),
    );
    const s = session({ players: [...veterans, player("late", "intermediate", T0)], matches });
    for (const seed of seedList(20)) {
      expect(lineupSet(fill(s, makeCtx(seed)), 1)).toContain("late");
    }
  });

  it("is not picked over players with 0 recent Matches at (1 recent, a low total) when Mixing ties", () => {
    const names = ["late", "p1", "p2", "p3", "p4", "p5"];
    for (const seed of seedList(20)) {
      const env = fakeEnv(
        {
          late: { recent: 1, total: 1 },
          ...specsFor(["p1", "p2", "p3", "p4", "p5"], { recent: 0, total: 5 }),
        },
        { seed },
      );
      expect(fairSets(names, env).some((set) => set.includes("late"))).toBe(true);
      const best = bestSplitOf(fairSets(names, env), env)!;
      expect(best.teams.flat()).not.toContain("late");
    }
  });
});

// -------------------------------------------------------------- 8 players, 1 Court

describe("8 players on 1 Court", () => {
  it("mixes the two groups: the third Lineup has exactly 2 players from each", () => {
    const first: [[string, string], [string, string]] = [
      ["p1", "p2"],
      ["p3", "p4"],
    ];
    const second: [[string, string], [string, string]] = [
      ["p5", "p6"],
      ["p7", "p8"],
    ];
    const s = session({
      players: playersNamed(8),
      matches: [
        match({
          id: "r1",
          teams: first,
          startedAt: T0 - 30 * MIN,
          endedAt: T0 - 15 * MIN,
          freeAtStart: ["p5", "p6", "p7", "p8"],
        }),
        match({
          id: "r2",
          teams: second,
          startedAt: T0 - 15 * MIN,
          endedAt: T0,
          freeAtStart: ["p1", "p2", "p3", "p4"],
        }),
      ],
    });
    for (const seed of seedList(30)) {
      const picked = lineupSet(fill(s, makeCtx(seed)), 1);
      expect(picked.filter((id) => ["p1", "p2", "p3", "p4"].includes(id))).toHaveLength(2);
      expect(picked.filter((id) => ["p5", "p6", "p7", "p8"].includes(id))).toHaveLength(2);
    }
  });
});

// ------------------------------------------------------------- replaceInLineup

describe("replaceInLineup", () => {
  const base = (players: string[]): { s: Session; court: Court } => {
    const s = session({ players: players.map((id) => player(id)) });
    const court: Court = {
      ...s.courts[0]!,
      lineup: {
        teams: [
          ["p1", "p2"],
          ["p3", "p4"],
        ],
      },
    };
    return { s: { ...s, courts: [court] }, court };
  };

  it("picks the level Candidate with the fewest meetings with the three who stay", () => {
    const { s, court } = base(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
    for (const seed of seedList(20)) {
      const env = fakeEnv(specsFor(ids(7), { recent: 0, total: 4 }), {
        seed,
        met: {
          "p1|p5": 3,
          "p2|p5": 3,
          "p3|p5": 3,
          "p1|p6": 1,
          "p2|p6": 0,
          "p3|p6": 0,
          "p1|p7": 2,
          "p2|p7": 2,
          "p3|p7": 1,
          // p4 is leaving: its meetings must not count
          "p4|p6": 9,
        },
      });
      const lineup = replaceInLineup(s, court, "p4", env)!;
      expect(lineupPlayerIds(lineup).sort()).toEqual(["p1", "p2", "p3", "p6"]);
    }
  });

  it("never picks someone that another Candidate is owed a place before", () => {
    const { s, court } = base(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
    for (const seed of seedList(20)) {
      const env = fakeEnv(
        {
          ...specsFor(ids(4), { recent: 0, total: 4 }),
          p5: { recent: 0, total: 4 },
          p6: { recent: 0, total: 5 },
          // p7 has the fewest meetings but p5 and p6 each played 2+ fewer recent Matches
          p7: { recent: 2, total: 6 },
        },
        { seed, met: { "p1|p5": 2, "p1|p6": 1 } },
      );
      const picked = lineupPlayerIds(replaceInLineup(s, court, "p4", env)!).sort();
      expect(picked).not.toContain("p7");
      expect(picked).toContain("p6");
    }
  });

  it("is null when nobody is left", () => {
    const { s, court } = base(["p1", "p2", "p3", "p4"]);
    expect(replaceInLineup(s, court, "p4", fakeEnv(specsFor(ids(4))))).toBeNull();
  });
});

// ---------------------------------------------------------------------- rehash

/** A one-Court Session whose Court already holds p1–p4 as [p1,p2] vs [p3,p4], with `count` players. */
function courtWithLineup(count: number, skills: Partial<Record<string, SkillLevel>> = {}) {
  const players = ids(count).map((id) => player(id, skills[id] ?? "intermediate"));
  const s0 = session({ players });
  const court: Court = {
    ...s0.courts[0]!,
    lineup: {
      teams: [
        ["p1", "p2"],
        ["p3", "p4"],
      ],
    },
  };
  return { s: { ...s0, courts: [court] }, court };
}

const splitOf = (lineup: { teams: [string[], string[]] }) =>
  lineup.teams
    .map((team) => [...team].sort().join("+"))
    .sort()
    .join(" vs ");

describe("pickDifferentLineup", () => {
  it("never swaps: with only the current set allowed it re-splits the same four (Fairness case)", () => {
    const { s, court } = courtWithLineup(5);
    for (const seed of seedList(20)) {
      // p5 has 2 more recent Matches than everybody else: all four others are owed before it
      const env = fakeEnv(
        {
          ...specsFor(["p1", "p2", "p3", "p4"], { recent: 0, total: 0 }),
          p5: { recent: 2, total: 2 },
        },
        { seed },
      );
      expect(fairSets(ids(5), env)).toHaveLength(1);
      const next = pickDifferentLineup(s, court, env)!;
      expect(lineupPlayerIds(next).sort()).toEqual(["p1", "p2", "p3", "p4"]);
      expect(splitOf(next)).not.toEqual(splitOf(court.lineup!));
    }
  });

  // Ticket .scratch/small-free-pool/issues/02-rehash-swap-breaks-rest.md
  it("does not bring in a player who would play a third Match in a row", () => {
    // Five Candidates (e.g. 9 players on 2 Courts, 5 free). p5 has played two Matches in a row
    // and is rested; the current Lineup p1–p4 has nobody at Streak 2. Every other set of four
    // contains p5, so Rehash re-splits p1–p4 instead.
    const { s, court } = courtWithLineup(5);
    for (const seed of seedList(20)) {
      const env = fakeEnv(
        { ...specsFor(["p1", "p2", "p3", "p4"], { streak: 1 }), p5: { streak: 2 } },
        { seed },
      );
      expect(fairSets(ids(5), env)).toHaveLength(1); // Rest leaves only the current set
      const next = pickDifferentLineup(s, court, env)!;
      expect(lineupPlayerIds(next).sort()).toEqual(["p1", "p2", "p3", "p4"]);
      expect(splitOf(next)).not.toEqual(splitOf(court.lineup!));
    }
  });

  it("never makes unbalanced Teams: with no other balanced split it returns null", () => {
    // Skills 3, 2, 2, 1: only [p1,p4] vs [p2,p3] is balanced (4 v 4); the others are 5 v 3.
    const skills = {
      p1: "advanced",
      p2: "intermediate",
      p3: "intermediate",
      p4: "beginner",
    } as const;
    const { s, court } = courtWithLineup(5, skills);
    const balanced: Court = {
      ...court,
      lineup: {
        teams: [
          ["p1", "p4"],
          ["p2", "p3"],
        ],
      },
    };
    const s2 = { ...s, courts: [balanced] };
    for (const seed of seedList(10)) {
      const env = fakeEnv(
        {
          p1: { streak: 1, skill: "advanced" },
          p2: { streak: 1 },
          p3: { streak: 1 },
          p4: { streak: 1, skill: "beginner" },
          p5: { streak: 2 },
        },
        { seed },
      );
      expect(pickDifferentLineup(s2, balanced, env)).toBeNull();
    }
  });

  it("re-splits to another balanced split (difference 0 or 1) when there is one", () => {
    // Skills 3, 3, 1, 1: [p1,p3] vs [p2,p4] and [p1,p4] vs [p2,p3] are both balanced.
    const skills = { p1: "advanced", p2: "advanced", p3: "beginner", p4: "beginner" } as const;
    const { s, court } = courtWithLineup(5, skills);
    const current: Court = {
      ...court,
      lineup: {
        teams: [
          ["p1", "p3"],
          ["p2", "p4"],
        ],
      },
    };
    const s2 = { ...s, courts: [current] };
    for (const seed of seedList(10)) {
      const env = fakeEnv(
        {
          p1: { streak: 1, skill: "advanced" },
          p2: { streak: 1, skill: "advanced" },
          p3: { streak: 1, skill: "beginner" },
          p4: { streak: 1, skill: "beginner" },
          p5: { streak: 2 },
        },
        { seed },
      );
      const next = pickDifferentLineup(s2, current, env)!;
      expect(lineupPlayerIds(next).sort()).toEqual(["p1", "p2", "p3", "p4"]);
      expect(splitOf(next)).toBe("p1+p4 vs p2+p3");
      expect(balanceOf(env, next.teams)).toBeLessThanOrEqual(1);
    }
  });

  it("lets an already-unbalanced Lineup move to another four that is no worse (max(1, current))", () => {
    // p1–p3 are owed a place before p4 and p5, so the allowed sets are p1–p3 plus p4 or p5.
    // Skills 3, 3, 3, 1, 1: both fours are 3, 3, 3, 1 with best balance 2. The current Lineup
    // (balance 2) is already unbalanced, so another four with balance 2 is fine.
    const skills = {
      p1: "advanced",
      p2: "advanced",
      p3: "advanced",
      p4: "beginner",
      p5: "beginner",
    } as const;
    const { s, court } = courtWithLineup(5, skills);
    const spec = {
      p1: { recent: 0, total: 0, skill: "advanced" },
      p2: { recent: 0, total: 0, skill: "advanced" },
      p3: { recent: 0, total: 0, skill: "advanced" },
      p4: { recent: 2, total: 2, skill: "beginner" },
      p5: { recent: 2, total: 2, skill: "beginner" },
    } as const;
    for (const seed of seedList(10)) {
      const env = fakeEnv(spec, { seed });
      expect(balanceOf(env, court.lineup!.teams)).toBe(2);
      const next = pickDifferentLineup(s, court, env)!;
      expect(lineupPlayerIds(next).sort()).toEqual(["p1", "p2", "p3", "p5"]);
      expect(balanceOf(env, next.teams)).toBeLessThanOrEqual(2);
    }
  });

  it("re-splits the four when there are exactly four Candidates", () => {
    const { s, court } = courtWithLineup(4);
    for (const seed of seedList(10)) {
      const env = fakeEnv(specsFor(ids(4)), { seed });
      const next = pickDifferentLineup(s, court, env)!;
      expect(lineupPlayerIds(next).sort()).toEqual(["p1", "p2", "p3", "p4"]);
      expect(splitOf(next)).not.toEqual(splitOf(court.lineup!));
    }
  });

  it("picks a different allowed set when one exists", () => {
    const { s, court } = courtWithLineup(6);
    for (const seed of seedList(10)) {
      const env = fakeEnv(specsFor(ids(6)), { seed });
      const next = pickDifferentLineup(s, court, env)!;
      expect(lineupPlayerIds(next).sort()).not.toEqual(["p1", "p2", "p3", "p4"]);
    }
  });

  it("is null with fewer than four Candidates", () => {
    const { s, court } = courtWithLineup(3);
    expect(pickDifferentLineup(s, court, fakeEnv(specsFor(ids(3))))).toBeNull();
  });

  it("matches pickLineup's rules when the Court has no Lineup", () => {
    const players = ids(6).map((id) => player(id));
    const s = session({ players });
    const env = fakeEnv(specsFor(ids(6)));
    expect(pickDifferentLineup(s, s.courts[0]!, env)).not.toBeNull();
    expect(pickLineup(s, "c1", env)).not.toBeNull();
  });
});

describe("rehashBlockReason", () => {
  it("is null when a different allowed set within the balance limit exists", () => {
    const { s, court } = courtWithLineup(6);
    expect(rehashBlockReason(s, court, fakeEnv(specsFor(ids(6))))).toBeNull();
  });

  it("is null with exactly four Candidates (Rehash re-splits, or says no balanced Teams)", () => {
    const { s, court } = courtWithLineup(4);
    expect(rehashBlockReason(s, court, fakeEnv(specsFor(ids(4))))).toBeNull();
  });

  it("is null when the Court has no Lineup", () => {
    const s = session({ players: ids(6).map((id) => player(id)) });
    expect(rehashBlockReason(s, s.courts[0]!, fakeEnv(specsFor(ids(6))))).toBeNull();
  });

  it('is "rest" when Rest forces the current set', () => {
    const { s, court } = courtWithLineup(5);
    const env = fakeEnv({
      ...specsFor(["p1", "p2", "p3", "p4"], { streak: 1 }),
      p5: { streak: 2 },
    });
    expect(rehashBlockReason(s, court, env)).toEqual({ reason: "rest", newTeams: true });
  });

  it('is "waited" when Rests in a row forces the current set', () => {
    // p1–p4 have sat out two Matches in a row (the limit); p5 has not. Streaks are all 0, so
    // Rest alone would allow other sets.
    const { s, court } = courtWithLineup(5);
    const env = fakeEnv(
      { ...specsFor(["p1", "p2", "p3", "p4"], { rests: 2 }), p5: { rests: 0 } },
      { restsLimit: 2 },
    );
    expect(fairSets(ids(5), env)).toHaveLength(1);
    expect(rehashBlockReason(s, court, env)).toEqual({ reason: "waited", newTeams: true });
  });

  it('is "rest" before "waited" when both would force the current set', () => {
    const { s, court } = courtWithLineup(5);
    const env = fakeEnv(
      {
        ...specsFor(["p1", "p2", "p3", "p4"], { streak: 1, rests: 2 }),
        p5: { streak: 2 },
      },
      { restsLimit: 2 },
    );
    expect(rehashBlockReason(s, court, env)?.reason).toBe("rest");
  });

  it('is "fairness" when Rest allows another set but someone is owed a place', () => {
    const { s, court } = courtWithLineup(5);
    const env = fakeEnv({
      ...specsFor(["p1", "p2", "p3", "p4"], { recent: 0, total: 0 }),
      p5: { recent: 2, total: 2 },
    });
    expect(rehashBlockReason(s, court, env)).toEqual({ reason: "fairness", newTeams: true });
  });

  describe('"balance": other fours are allowed but none splits into balanced Teams', () => {
    // p1–p3 are owed before p4 and p5, so the allowed sets are p1–p3 + p4 (current) or + p5.
    const spec = (p3: SkillLevel, p5: SkillLevel) => ({
      p1: { recent: 0, total: 0, skill: "advanced" as const },
      p2: { recent: 0, total: 0, skill: "advanced" as const },
      p3: { recent: 0, total: 0, skill: p3 },
      p4: { recent: 2, total: 2, skill: "beginner" as const },
      p5: { recent: 2, total: 2, skill: p5 },
    });
    const lineup = (court: Court): Court => ({
      ...court,
      lineup: {
        teams: [
          ["p1", "p4"],
          ["p2", "p3"],
        ],
      },
    });

    it("is balance, with newTeams true when another split of the four is balanced", () => {
      // Current 3, 3, 1, 1 (balanced); swapping p4 for p5 (3) gives 3, 3, 1, 3 (best balance 2).
      const { s, court } = courtWithLineup(5, { p1: "advanced", p2: "advanced", p3: "beginner" });
      const env = fakeEnv(spec("beginner", "advanced"));
      expect(rehashBlockReason(s, lineup(court), env)).toEqual({
        reason: "balance",
        newTeams: true,
      });
    });
  });

  it("with Skills 3, 2, 2, 1 and the balanced split current, New Teams is false", () => {
    // The Rest-blocked case: only [p1,p4] vs [p2,p3] is balanced, so no other split fits.
    const { s, court } = courtWithLineup(5, {
      p1: "advanced",
      p2: "intermediate",
      p3: "intermediate",
      p4: "beginner",
    });
    const balanced: Court = {
      ...court,
      lineup: {
        teams: [
          ["p1", "p4"],
          ["p2", "p3"],
        ],
      },
    };
    const env = fakeEnv({
      p1: { streak: 1, skill: "advanced" },
      p2: { streak: 1 },
      p3: { streak: 1 },
      p4: { streak: 1, skill: "beginner" },
      p5: { streak: 2 },
    });
    expect(rehashBlockReason(s, balanced, env)).toEqual({ reason: "rest", newTeams: false });
  });

  it("with Skills 3, 3, 1, 1 two splits are balanced, so New Teams is true", () => {
    const { s, court } = courtWithLineup(5, {
      p1: "advanced",
      p2: "advanced",
      p3: "beginner",
      p4: "beginner",
    });
    const current: Court = {
      ...court,
      lineup: {
        teams: [
          ["p1", "p3"],
          ["p2", "p4"],
        ],
      },
    };
    const env = fakeEnv({
      p1: { streak: 1, skill: "advanced" },
      p2: { streak: 1, skill: "advanced" },
      p3: { streak: 1, skill: "beginner" },
      p4: { streak: 1, skill: "beginner" },
      p5: { streak: 2 },
    });
    expect(rehashBlockReason(s, current, env)).toEqual({ reason: "rest", newTeams: true });
  });
});

describe("pickSwapLineup (Swap anyway)", () => {
  it("brings in the rested player even though Rest forbids it", () => {
    const { s, court } = courtWithLineup(5);
    for (const seed of seedList(10)) {
      const env = fakeEnv(
        { ...specsFor(["p1", "p2", "p3", "p4"], { streak: 1 }), p5: { streak: 2 } },
        { seed },
      );
      const next = lineupPlayerIds(pickSwapLineup(s, court, env)!);
      expect(next).toContain("p5");
      expect(
        next.filter((id) => id !== "p5").every((id) => ["p1", "p2", "p3", "p4"].includes(id)),
      ).toBe(true);
    }
  });

  it("swaps in the less-behind of two dominated players", () => {
    const { s, court } = courtWithLineup(6);
    for (const seed of seedList(10)) {
      // p5 and p6 are both dominated by the four, so every set with one of them passes
      // someone over; the swap with the better exact counts (p5) wins.
      const env = fakeEnv(
        {
          ...specsFor(["p1", "p2", "p3", "p4"], { recent: 0, total: 0 }),
          p5: { recent: 2, total: 2 },
          p6: { recent: 3, total: 3 },
        },
        { seed },
      );
      const next = lineupPlayerIds(pickSwapLineup(s, court, env)!);
      expect(next).toContain("p5");
      expect(next).not.toContain("p6");
    }
  });

  it("is null with nobody to swap in, or without a Lineup", () => {
    const { s, court } = courtWithLineup(4);
    expect(pickSwapLineup(s, court, fakeEnv(specsFor(ids(4))))).toBeNull();
    const empty = session({ players: ids(6).map((id) => player(id)) });
    expect(pickSwapLineup(empty, empty.courts[0]!, fakeEnv(specsFor(ids(6))))).toBeNull();
  });
});
