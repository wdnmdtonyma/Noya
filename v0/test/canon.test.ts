import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fauxAssistantMessage, fauxToolCall, openFixture, toolTexts, type Fixture } from "./harness.ts";

function person(id: string, extra: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id,
    name: id,
    aliases: [],
    summary: `${id}的摘要`,
    content: `${id}的经历很长`,
    state: { location_id: null, attributes: [] },
    abilities: [],
    possessions: [],
    resources: [],
    relationships: [],
    cognition: [],
    ...extra,
  };
}

function library(id: string) {
  return {
    schema_version: 1,
    id,
    kind: "skill",
    name: id,
    aliases: [],
    summary: "功法摘要",
    effects: ["能护住身体"],
    requirements: [],
    limitations: ["不能挡住神识攻击"],
    attributes: [],
    content: "这门功法的详细规则",
  };
}

function commits(workDir: string): string[] {
  return execFileSync("git", ["-C", workDir, "log", "--format=%s"], { encoding: "utf8" }).trim().split("\n");
}

async function ask(fx: Fixture, user: string, calls: ReturnType<typeof fauxAssistantMessage>[]) {
  fx.faux.context.setResponses([...calls, fauxAssistantMessage("好")]);
  await fx.session.prompt(user);
}

describe("正式资料与路径", { concurrency: false }, () => {
  let fx: Fixture;
  before(async () => {
    fx = await openFixture();
  });
  after(async () => {
    await fx.cleanup();
  });

  test("确认片段不在最近一条作者消息里会被拒绝", async () => {
    await ask(fx, "可以", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "这句话作者没说过",
          changes: [{ type: "character", op: "upsert", doc: person("lin") }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*作者确认/);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "characters", "lin.json")), false);
  });

  test("只有标点的确认会被拒绝", async () => {
    await ask(fx, "。。。", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "。。。",
          changes: [{ type: "character", op: "upsert", doc: person("lin") }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*标点/);
  });

  test("schema 错误会被整批拒绝", async () => {
    const broken = person("lin");
    delete (broken as { name?: string }).name;
    await ask(fx, "可以写入", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "character", op: "upsert", doc: broken }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    assert.equal(commits(fx.work.workDir).length, 1);
  });

  test("非法 ID 被拒绝且不产生文件", async () => {
    await ask(fx, "可以写入", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "character", op: "upsert", doc: person("ab/cd") }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "characters", "ab")), false);
  });

  test("悬空引用被拒绝", async () => {
    await ask(fx, "可以写入", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "character", op: "upsert", doc: person("lin", { abilities: [{ entry_id: "missing", mastery: null, content: "" }] }) }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*不存在/);
  });

  test("同一批新建人物和功法会一次提交两个文件", async () => {
    await ask(fx, "可以，写入林凡和他的功法", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "library", op: "upsert", doc: library("gong") },
            { type: "character", op: "upsert", doc: person("lin", { abilities: [{ entry_id: "gong", mastery: "初学", content: "刚入门" }] }) },
          ],
        }),
      ]),
    ]);
    const result = toolTexts(fx.session, "write_canon").at(-1) ?? "";
    assert.doesNotMatch(result, /\[拒绝\]/);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "characters", "lin.json")), true);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "library", "gong.json")), true);
    const names = execFileSync("git", ["-C", fx.work.workDir, "show", "--name-only", "--pretty=format:", "HEAD"], { encoding: "utf8" });
    assert.match(names, /canon\/characters\/lin\.json/);
    assert.match(names, /canon\/library\/gong\.json/);
    assert.equal(commits(fx.work.workDir).length, 2);
    fx.faux.context.setResponses([
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "character", op: "upsert", doc: person("bai") }],
        }),
      ]),
      fauxAssistantMessage("好"),
    ]);
    await fx.session.sendCustomMessage({ customType: "noya.notice", content: "可以", display: true }, { triggerTurn: true });
    await fx.session.waitForIdle();
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*早于上次写入/);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "characters", "bai.json")), false);
  });

  test("任一项错误则整批不落盘", async () => {
    await ask(fx, "可以再写一个", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "character", op: "upsert", doc: person("bai") },
            { type: "library", op: "upsert", doc: { schema_version: 1, id: "bad" } },
          ],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "characters", "bai.json")), false);
    assert.equal(commits(fx.work.workDir).length, 2);
  });

  test("程序通知里的文字不能当作作者确认", async () => {
    fx.faux.context.setResponses([
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "通知专用同意",
          changes: [{ type: "character", op: "upsert", doc: person("bai") }],
        }),
      ]),
      fauxAssistantMessage("好"),
    ]);
    await fx.session.sendCustomMessage(
      { customType: "noya.notice", content: "通知专用同意", display: true },
      { triggerTurn: true },
    );
    await fx.session.waitForIdle();
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*作者确认/);
    assert.equal(existsSync(join(fx.work.workDir, "canon", "characters", "bai.json")), false);
  });

  test("更新父节点不会丢掉子节点，移动和删除有下级的节点会被拒绝", async () => {
    await ask(fx, "可以写入宗门和矿洞", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "world_node", op: "upsert", parent_id: null, node: { id: "sect", kind: "faction", title: "青云宗", summary: "宗门摘要", content: "宗门内容" } },
            { type: "world_node", op: "upsert", parent_id: "sect", node: { id: "mine", kind: "location", title: "矿洞", summary: "矿洞摘要", content: "矿洞内容" } },
          ],
        }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    await ask(fx, "可以改宗门摘要", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "world_node", op: "upsert", parent_id: null, node: { id: "sect", kind: "faction", title: "青云宗", summary: "改过的摘要", content: "宗门内容" } },
          ],
        }),
      ]),
    ]);
    const world = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "world.json"), "utf8"));
    assert.equal(world.nodes[0].children[0].id, "mine");
    assert.equal(world.nodes[0].summary, "改过的摘要");
    await ask(fx, "可以把矿洞挪到顶层", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "world_node", op: "upsert", parent_id: null, node: { id: "mine", kind: "location", title: "矿洞", summary: "矿洞摘要", content: "矿洞内容" } }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*不能移动/);
    await ask(fx, "可以删掉宗门", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "world_node", op: "delete", id: "sect" }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*下级/);
  });

  test("大纲顺序重复会被拒绝，同一批可以新建地点并让人物位于该地点", async () => {
    await ask(fx, "可以加两个同样顺序的大纲", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "outline_node", op: "upsert", node: { id: "o1", order: 1, title: "甲", content: "第一段", status: "planned", chapter_ids: [], key_characters: [] } },
            { type: "outline_node", op: "upsert", node: { id: "o2", order: 1, title: "乙", content: "第二段", status: "planned", chapter_ids: [], key_characters: [] } },
          ],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*顺序/);
    await ask(fx, "可以让林凡住进后山", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "world_node", op: "upsert", parent_id: null, node: { id: "hill", kind: "location", title: "后山", summary: "后山摘要", content: "后山内容" } },
            {
              type: "character",
              op: "upsert",
              doc: person("lin", {
                state: { location_id: "hill", attributes: [] },
                abilities: [{ entry_id: "gong", mastery: "初学", content: "刚入门" }],
              }),
            },
          ],
        }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    const lin = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "characters", "lin.json"), "utf8"));
    assert.equal(lin.state.location_id, "hill");
  });

  test("世界志里的 ref_id 子节点会被拒绝", async () => {
    const worldPath = join(fx.work.workDir, "canon", "world.json");
    const world = JSON.parse(readFileSync(worldPath, "utf8"));
    world.nodes[0].children.push({ ref_id: "elsewhere" });
    writeFileSync(worldPath, JSON.stringify(world));
    await ask(fx, "可以再记一笔", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "outline_node", op: "upsert", node: { id: "o3", order: 2, title: "丙", content: "第三段", status: "planned", chapter_ids: [], key_characters: [] } }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\].*ref_id/);
  });

  test("不能改正式区、不能读运行时目录、不能从作品上级搜索，但可以读 Skill", async () => {
    await ask(fx, "改一下人物文件", [
      fauxAssistantMessage([
        fauxToolCall("edit", { path: "canon/characters/lin.json", edits: [{ oldText: "林凡", newText: "林凡改" }] }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "edit").at(-1) ?? "", /\[拒绝\]/);
    await ask(fx, "读运行时", [
      fauxAssistantMessage([fauxToolCall("read", { path: fx.work.runtimeDir })]),
    ]);
    assert.match(toolTexts(fx.session, "read").at(-1) ?? "", /\[拒绝\]/);
    await ask(fx, "往上搜", [
      fauxAssistantMessage([fauxToolCall("grep", { pattern: "Noya", path: ".." })]),
    ]);
    assert.match(toolTexts(fx.session, "grep").at(-1) ?? "", /\[拒绝\]/);
    await ask(fx, "读技能", [
      fauxAssistantMessage([fauxToolCall("read", { path: join(fx.config.skillsDir, "answer", "SKILL.md") })]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "read").at(-1) ?? "", /\[拒绝\]/);
    assert.match(toolTexts(fx.session, "read").at(-1) ?? "", /问答/);
  });

  test("同一批可以先写子节点，检索能按全文和持有物 ID 找到", async () => {
    const worldPath = join(fx.work.workDir, "canon", "world.json");
    const stored = JSON.parse(readFileSync(worldPath, "utf8"));
    const dropRefs = (nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
      nodes.flatMap((node) => {
        if ("ref_id" in node) return [];
        if (Array.isArray(node.children)) node.children = dropRefs(node.children as Array<Record<string, unknown>>);
        return [node];
      });
    stored.nodes = dropRefs(stored.nodes);
    writeFileSync(worldPath, JSON.stringify(stored));
    const place = (id: string, title: string) => ({ id, kind: "location", title, summary: `${title}摘要`, content: `${title}内容` });
    await ask(fx, "可以按子节点在前写下三级地点", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "world_node", op: "upsert", parent_id: "mid", node: place("leaf", "叶") },
            { type: "world_node", op: "upsert", parent_id: "root", node: place("mid", "枝") },
            { type: "world_node", op: "upsert", parent_id: null, node: place("root", "干") },
          ],
        }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    const world = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "world.json"), "utf8"));
    const root = world.nodes.find((node: { id: string }) => node.id === "root");
    assert.equal(root.children[0].id, "mid");
    assert.equal(root.children[0].children[0].id, "leaf");
    await ask(fx, "可以再删掉这三级", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            { type: "world_node", op: "delete", id: "root" },
            { type: "world_node", op: "delete", id: "mid" },
            { type: "world_node", op: "delete", id: "leaf" },
          ],
        }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    await ask(fx, "搜宗门编号", [fauxAssistantMessage([fauxToolCall("query_canon", { op: "search", query: "sect" })])]);
    assert.match(toolTexts(fx.session, "query_canon").at(-1) ?? "", /world_node\tsect/);
    await ask(fx, "可以给林凡一把木剑", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [
            {
              type: "character",
              op: "upsert",
              doc: person("lin", {
                state: { location_id: "hill", attributes: [] },
                abilities: [{ entry_id: "gong", mastery: "初学", content: "刚入门" }],
                possessions: [
                  {
                    id: "sword",
                    entry_id: null,
                    name: "木剑",
                    quantity: 1,
                    usage: "carried",
                    location: null,
                    condition: null,
                    attunement: null,
                    content: "一把普通木剑",
                  },
                ],
              }),
            },
          ],
        }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    await ask(fx, "取出木剑", [fauxAssistantMessage([fauxToolCall("query_canon", { op: "get", ids: ["sword"] })])]);
    assert.match(toolTexts(fx.session, "query_canon").at(-1) ?? "", /possession sword/);
    assert.match(toolTexts(fx.session, "query_canon").at(-1) ?? "", /木剑/);
  });
});
