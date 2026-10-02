// 初稿文风检查：把写手常见的"散文腔"量化成可拒绝的问题。
// 阈值依据 docs/research/web-novel-craft-2026-10-02.md 第 4.3 节（现代都市灵异档）。

const HAN = /[一-鿿]/g;
const QUOTED = /“[^”]*”|「[^」]*」/g;
const SIMILE = /(?<![好图画影录想镜偶雕人头肖不])像|仿佛|如同|好似|宛如|犹如/g;
const NOT_BUT = /(不是|并非|没有)[^，。！？“”]{1,15}[，,—]+\s*(而)?是/g;
const BEAT_REPEAT = /一([寸步下点片道声层圈])一\1/g;
const PARALLEL = /[它他她][一-鿿]{1,2}[，,][它他她][一-鿿]{1,2}[；;]\s*[它他她][一-鿿]{1,2}[，,][它他她][一-鿿]{1,2}/g;
const SEPARATOR = /^(…+|\*{3,}|-{3,}|—{2,})$/;

function hanCount(text: string): number {
  return text.match(HAN)?.length ?? 0;
}

function narration(text: string): string {
  return text.replace(QUOTED, "");
}

function excerpt(text: string, pattern?: RegExp): string {
  const flat = text.replace(/\s+/g, "");
  if (flat.length <= 40) return flat;
  const at = pattern ? Math.max(0, (new RegExp(pattern.source).exec(flat)?.index ?? 0) - 15) : 0;
  return `${at > 0 ? "…" : ""}${flat.slice(at, at + 40)}${at + 40 < flat.length ? "…" : ""}`;
}

function examples(paragraphs: string[], pattern: RegExp, limit = 3): string {
  const hits = paragraphs.map(narration).filter((p) => new RegExp(pattern.source).test(p)).slice(0, limit);
  return hits.length > 0 ? `例：${hits.map((p) => `「${excerpt(p, pattern)}」`).join("")}` : "";
}

function count(text: string, pattern: RegExp): number {
  return text.match(new RegExp(pattern.source, "g"))?.length ?? 0;
}

function lastClause(paragraph: string): string {
  const parts = paragraph.replace(/[。！？…”」\s]+$/, "").split(/[，。！？；：,;]/);
  return parts.at(-1) ?? "";
}

/** 返回文风问题；空数组表示通过。content 是去掉标题行的正文。 */
export function styleProblems(content: string): string[] {
  const paragraphs = content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !SEPARATOR.test(line));
  const all = paragraphs.join("\n");
  const told = narration(all);
  const total = hanCount(all);
  const k = total / 1000;
  const problems: string[] = [];

  const dashes = count(told, /——/);
  const dashLimit = Math.max(1, Math.floor(k));
  if (dashes > dashLimit) problems.push(`叙述里的破折号 ${dashes} 处，上限 ${dashLimit} 处。改成完整的句子或拆成两句。${examples(paragraphs, /——/)}`);

  const similes = count(told, SIMILE);
  const simileLimit = Math.max(1, Math.floor(2.5 * k));
  if (similes > simileLimit) problems.push(`叙述里的比喻 ${similes} 处，上限 ${simileLimit} 处。删掉比喻，直接写动作的结果或看得见的东西。${examples(paragraphs, SIMILE)}`);

  const simileEnds = paragraphs.filter((p) => !/[“「]/.test(p) && new RegExp(SIMILE.source).test(lastClause(p)));
  if (simileEnds.length > 2) problems.push(`有 ${simileEnds.length} 段用比喻收尾，上限 2 段。段落最后一句写实。例：${simileEnds.slice(0, 3).map((p) => `「${excerpt(lastClause(p))}」`).join("")}`);

  const notBut = count(told, NOT_BUT);
  if (notBut > 1) problems.push(`「不是X，是Y」句式 ${notBut} 处，上限 1 处。直接写Y。${examples(paragraphs, NOT_BUT)}`);

  const beats = count(told, BEAT_REPEAT);
  if (beats > 1) problems.push(`「一寸一寸」这类叠词 ${beats} 处，上限 1 处。${examples(paragraphs, BEAT_REPEAT)}`);

  if (count(told, PARALLEL) > 0) problems.push(`有「它扑，他退；它退，他进」式的对仗概括。打斗按回合写：谁做了什么具体动作，对方怎么应对，结果位置、伤势或物件有什么变化。${examples(paragraphs, PARALLEL)}`);

  const isShort = (p: string) => !/[“「]/.test(p) && hanCount(p) <= 15;
  let run = 0;
  let stacked: string[] | undefined;
  paragraphs.forEach((p, index) => {
    run = isShort(p) ? run + 1 : 0;
    if (run === 3 && !stacked) stacked = paragraphs.slice(index - 2, index + 1);
  });
  if (stacked) problems.push(`连续 3 段以上不带对白的短段（15 字以内）。把它们并进前后段落，叙述段以 2 到 4 句为常态。例：${stacked.map((p) => `「${excerpt(p)}」`).join("")}`);
  const shortCount = paragraphs.filter(isShort).length;
  if (paragraphs.length >= 20 && shortCount / paragraphs.length > 0.15) {
    problems.push(`不带对白的短段占全部段落的 ${Math.round((shortCount / paragraphs.length) * 1000) / 10}%，上限 15%。单句成段只留给节拍转折和章末。`);
  }

  if (total >= 1000) {
    const spoken = total - hanCount(told);
    const ratio = spoken / total;
    if (ratio < 0.08) problems.push(`对白只占全文 ${Math.round(ratio * 1000) / 10}%，下限 8%。让人物开口：主角的台词、对手或旁人的回应，每句对白推进、冲突、交代或立人设。`);
    const voice = count(told, /[？！?!]/);
    const voiceNeed = Math.max(1, Math.floor(0.5 * k));
    if (voice < voiceNeed) problems.push(`叙述里没有视角人物的直接判断（引号外的问句或感叹句 ${voice} 处，至少 ${voiceNeed} 处）。写出他此刻的吐槽、算计、嘴硬或害怕，例如「它连鬼也吊？」。`);
  }

  return problems;
}
