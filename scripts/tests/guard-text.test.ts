// node --test scripts/tests/guard-text.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkText } from "../../src/lib/guard/text.ts";

const dict = { realName: "山田花子", partnerName: "タロウ", words: ["ABCアパレル", "モナシュ"] };

const cases: [string, "ok" | "confirm" | "block"][] = [
  ["今朝は51.2kgだった", "ok"],
  ["12:00-18:00 バイト", "ok"],
  ["2026-10-23 の体重 50.5", "ok"],
  ["おにぎり2個とお味噌汁", "ok"],
  ["生理3日目でお腹すいた", "ok"],
  ["ピラティス 45分", "ok"],
  ["東京都で10時からピラティス", "ok"],
  ["体脂肪 28.5% 体重 50.2", "ok"],
  ["10/23 21:30 アイス食べたい", "ok"],
  ["東京都港区1-2", "block"],
  ["電話は090-1234-5678だよ", "block"],
  ["０９０１２３４５６７８", "block"],
  ["+60 12-345 6789 に連絡して", "block"],
  ["mail: hanako@example.com", "block"],
  ["〒150-0001", "block"],
  ["東京都渋谷区神宮前1-2-3", "block"],
  ["渋谷区神宮前1丁目", "block"],
  ["4111 1111 1111 1111", "block"],
  ["1234 5678 9012", "block"],
  ["https://example.com を見て", "confirm"],
  ["@nasubi_123 のアカウント", "confirm"],
];

for (const [input, expected] of cases) {
  test(`${expected}: ${input}`, () => {
    assert.equal(checkText(input, dict).level, expected);
  });
}

test("本名・パートナー・伏せたい言葉を伏せる", () => {
  const r = checkText("山田花子です。タロウとABCアパレルの帰りに会った。モナシュの前で", dict);
  assert.equal(r.level, "ok");
  assert.equal(r.masked, 4);
  assert.ok(!r.text.includes("山田") && !r.text.includes("タロウ") && !r.text.includes("ABC"));
});
