// docs/coach-system-prompt.md を埋め込んで、Supabase に貼る用の
// supabase/functions/coach/index.ts を作る：node scripts/build-coach.mjs
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync("docs/coach-system-prompt.md", "utf8");
// 先頭の人間向けの説明（最初の「---」まで）は送らない
const prompt = md.slice(md.indexOf("---") + 3).trim();
const source = readFileSync("supabase/functions/coach/source.ts", "utf8");
if (!source.includes('"__COACH_PROMPT__"')) throw new Error("placeholder not found");
const out =
  "// ⚠️ 自動生成ファイル。直す時は source.ts と docs/coach-system-prompt.md を直して\n" +
  "//    node scripts/build-coach.mjs を実行する。\n" +
  source.replace('"__COACH_PROMPT__"', () => JSON.stringify(prompt));
writeFileSync("supabase/functions/coach/index.ts", out);
console.log(`wrote supabase/functions/coach/index.ts (${out.length} chars)`);
