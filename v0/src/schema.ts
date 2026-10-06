import { readFileSync } from "node:fs";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

const schemaDir = new URL("../schema/", import.meta.url);

type Json = Record<string, unknown>;

const DOCUMENTS = ["chapter", "outline", "world", "character", "library", "writing-brief", "chapter-review"] as const;

const documents = new Map<string, Json>(
  DOCUMENTS.map((name) => [`${name}.json`, JSON.parse(readFileSync(new URL(`${name}.json`, schemaDir), "utf8")) as Json]),
);

export const ajv = new Ajv2020({
  strict: true,
  allowUnionTypes: true,
  coerceTypes: false,
  useDefaults: false,
  allErrors: true,
  discriminator: true,
  verbose: true,
});

for (const [key, schema] of documents) ajv.addSchema(schema, key);

function documentValidator(key: string): ValidateFunction {
  const validate = ajv.getSchema(key);
  if (!validate) throw new Error(`没有登记 schema ${key}`);
  return validate;
}

export const validators = {
  chapter: documentValidator("chapter.json"),
  outline: documentValidator("outline.json"),
  world: documentValidator("world.json"),
  character: documentValidator("character.json"),
  library: documentValidator("library.json"),
  brief: documentValidator("writing-brief.json"),
  review: documentValidator("chapter-review.json"),
};

const text = (description: string) => ({ type: "string", minLength: 1, description });
const idList = (description: string) => ({ type: "array", uniqueItems: true, items: { type: "string", minLength: 1 }, description });

const CANON_TYPES = ["chapter", "character", "library", "world_node", "outline_node"];

function deleteBranch(type: string, label: string) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "op", "id"],
    properties: {
      type: { const: type },
      op: { const: "delete" },
      id: text(`要删除的${label} ID`),
    },
  };
}

function documentBranch(type: string, file: string, label: string) {
  return {
    type: "object",
    required: ["type", "op"],
    properties: { type: { const: type }, op: { type: "string" } },
    discriminator: { propertyName: "op" },
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["type", "op", "doc"],
        properties: {
          type: { const: type },
          op: { const: "upsert" },
          doc: { $ref: file, description: `完整的${label}文档。修改已有对象时先用 query_canon 取出原文档，在其上修改后整份提交` },
        },
      },
      deleteBranch(type, label),
    ],
  };
}

const canonChangeSchema = {
  type: "object",
  required: ["type", "op"],
  properties: { type: { type: "string" }, op: { type: "string" } },
  discriminator: { propertyName: "type" },
  oneOf: [
    documentBranch("character", "character.json", "人物志"),
    documentBranch("library", "library.json", "资料库条目"),
    {
      type: "object",
      required: ["type", "op"],
      properties: { type: { const: "world_node" }, op: { type: "string" } },
      discriminator: { propertyName: "op" },
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "op", "parent_id", "node"],
          properties: {
            type: { const: "world_node" },
            op: { const: "upsert" },
            parent_id: {
              type: ["string", "null"],
              description: "上级世界志节点 ID；顶层节点为 null。同一批里可以先建上级再建下级",
            },
            node: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "title", "summary", "content"],
              description: "世界志节点本身，不含下级节点；已有的下级节点会保留",
              properties: {
                id: text("作品内稳定且唯一的节点 ID，小写字母、数字、- 或 _"),
                kind: text("节点类别，按作品需要命名，例如 城市、组织、规则"),
                title: text("节点名称"),
                summary: { type: "string", description: "一两句话的摘要" },
                content: { type: "string", description: "详细设定，允许 Markdown" },
              },
            },
          },
        },
        deleteBranch("world_node", "世界志节点"),
      ],
    },
    {
      type: "object",
      required: ["type", "op"],
      properties: { type: { const: "outline_node" }, op: { type: "string" } },
      discriminator: { propertyName: "op" },
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "op", "node"],
          properties: {
            type: { const: "outline_node" },
            op: { const: "upsert" },
            node: {
              type: "object",
              additionalProperties: false,
              required: ["id", "order", "title", "content", "status", "chapter_ids", "key_characters"],
              description: "一个大纲节点",
              properties: {
                id: text("大纲节点 ID"),
                order: { type: "integer", minimum: 1, description: "在故事时间线上的顺序，全书唯一" },
                title: text("节点标题"),
                content: text("剧情事件或阶段的描述"),
                status: {
                  type: "string",
                  enum: ["written", "in_progress", "planned"],
                  description: "written 已写成正文；in_progress 正在写；planned 作者确定的未来事件",
                },
                chapter_ids: idList("覆盖的章节 ID；未来节点可为空列表"),
                key_characters: idList("相关人物志 ID"),
              },
            },
          },
        },
        deleteBranch("outline_node", "大纲节点"),
      ],
    },
  ],
};

const chapterMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "chapter_id", "summary", "key_characters"],
  properties: {
    type: { const: "chapter_meta" },
    chapter_id: { type: "string", description: "正在同步的章节 ID" },
    summary: { type: "string", description: "根据定稿正文提炼的章节摘要" },
    key_characters: idList("本章重要登场角色的人物志 ID"),
  },
};

const writeCanonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["author_confirmation", "changes"],
  properties: {
    author_confirmation: {
      type: "string",
      description: "作者最近一条消息里表示同意的原话片段，逐字复制，例如「可以，写进去」",
    },
    changes: {
      type: "array",
      minItems: 1,
      description: "这次确认的全部变更，放在同一次调用里",
      items: canonChangeSchema,
    },
  },
};

// 变更本体由 hub 按类型逐条校验，这里只检查外层；给模型看的版本附上完整的变更格式。
function syncChangeSchema(change: Json) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "change", "evidence", "rationale"],
    properties: {
      id: text("清单内唯一的变更 ID，小写字母、数字、- 或 _"),
      change: {
        ...change,
        description: "一条资料变更（与 write_canon 的变更格式相同），或 type 为 chapter_meta 的章节摘要更新",
      },
      evidence: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
        description: "定稿正文中逐字摘录的依据，每条至少 4 个非空白字符",
      },
      rationale: text("为什么这条正文依据支持这项变化"),
    },
  };
}

const querySchema = {
  type: "object",
  required: ["op"],
  properties: { op: { type: "string" } },
  discriminator: { propertyName: "op" },
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["op", "query"],
      properties: {
        op: { const: "search" },
        query: { type: "string", minLength: 1 },
        types: { type: "array", items: { type: "string", enum: CANON_TYPES } },
        limit: { type: "integer", minimum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["op", "ids"],
      properties: { op: { const: "get" }, ids: { type: "array", minItems: 1, items: { type: "string" } } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["op", "type"],
      properties: { op: { const: "list" }, type: { type: "string", enum: CANON_TYPES } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["op", "id"],
      properties: { op: { const: "subtree" }, id: { type: "string" }, depth: { type: "integer", minimum: 0 } },
    },
  ],
};

// query_canon 和 spawn_subagent 的顶层是 oneOf，部分模型接口不接受顶层 oneOf，
// 所以另给模型一份等价的平铺说明；真正的校验仍用上面的 oneOf。
const queryParameters = {
  type: "object",
  additionalProperties: false,
  required: ["op"],
  properties: {
    op: {
      type: "string",
      enum: ["search", "get", "list", "subtree"],
      description: "search 全文搜索（需 query）；get 按 ID 取完整文档（需 ids）；list 列出某类资料（需 type）；subtree 取世界志节点及其下级（需 id）",
    },
    query: { type: "string", minLength: 1, description: "search：要查找的文字" },
    types: { type: "array", items: { type: "string", enum: CANON_TYPES }, description: "search：只在这些类型里找，可省略" },
    limit: { type: "integer", minimum: 1, description: "search：最多返回条数，默认 20" },
    ids: { type: "array", minItems: 1, items: { type: "string" }, description: "get：要取的资料 ID" },
    type: { type: "string", enum: CANON_TYPES, description: "list：资料类型" },
    id: { type: "string", description: "subtree：世界志节点 ID" },
    depth: { type: "integer", minimum: 0, description: "subtree：展开层数，省略为全部" },
  },
};

const packageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["brief", "pack"],
  properties: {
    brief: { $ref: "writing-brief.json", description: "Writing Brief" },
    pack: {
      type: "string",
      description:
        "Context Pack，Markdown。全部内容分成若干段，每段以「## 标题」开头，段内恰好一行「来源：ID、ID」列出正式资料 ID；尚未确定的事单独成段，写「来源：无」。第一个 ## 之前不能有内容",
    },
  },
};

const taskField = { type: "string", minLength: 1, maxLength: 120, description: "给作者看的一句话：这次要做什么。不复述材料，也不会交给 Subagent" };

const spawnSchema = {
  type: "object",
  required: ["role", "task"],
  properties: { role: { type: "string" }, task: taskField },
  discriminator: { propertyName: "role" },
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["role", "task", "package_id"],
      properties: { role: { const: "writer" }, task: taskField, package_id: { type: "string", minLength: 1 } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["role", "task", "draft_id"],
      properties: { role: { const: "reviewer" }, task: taskField, draft_id: { type: "string", minLength: 1 } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["role", "task", "proposal_id"],
      properties: { role: { const: "sync_checker" }, task: taskField, proposal_id: { type: "string", minLength: 1 } },
    },
  ],
};

const spawnParameters = {
  type: "object",
  additionalProperties: false,
  required: ["role", "task"],
  properties: {
    role: {
      type: "string",
      enum: ["writer", "reviewer", "sync_checker"],
      description: "writer 需 package_id；reviewer 需 draft_id；sync_checker 需 proposal_id",
    },
    task: taskField,
    package_id: { type: "string", minLength: 1, description: "writer：save_package 返回的 ID，例如 package_1" },
    draft_id: { type: "string", minLength: 1, description: "reviewer：要检查的初稿 ID，例如 draft_1" },
    proposal_id: { type: "string", minLength: 1, description: "sync_checker：save_sync_proposal 返回的 ID，例如 proposal_1" },
  },
};

const sendSchema = {
  type: "object",
  additionalProperties: false,
  required: ["agent_id", "message"],
  properties: {
    agent_id: { type: "string", minLength: 1, description: "Writer 的 ID，例如 writer-1" },
    message: { type: "string", description: "发给 Writer 的话。最新写作要求会自动附在末尾" },
    package_id: { type: "string", minLength: 1, description: "写作要求有新版本时，填新保存的 package_id；否则省略" },
  },
};

const agentSchema = {
  type: "object",
  additionalProperties: false,
  properties: { agent_id: { type: "string", minLength: 1, description: "只看某一个 Subagent 时填它的 ID；省略则列出全部" } },
};

const stopSchema = {
  type: "object",
  additionalProperties: false,
  required: ["agent_id"],
  properties: { agent_id: { type: "string", minLength: 1, description: "要停止的 Subagent ID" } },
};

const reviewArgsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["review"],
  properties: { review: { $ref: "chapter-review.json", description: "检查结果对象（不是 JSON 字符串）" } },
};

function syncProposalSchema(change: Json) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["chapter_id", "changes"],
    properties: {
      chapter_id: { type: "string", description: "待同步的章节 ID" },
      changes: { type: "array", minItems: 1, items: syncChangeSchema(change), description: "这一章定稿带来的全部资料变化" },
    },
  };
}

const syncCheckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      description: "清单中每条变更恰好一条结论",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["change_id", "verdict", "reason", "conflicting_ids"],
        properties: {
          change_id: { type: "string", description: "清单中的变更 ID" },
          verdict: {
            type: "string",
            enum: ["supported", "unsupported", "conflict"],
            description: "supported 正文依据成立且无冲突；unsupported 依据不足；conflict 与既有资料冲突",
          },
          reason: text("结论理由"),
          conflicting_ids: {
            type: "array",
            items: { type: "string" },
            description: "conflict 时列出冲突的资料 ID；其他结论为空列表",
          },
        },
      },
    },
  },
};

const applySyncSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposal_id", "change_ids"],
  properties: {
    proposal_id: { type: "string", minLength: 1, description: "同步清单 ID，例如 proposal_1" },
    change_ids: { type: "array", minItems: 1, items: { type: "string" }, description: "要写入的变更 ID" },
    author_confirmation: {
      type: "string",
      description: "选中了非 supported 的变更时必填：作者最近一条消息里表示同意的原话片段",
    },
  },
};

const emptySchema = { type: "object", additionalProperties: false, properties: {} };

const DROPPED_KEYS = new Set(["$schema", "$id", "$defs", "title", "discriminator", "if", "then", "else"]);

// 把内部 schema 改写成给模型看的工具参数：展开 $ref，oneOf 改为 anyOf，const 改为单值 enum，
// 去掉 if/then 这类模型接口常不支持的关键字。
export function toolParameters(schema: Json): Json {
  return rewrite(schema, schema, new Set()) as Json;
}

function resolveRef(ref: string, root: Json): { target: Json; root: Json } {
  const [file, pointer = ""] = ref.split("#");
  const base = file ? documents.get(file) : root;
  if (!base) throw new Error(`无法展开 $ref ${ref}`);
  let target: unknown = base;
  for (const part of pointer.split("/").filter(Boolean)) target = (target as Json)[part];
  if (!target || typeof target !== "object") throw new Error(`无法展开 $ref ${ref}`);
  return { target: target as Json, root: base };
}

function rewrite(node: unknown, root: Json, seen: Set<string>): unknown {
  if (Array.isArray(node)) return node.map((item) => rewrite(item, root, seen));
  if (!node || typeof node !== "object") return node;
  const record = node as Json;
  if (typeof record.$ref === "string") {
    const ref = record.$ref;
    const key = ref.startsWith("#") ? `${String(root.title)}${ref}` : ref;
    if (seen.has(key)) throw new Error(`$ref ${ref} 是递归引用，不能展开成工具参数`);
    const { target, root: nextRoot } = resolveRef(ref, root);
    const { $ref: _ref, ...siblings } = record;
    const expanded = rewrite(target, nextRoot, new Set([...seen, key])) as Json;
    return { ...expanded, ...(rewrite(siblings, root, seen) as Json) };
  }
  const out: Json = {};
  for (const [key, value] of Object.entries(record)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (key === "allOf" && Array.isArray(value) && value.every((item) => item && typeof item === "object" && "if" in item)) continue;
    if (key === "const") {
      out.enum = [value];
      continue;
    }
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value as Json).map(([name, sub]) => [name, rewrite(sub, root, seen)]));
      continue;
    }
    out[key === "oneOf" ? "anyOf" : key] = rewrite(value, root, seen);
  }
  return out;
}

export interface ToolContract {
  validate: ValidateFunction;
  parameters: Json;
}

function contract(schema: Json, advertised: Json = schema): ToolContract {
  return { validate: ajv.compile(schema), parameters: toolParameters(advertised) };
}

export const toolContracts = {
  decision: contract({ type: "object", additionalProperties: false, required: ["question", "detail", "options"], properties: {
    question: text("需要作者决定的问题"), detail: text("具体分歧或新方向，清楚说明与旧方向的变化"),
    options: { type: "array", minItems: 2, maxItems: 4, items: text("简洁选项"), description: "供作者选择，也允许自由回答" },
    draft_id: { type: "string", description: "如涉及已保存正文，明确引用的稿件 ID" },
  } }),
  query: contract(querySchema, queryParameters),
  writeCanon: contract(writeCanonSchema),
  package: contract(packageSchema),
  spawn: contract(spawnSchema, spawnParameters),
  send: contract(sendSchema),
  agent: contract(agentSchema),
  stop: contract(stopSchema),
  reviewArgs: contract(reviewArgsSchema),
  syncProposal: contract(syncProposalSchema({ type: "object" }), syncProposalSchema({ anyOf: [chapterMetaSchema, canonChangeSchema] })),
  syncCheck: contract(syncCheckSchema),
  applySync: contract(applySyncSchema),
  empty: contract(emptySchema),
};

export const toolValidators = {
  canonChange: ajv.compile(canonChangeSchema),
  chapterMeta: ajv.compile(chapterMetaSchema),
};

function quote(value: unknown): string {
  return JSON.stringify(value);
}

function tagValues(parentSchema: unknown, tag: string): string[] {
  const branches = (parentSchema as { oneOf?: Json[] } | undefined)?.oneOf ?? [];
  return branches.map((branch) => (branch.properties as Json | undefined)?.[tag]).map((prop) => quote((prop as Json | undefined)?.const));
}

function describe(error: ErrorObject): string | undefined {
  const at = error.instancePath && error.instancePath.length > 0 ? error.instancePath : "/";
  const params = error.params as Json;
  switch (error.keyword) {
    case "required":
      if (params.missingProperty === "task") return `${at} 缺少字段 task。请用作者能读懂的一句话重写这次要做什么，不要复述材料。`;
      return `${at} 缺少字段 ${String(params.missingProperty)}`;
    case "additionalProperties":
      return `${at} 不允许字段 ${String(params.additionalProperty)}`;
    case "const":
      return `${at} 必须是 ${quote(params.allowedValue)}`;
    case "enum":
      return `${at} 必须是以下之一：${(params.allowedValues as unknown[]).map(quote).join("、")}`;
    case "minLength":
      if (error.instancePath === "/task" || error.instancePath.endsWith("/task")) return `${at} 为空。请用作者能读懂的一句话重写这次要做什么，不要复述材料。`;
      return `${at} ${error.message ?? "过短"}`;
    case "maxLength":
      if (error.instancePath === "/task" || error.instancePath.endsWith("/task")) return `${at} 过长。请缩短成一句作者能读懂的话，不要复述材料。`;
      return `${at} ${error.message ?? "过长"}`;
    case "type":
      return `${at} 类型应为 ${String(params.type)}，收到 ${Array.isArray(error.data) ? "array" : error.data === null ? "null" : typeof error.data}`;
    case "discriminator": {
      const tag = String(params.tag);
      const path = `${at === "/" ? "" : at}/${tag}`;
      const allowed = tagValues(error.parentSchema, tag).join("、");
      return params.tagValue === undefined
        ? `${at} 缺少字段 ${tag}，可选值：${allowed}`
        : `${path} 为 ${quote(params.tagValue)}，可选值：${allowed}`;
    }
    case "oneOf":
    case "anyOf":
    case "if":
      return undefined;
    default:
      return `${at} ${error.message ?? "不合法"}`;
  }
}

export function schemaErrors(validate: ValidateFunction): string[] {
  const tags = new Set(
    (validate.errors ?? []).filter((error) => error.keyword === "discriminator").map((error) => `${error.instancePath}|${String(error.params.tag)}`),
  );
  const errors = (validate.errors ?? []).filter(
    (error) => !(error.keyword === "required" && tags.has(`${error.instancePath}|${String(error.params.missingProperty)}`)),
  );
  const described = [...new Set(errors.map(describe).filter((line): line is string => line !== undefined))];
  if (described.length > 0) return described;
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "不合法"}`);
}

export function checkSchema(validate: ValidateFunction, value: unknown, label: string): string[] {
  if (validate(value)) return [];
  return schemaErrors(validate).map((error) => `${label}：${error}`);
}
