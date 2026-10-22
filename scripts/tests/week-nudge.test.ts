// node --test scripts/tests/week-nudge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, mondayOf } from "../../src/lib/date.ts";
import { currentNudge } from "../../src/lib/nudge.ts";

test("週は月曜はじまり", () => {
  assert.equal(mondayOf("2026-10-23"), "2026-10-19"); // 金
  assert.equal(mondayOf("2026-10-19"), "2026-10-19"); // 月
  assert.equal(mondayOf("2026-10-25"), "2026-10-19"); // 日
  assert.equal(mondayOf("2026-11-01"), "2026-10-26"); // 日・月またぎ
});

test("あと何日", () => {
  assert.equal(daysBetween("2026-10-23", "2026-11-08"), 16);
  assert.equal(daysBetween("2026-10-23", "2026-10-23"), 0);
});

const base = { morning: "07:30", evening: "21:30", weightRecorded: false, schedules: [] };
const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m);

test("朝：時刻を過ぎて体重がまだなら", () => {
  assert.equal(currentNudge({ ...base, now: at(7, 0) }), null);
  assert.match(currentNudge({ ...base, now: at(8, 0) })!.text, /おはよう/);
  assert.equal(currentNudge({ ...base, now: at(8, 0), weightRecorded: true }), null);
  assert.equal(currentNudge({ ...base, now: at(13, 0) }), null);
});

test("夜：振り返り", () => {
  assert.match(currentNudge({ ...base, now: at(22, 0) })!.text, /振り返り/);
});

test("バイト終わりが最優先（3時間以内）", () => {
  const work = { id: 1, kind: "work" as const, title: null, starts_at: at(12).toISOString(), ends_at: at(18).toISOString() };
  assert.match(currentNudge({ ...base, now: at(19), schedules: [work] })!.text, /お疲れさま/);
  assert.match(currentNudge({ ...base, now: at(22), schedules: [{ ...work, ends_at: at(21, 45).toISOString() }] })!.text, /お疲れさま/);
  assert.equal(currentNudge({ ...base, now: at(17), schedules: [work] }), null);
  assert.equal(currentNudge({ ...base, now: at(21, 1), schedules: [work] }), null);
});
