import type { GuardDictionary } from "./text";

// 本名・パートナーの名前・伏せたい言葉は、この端末の中にだけ保存する（DBにもAIにも送らない）
const KEY = "privacy-guard-dictionary";

export function loadDictionary(): GuardDictionary {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        realName: String(d.realName ?? ""),
        partnerName: String(d.partnerName ?? ""),
        words: Array.isArray(d.words) ? d.words.map(String) : [],
      };
    }
  } catch {}
  return { realName: "", partnerName: "", words: [] };
}

export function saveDictionary(d: GuardDictionary): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
