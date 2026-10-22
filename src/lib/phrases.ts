// AIを使わない「今日のひとこと」（フェーズ2でコーチの一言に置き換える）
const PHRASES = [
  "完ぺきじゃなくていいよ。今日もひとつ決めて、ひとつやろう。",
  "体重は毎日ゆれるもの。見るのは7日平均の線だけで大丈夫。",
  "食べる前にひと呼吸。迷ったら相談してね。",
  "記録できた日は、それだけで前に進んでる。",
  "疲れてる日は、休むのも「決めたこと」のひとつ。",
  "お水を一杯。それだけでも今日のスタートになるよ。",
  "昨日のことは昨日でおしまい。今日は今日。",
];

export function phraseOfDay(isoDate: string): string {
  const n = isoDate.split("-").reduce((a, b) => a + Number(b), 0);
  return PHRASES[n % PHRASES.length];
}
