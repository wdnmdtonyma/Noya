import { readFileSync } from "node:fs";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

const schemaDir = new URL("../schema/", import.meta.url);

function readSchema(name: string): object {
  return JSON.parse(readFileSync(new URL(name, schemaDir), "utf8")) as object;
}

export const ajv = new Ajv2020({
  strict: true,
  allowUnionTypes: true,
  coerceTypes: false,
  useDefaults: false,
  allErrors: true,
});

export const validators = {
  chapter: ajv.compile(readSchema("chapter.json")),
  outline: ajv.compile(readSchema("outline.json")),
  world: ajv.compile(readSchema("world.json")),
  character: ajv.compile(readSchema("character.json")),
  library: ajv.compile(readSchema("library.json")),
  brief: ajv.compile(readSchema("writing-brief.json")),
  review: ajv.compile(readSchema("chapter-review.json")),
};

const writeCanonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["author_confirmation", "changes"],
  properties: {
    author_confirmation: { type: "string" },
    changes: { type: "array", minItems: 1, items: { type: "object" } },
  },
} as const;

const documentSchema = { type: "object" };

const canonChangeSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "doc"],
      properties: {
        type: { const: "character" },
        op: { const: "upsert" },
        doc: documentSchema,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "id"],
      properties: { type: { const: "character" }, op: { const: "delete" }, id: { type: "string" } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "doc"],
      properties: { type: { const: "library" }, op: { const: "upsert" }, doc: documentSchema },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "id"],
      properties: { type: { const: "library" }, op: { const: "delete" }, id: { type: "string" } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "parent_id", "node"],
      properties: {
        type: { const: "world_node" },
        op: { const: "upsert" },
        parent_id: { type: ["string", "null"] },
        node: {
          type: "object",
          additionalProperties: false,
          required: ["id", "kind", "title", "summary", "content"],
          properties: {
            id: { type: "string", minLength: 1 },
            kind: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            summary: { type: "string" },
            content: { type: "string" },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "id"],
      properties: { type: { const: "world_node" }, op: { const: "delete" }, id: { type: "string" } },
    },
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
          properties: {
            id: { type: "string", minLength: 1 },
            order: { type: "integer", minimum: 1 },
            title: { type: "string", minLength: 1 },
            content: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["written", "in_progress", "planned"] },
            chapter_ids: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
            key_characters: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "op", "id"],
      properties: { type: { const: "outline_node" }, op: { const: "delete" }, id: { type: "string" } },
    },
  ],
} as const;

const chapterMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "chapter_id", "summary", "key_characters"],
  properties: {
    type: { const: "chapter_meta" },
    chapter_id: { type: "string" },
    summary: { type: "string" },
    key_characters: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
  },
} as const;

const syncChangeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "change", "evidence", "rationale"],
  properties: {
    id: { type: "string" },
    change: { oneOf: [canonChangeSchema, chapterMetaSchema] },
    evidence: { type: "array", minItems: 1, items: { type: "string" } },
    rationale: { type: "string", minLength: 1 },
  },
} as const;

const querySchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["op", "query"],
      properties: {
        op: { const: "search" },
        query: { type: "string", minLength: 1 },
        types: {
          type: "array",
          items: { type: "string", enum: ["chapter", "character", "library", "world_node", "outline_node"] },
        },
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
      properties: {
        op: { const: "list" },
        type: { type: "string", enum: ["chapter", "character", "library", "world_node", "outline_node"] },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["op", "id"],
      properties: {
        op: { const: "subtree" },
        id: { type: "string" },
        depth: { type: "integer", minimum: 0 },
      },
    },
  ],
} as const;

const packageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["brief", "pack"],
  properties: { brief: { type: "object" }, pack: { type: "string" } },
} as const;

const spawnSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["role", "package_id"],
      properties: { role: { const: "writer" }, package_id: { type: "string", minLength: 1 } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["role", "draft_id"],
      properties: { role: { const: "reviewer" }, draft_id: { type: "string", minLength: 1 } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["role", "proposal_id"],
      properties: { role: { const: "sync_checker" }, proposal_id: { type: "string", minLength: 1 } },
    },
  ],
} as const;

const sendSchema = {
  type: "object",
  additionalProperties: false,
  required: ["agent_id", "message"],
  properties: {
    agent_id: { type: "string", minLength: 1 },
    message: { type: "string" },
    package_id: { type: "string", minLength: 1 },
  },
} as const;

const agentSchema = {
  type: "object",
  additionalProperties: false,
  properties: { agent_id: { type: "string", minLength: 1 } },
} as const;

const stopSchema = {
  type: "object",
  additionalProperties: false,
  required: ["agent_id"],
  properties: { agent_id: { type: "string", minLength: 1 } },
} as const;

const reviewArgsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["review"],
  properties: { review: { type: "object" } },
} as const;

const syncProposalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["chapter_id", "changes"],
  properties: {
    chapter_id: { type: "string" },
    changes: { type: "array", minItems: 1, items: syncChangeSchema },
  },
} as const;

const syncCheckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["change_id", "verdict", "reason", "conflicting_ids"],
        properties: {
          change_id: { type: "string" },
          verdict: { type: "string", enum: ["supported", "unsupported", "conflict"] },
          reason: { type: "string", minLength: 1 },
          conflicting_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const applySyncSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposal_id", "change_ids"],
  properties: {
    proposal_id: { type: "string", minLength: 1 },
    change_ids: { type: "array", minItems: 1, items: { type: "string" } },
    author_confirmation: { type: "string" },
  },
} as const;

export const toolValidators = {
  writeCanon: ajv.compile(writeCanonSchema),
  canonChange: ajv.compile(canonChangeSchema),
  query: ajv.compile(querySchema),
  package: ajv.compile(packageSchema),
  spawn: ajv.compile(spawnSchema),
  send: ajv.compile(sendSchema),
  agent: ajv.compile(agentSchema),
  stop: ajv.compile(stopSchema),
  reviewArgs: ajv.compile(reviewArgsSchema),
  syncProposal: ajv.compile(syncProposalSchema),
  syncCheck: ajv.compile(syncCheckSchema),
  applySync: ajv.compile(applySyncSchema),
  chapterMeta: ajv.compile(chapterMetaSchema),
};

export function schemaErrors(validate: ValidateFunction): string[] {
  return (validate.errors ?? []).map((error) => {
    const path = error.instancePath && error.instancePath.length > 0 ? error.instancePath : "/";
    return `${path} ${error.message ?? "不合法"}`;
  });
}

export function checkSchema(validate: ValidateFunction, value: unknown, label: string): string[] {
  if (validate(value)) return [];
  return schemaErrors(validate).map((error) => `${label}：${error}`);
}
