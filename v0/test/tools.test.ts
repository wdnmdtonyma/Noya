import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Compile } from "typebox/compile";
import { checkSchema, toolContracts } from "../src/schema.ts";

const UNSUPPORTED = new Set(["$ref", "$defs", "$schema", "oneOf", "const", "if", "then", "else", "discriminator"]);

function unsupportedKeys(node: unknown, path = ""): string[] {
  if (Array.isArray(node)) return node.flatMap((item, index) => unsupportedKeys(item, `${path}/${index}`));
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
    if (key === "properties" && value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([name, sub]) => unsupportedKeys(sub, `${path}/properties/${name}`));
    }
    return [...(UNSUPPORTED.has(key) ? [`${path}/${key}`] : []), ...unsupportedKeys(value, `${path}/${key}`)];
  });
}

function at(schema: unknown, ...keys: Array<string | number>): Record<string, unknown> {
  let node: unknown = schema;
  for (const key of keys) node = (node as Record<string | number, unknown>)[key];
  return node as Record<string, unknown>;
}

function refusal(contract: keyof typeof toolContracts, value: unknown): string {
  return checkSchema(toolContracts[contract].validate, value, contract).join("\n");
}

describe("工具参数", () => {
  test("每个工具都给模型一份顶层为 object、不含 $ref/oneOf/const/if 的参数 schema", () => {
    for (const [name, contract] of Object.entries(toolContracts)) {
      assert.equal(contract.parameters.type, "object", name);
      assert.ok(contract.parameters.properties, name);
      assert.deepEqual(unsupportedKeys(contract.parameters), [], name);
      assert.doesNotThrow(() => Compile(contract.parameters as never), name);
    }
  });

  test("write_canon 的参数展开了人物志、资料库和世界志节点的字段", () => {
    const branches = at(toolContracts.writeCanon.parameters, "properties", "changes", "items", "anyOf") as unknown as Record<string, unknown>[];
    const types = branches.map((branch) => at(branch, "properties", "type", "enum")[0]);
    assert.deepEqual(types, ["character", "library", "world_node", "outline_node"]);
    const characterUpsert = at(branches[0], "anyOf", 0, "properties", "doc");
    assert.deepEqual(at(characterUpsert, "properties", "abilities", "items", "required"), ["entry_id", "mastery", "content"]);
    const libraryUpsert = at(branches[1], "anyOf", 0, "properties", "doc");
    assert.ok(at(libraryUpsert, "properties", "effects"));
    const worldUpsert = at(branches[2], "anyOf", 0, "properties");
    assert.ok(worldUpsert.parent_id && worldUpsert.node);
  });

  test("query_canon 和 spawn_subagent 给模型平铺的参数，并列出可选值", () => {
    assert.deepEqual(at(toolContracts.query.parameters, "properties", "op", "enum"), ["search", "get", "list", "subtree"]);
    assert.ok((at(toolContracts.query.parameters, "properties", "type", "enum") as unknown as string[]).includes("world_node"));
    assert.deepEqual(at(toolContracts.spawn.parameters, "properties", "role", "enum"), ["writer", "reviewer", "sync_checker"]);
  });

  test("拒绝原因只针对选中的分支，并写出可选值", () => {
    const wrongType = refusal("query", { op: "list", type: "world" });
    assert.match(wrongType, /\/type 必须是以下之一：.*"world_node"/);
    assert.doesNotMatch(wrongType, /ids|\/query/);

    const missingOp = refusal("query", {});
    assert.match(missingOp, /缺少字段 op，可选值："search"、"get"、"list"、"subtree"/);

    const wrongChangeType = refusal("writeCanon", { author_confirmation: "可以", changes: [{ type: "world", op: "upsert", doc: {} }] });
    assert.match(wrongChangeType, /\/changes\/0\/type 为 "world"，可选值："character"、"library"、"world_node"、"outline_node"/);

    const wrongOp = refusal("writeCanon", { author_confirmation: "可以", changes: [{ type: "character", op: "create", doc: {} }] });
    assert.match(wrongOp, /\/changes\/0\/op 为 "create"，可选值："upsert"、"delete"/);

    const badDoc = refusal("writeCanon", {
      author_confirmation: "可以",
      changes: [{ type: "character", op: "upsert", doc: { id: "wan-zhou", name: "万舟" } }],
    });
    assert.match(badDoc, /\/changes\/0\/doc 缺少字段 abilities/);

    assert.match(refusal("writeCanon", { param: "{}" }), /不允许字段 param/);
  });
});
