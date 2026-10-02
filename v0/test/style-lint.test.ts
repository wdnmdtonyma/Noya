import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { styleProblems } from "../src/style-lint.ts";

// 一段约 1100 字、对白和内心声音都够的正常叙述。
const sound = Array.from({ length: 12 }, (_, i) =>
  `万舟把第${i + 1}张符压在砖缝里，用指甲把翘起的角按平，又抬头看了看巷口。这地方前后只有一个出口，雨棚底下那滩水是他昨晚拎桶倒的，水面平得能照出半截墙。\n“还差几张？天亮前弄得完吗？”外卖小哥蹲在电动车旁边问。\n“三张，弄得完。你往后站点。”他头也不抬。能撑到天亮吗？他心里没底。`,
).join("\n");

describe("文风检查", () => {
  test("正常的叙述通过", () => {
    assert.deepEqual(styleProblems(sound), []);
  });

  test("对仗式打斗概括、「不是X，是Y」、叠词和破折号都会被指出", () => {
    const text = [
      sound,
      "它扑，他退；它退，他进。",
      "不是水花，是火。不是烟，是灰。",
      "它一寸一寸转过来，又一步一步退回去。",
      "他抬头——雨停了——灯灭了——人走了。",
    ].join("\n");
    const problems = styleProblems(text).join("\n");
    assert.match(problems, /对仗概括/);
    assert.match(problems, /不是X，是Y/);
    assert.match(problems, /一寸一寸/);
    assert.match(problems, /破折号/);
  });

  test("引号里的对白不计入叙述的比喻和破折号", () => {
    const text = `${sound}\n“像，太像了——像他爹，像得跟一个模子刻出来的，像极了。”`;
    assert.deepEqual(styleProblems(text), []);
  });

  test("连续三段叙述短段会被指出，并给出原文", () => {
    const problems = styleProblems(`${sound}\n万舟没动。\n水炸了。\n火起来了。`).join("\n");
    assert.match(problems, /连续 3 段/);
    assert.match(problems, /「万舟没动。」/);
  });

  test("千字以上没有对白、没有内心声音的章节会被指出", () => {
    const silent = Array.from({ length: 30 }, () => "他沿着墙根往巷子深处走，脚下的积水没过鞋面，雨棚上的水顺着铁皮边沿往下滴，滴在他肩上。").join("\n");
    const problems = styleProblems(silent).join("\n");
    assert.match(problems, /对白只占全文/);
    assert.match(problems, /直接判断/);
  });
});
