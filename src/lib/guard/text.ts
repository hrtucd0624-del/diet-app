// 送信前チェック（文章）。端末の中だけで動き、外部には何も送らない。
// 「その人が誰か分かる情報」を止めるためのもので、体重や食事などは対象外。

export type GuardLevel = "ok" | "confirm" | "block";

export type TextGuardResult = {
  level: GuardLevel;
  text: string; // 伏せ字にしたあとの文
  masked: number; // 伏せた数
  reasons: string[]; // ブロック・確認の理由（表示用）
};

export type GuardDictionary = {
  realName: string;
  partnerName: string;
  words: string[];
};

export const MASK = "＊＊＊";

// 全角の数字・記号を半角にそろえてから調べる
function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－ー―‐−]/g, (c, i, str) => (/\d/.test(str[i - 1] ?? "") && /\d/.test(str[i + 1] ?? "") ? "-" : c))
    .replace(/[＋]/g, "+")
    .replace(/[＠]/g, "@");
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

const PREFS =
  "北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県";

type Rule = { level: "block" | "confirm"; reason: string; test: (s: string) => boolean };

const RULES: Rule[] = [
  {
    level: "block",
    reason: "メールアドレス",
    test: (s) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s),
  },
  {
    level: "block",
    reason: "電話番号",
    // 0 または +国番号 から始まる 10〜13 桁（区切りは - や空白）
    test: (s) => /(?<![\d.])(?:\+\d{1,3}[\s-]?|0)\d{1,4}(?:[\s-]?\d{2,4}){2,3}(?![\d.])/.test(s) &&
      [...s.matchAll(/(?<![\d.])(?:\+\d{1,3}[\s-]?|0)\d{1,4}(?:[\s-]?\d{2,4}){2,3}(?![\d.])/g)].some((m) => {
        const n = m[0].replace(/\D/g, "").length;
        return n >= 10 && n <= 13;
      }),
  },
  {
    level: "block",
    reason: "郵便番号",
    test: (s) => /〒\s*\d{3}-?\d{4}|(?<!\d)\d{3}-\d{4}(?!\d)/.test(s),
  },
  {
    level: "block",
    reason: "住所",
    test: (s) =>
      new RegExp(`(${PREFS})[^\\s、。]{0,20}?\\d+\\s*(丁目|番地?|号|-\\d+)`).test(s) ||
      /[^\s、。]{1,8}[市区町村郡][^\s、。]{0,12}?\d+\s*(丁目|番地?|号|-\d+)/.test(s),
  },
  {
    level: "block",
    reason: "カード番号やマイナンバーのような数字",
    test: (s) =>
      [...s.matchAll(/(?<![\d.])\d(?:[\s-]?\d){11,18}(?![\d.])/g)].some((m) => {
        const d = m[0].replace(/\D/g, "");
        return d.length === 12 || (d.length >= 13 && luhn(d));
      }),
  },
  {
    level: "confirm",
    reason: "URL",
    test: (s) => /https?:\/\/|www\.[A-Za-z0-9-]+\./i.test(s),
  },
  {
    level: "confirm",
    reason: "SNSのアカウント名（@〜）",
    test: (s) => /(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_.]{2,30}(?![A-Za-z0-9.-]*\.[A-Za-z]{2,})/.test(s),
  },
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkText(input: string, dict: GuardDictionary): TextGuardResult {
  let text = input;
  let masked = 0;

  // 1) 本名・パートナーの名前・伏せたい言葉は自動で伏せる（長い言葉から）
  const words = [dict.realName, dict.partnerName, ...dict.words]
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const w of words) {
    const re = new RegExp(escapeRegExp(w), "gi");
    text = text.replace(re, () => {
      masked++;
      return MASK;
    });
  }

  // 2) パターンで調べる
  const normalized = normalize(text);
  const reasons: string[] = [];
  let level: GuardLevel = "ok";
  for (const rule of RULES) {
    if (rule.test(normalized)) {
      reasons.push(rule.reason);
      if (rule.level === "block") level = "block";
      else if (level === "ok") level = "confirm";
    }
  }
  return { level, text, masked, reasons };
}
