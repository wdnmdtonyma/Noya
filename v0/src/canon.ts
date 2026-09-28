import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkSchema, validators } from "./schema.ts";
import { atomicWrite, isId, writeJson } from "./util.ts";

export type CanonType = "chapter" | "character" | "library" | "world_node" | "outline_node";

export interface Chapter {
  schema_version: 1;
  id: string;
  title: string;
  order: number;
  status: "draft" | "finalized";
  content: string;
  summary: string;
  key_characters: string[];
}

export interface OutlineNode {
  id: string;
  order: number;
  title: string;
  content: string;
  status: "written" | "in_progress" | "planned";
  chapter_ids: string[];
  key_characters: string[];
}

export interface Outline {
  schema_version: 1;
  nodes: OutlineNode[];
}

export interface WorldNode {
  id: string;
  kind: string;
  title: string;
  summary: string;
  content: string;
  children: Array<WorldNode | { ref_id: string }>;
}

export interface WorldGuide {
  schema_version: 1;
  nodes: Array<WorldNode | { ref_id: string }>;
}

export interface SyncState {
  schema_version: 1;
  pending_chapter_ids: string[];
}

export interface CanonState {
  chapters: Map<string, Chapter>;
  characters: Map<string, Record<string, unknown>>;
  library: Map<string, Record<string, unknown>>;
  world: WorldGuide;
  outline: Outline;
  sync: SyncState;
}

export interface CanonPaths {
  root: string;
  chapters: string;
  characters: string;
  library: string;
  world: string;
  outline: string;
  sync: string;
}

export function canonPaths(workDir: string): CanonPaths {
  const root = join(workDir, "canon");
  return {
    root,
    chapters: join(root, "chapters"),
    characters: join(root, "characters"),
    library: join(root, "library"),
    world: join(root, "world.json"),
    outline: join(root, "outline.json"),
    sync: join(root, "sync.json"),
  };
}

export function emptyCanon(): CanonState {
  return {
    chapters: new Map(),
    characters: new Map(),
    library: new Map(),
    world: { schema_version: 1, nodes: [] },
    outline: { schema_version: 1, nodes: [] },
    sync: { schema_version: 1, pending_chapter_ids: [] },
  };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readDocs(directory: string): Map<string, Record<string, unknown>> {
  const docs = new Map<string, Record<string, unknown>>();
  if (!existsSync(directory)) return docs;
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    const doc = readJson(join(directory, name)) as Record<string, unknown>;
    docs.set(String(doc.id), doc);
  }
  return docs;
}

export function loadCanon(workDir: string): CanonState {
  const paths = canonPaths(workDir);
  const state = emptyCanon();
  state.characters = readDocs(paths.characters);
  state.library = readDocs(paths.library);
  if (existsSync(paths.world)) state.world = readJson(paths.world) as WorldGuide;
  if (existsSync(paths.outline)) state.outline = readJson(paths.outline) as Outline;
  if (existsSync(paths.sync)) state.sync = readJson(paths.sync) as SyncState;
  const chapters = readDocs(paths.chapters);
  for (const [id, doc] of chapters) state.chapters.set(id, doc as unknown as Chapter);
  return state;
}

export function cloneCanon(state: CanonState): CanonState {
  return {
    chapters: new Map([...state.chapters].map(([id, doc]) => [id, structuredClone(doc)])),
    characters: new Map([...state.characters].map(([id, doc]) => [id, structuredClone(doc)])),
    library: new Map([...state.library].map(([id, doc]) => [id, structuredClone(doc)])),
    world: structuredClone(state.world),
    outline: structuredClone(state.outline),
    sync: structuredClone(state.sync),
  };
}

function isRef(node: WorldNode | { ref_id: string }): node is { ref_id: string } {
  return "ref_id" in node && !("id" in node);
}

export function walkWorld(
  nodes: Array<WorldNode | { ref_id: string }>,
  visit: (node: WorldNode | { ref_id: string }, parentId: string | null) => void,
  parentId: string | null = null,
): void {
  for (const node of nodes) {
    visit(node, parentId);
    if (!isRef(node)) walkWorld(node.children, visit, node.id);
  }
}

export function findWorld(state: CanonState, id: string): { node: WorldNode; parentId: string | null } | undefined {
  let found: { node: WorldNode; parentId: string | null } | undefined;
  walkWorld(state.world.nodes, (node, parentId) => {
    if (!isRef(node) && node.id === id) found = { node, parentId };
  });
  return found;
}

function childrenOf(state: CanonState, parentId: string | null): Array<WorldNode | { ref_id: string }> | undefined {
  if (parentId === null) return state.world.nodes;
  return findWorld(state, parentId)?.node.children;
}

interface IdOwner {
  id: string;
  owner: string;
}

export function collectIds(state: CanonState): IdOwner[] {
  const ids: IdOwner[] = [];
  for (const id of state.chapters.keys()) ids.push({ id, owner: `章节 ${id}` });
  for (const [id, doc] of state.characters) {
    ids.push({ id, owner: `人物 ${id}` });
    const possessions = Array.isArray(doc.possessions) ? doc.possessions : [];
    for (const item of possessions) {
      if (item && typeof item === "object" && "id" in item) ids.push({ id: String(item.id), owner: `人物 ${id} 的持有物` });
    }
    const cognition = Array.isArray(doc.cognition) ? doc.cognition : [];
    for (const item of cognition) {
      if (item && typeof item === "object" && "id" in item) ids.push({ id: String(item.id), owner: `人物 ${id} 的认知` });
    }
  }
  for (const id of state.library.keys()) ids.push({ id, owner: `资料库 ${id}` });
  walkWorld(state.world.nodes, (node) => {
    if (!isRef(node)) ids.push({ id: node.id, owner: `世界志 ${node.id}` });
  });
  for (const node of state.outline.nodes) ids.push({ id: node.id, owner: `大纲 ${node.id}` });
  return ids;
}

export function formalIds(state: CanonState): Set<string> {
  return new Set(collectIds(state).map((item) => item.id));
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

export function consistencyErrors(state: CanonState): string[] {
  const errors: string[] = [];
  const ids = collectIds(state);
  const seen = new Map<string, string>();
  for (const item of ids) {
    if (!isId(item.id)) errors.push(`${item.owner} 的 ID「${item.id}」不符合格式`);
    const previous = seen.get(item.id);
    if (previous) errors.push(`ID「${item.id}」重复：${previous}、${item.owner}`);
    else seen.set(item.id, item.owner);
  }

  const orders = new Set<number>();
  for (const chapter of state.chapters.values()) {
    if (orders.has(chapter.order)) errors.push(`章节顺序 ${chapter.order} 重复`);
    orders.add(chapter.order);
    for (const id of chapter.key_characters) {
      if (!state.characters.has(id)) errors.push(`章节 ${chapter.id} 引用了不存在的人物 ${id}`);
    }
  }

  const outlineOrders = new Set<number>();
  for (const node of state.outline.nodes) {
    if (outlineOrders.has(node.order)) errors.push(`大纲顺序 ${node.order} 重复`);
    outlineOrders.add(node.order);
    for (const id of node.chapter_ids) {
      if (!state.chapters.has(id)) errors.push(`大纲节点 ${node.id} 引用了不存在的章节 ${id}`);
    }
    for (const id of node.key_characters) {
      if (!state.characters.has(id)) errors.push(`大纲节点 ${node.id} 引用了不存在的人物 ${id}`);
    }
  }

  walkWorld(state.world.nodes, (node) => {
    if (isRef(node)) errors.push(`世界志不接受只含 ref_id 的子节点引用（${node.ref_id}）`);
  });

  for (const [id, doc] of state.characters) {
    const stateRecord = doc.state as Record<string, unknown> | undefined;
    const location = stateRecord?.location_id;
    if (typeof location === "string" && !findWorld(state, location)) {
      errors.push(`人物 ${id} 的所在位置 ${location} 不存在`);
    }
    const attributeKeys = new Set<string>();
    for (const attribute of recordList(stateRecord?.attributes)) {
      const key = String(attribute.key);
      if (attributeKeys.has(key)) errors.push(`人物 ${id} 的状态项 ${key} 重复`);
      attributeKeys.add(key);
    }
    const abilityIds = new Set<string>();
    for (const ability of recordList(doc.abilities)) {
      const entryId = String(ability.entry_id);
      if (abilityIds.has(entryId)) errors.push(`人物 ${id} 的能力 ${entryId} 重复`);
      abilityIds.add(entryId);
      if (!state.library.has(entryId)) errors.push(`人物 ${id} 的能力引用了不存在的资料 ${entryId}`);
    }
    const resourceKeys = new Set<string>();
    for (const resource of recordList(doc.resources)) {
      const key = String(resource.key);
      if (resourceKeys.has(key)) errors.push(`人物 ${id} 的资源 ${key} 重复`);
      resourceKeys.add(key);
    }
    for (const relation of recordList(doc.relationships)) {
      const other = String(relation.character_id);
      if (other === id) errors.push(`人物 ${id} 不能把关系指向自己`);
      else if (!state.characters.has(other)) errors.push(`人物 ${id} 的关系引用了不存在的人物 ${other}`);
    }
    for (const item of recordList(doc.possessions)) {
      const entryId = item.entry_id;
      if (typeof entryId === "string" && !state.library.has(entryId)) {
        errors.push(`人物 ${id} 的持有物 ${String(item.id)} 引用了不存在的资料 ${entryId}`);
      }
    }
    for (const item of recordList(doc.cognition)) {
      for (const chapterId of textList(item.source_chapter_ids)) {
        if (!state.chapters.has(chapterId)) errors.push(`人物 ${id} 的认知 ${String(item.id)} 引用了不存在的章节 ${chapterId}`);
      }
    }
  }

  const possessionOwners = new Map<string, string>();
  for (const [id, doc] of state.characters) {
    for (const item of recordList(doc.possessions)) {
      const possessionId = String(item.id);
      const previous = possessionOwners.get(possessionId);
      if (previous) errors.push(`持有物 ${possessionId} 同时出现在人物 ${previous} 和 ${id}`);
      possessionOwners.set(possessionId, id);
    }
  }

  for (const [id, doc] of state.library) {
    const keys = new Set<string>();
    for (const attribute of recordList(doc.attributes)) {
      const key = String(attribute.key);
      if (keys.has(key)) errors.push(`资料 ${id} 的属性 ${key} 重复`);
      keys.add(key);
    }
  }
  return errors;
}

type CanonChange = Record<string, unknown>;

function upsertWorld(state: CanonState, parentId: string | null, node: Record<string, unknown>): string | undefined {
  const id = String(node.id);
  const existing = findWorld(state, id);
  if (existing) {
    if (existing.parentId !== parentId) {
      return `世界志节点 ${id} 不能移动，当前父节点是 ${existing.parentId ?? "顶层"}`;
    }
    existing.node.kind = String(node.kind);
    existing.node.title = String(node.title);
    existing.node.summary = String(node.summary);
    existing.node.content = String(node.content);
    return undefined;
  }
  const siblings = childrenOf(state, parentId);
  if (!siblings) return `世界志父节点 ${parentId} 不存在`;
  siblings.push({
    id,
    kind: String(node.kind),
    title: String(node.title),
    summary: String(node.summary),
    content: String(node.content),
    children: [],
  });
  return undefined;
}

function deleteWorld(state: CanonState, id: string): string | undefined {
  const found = findWorld(state, id);
  if (!found) return `世界志节点 ${id} 不存在`;
  if (found.node.children.length > 0) return `世界志节点 ${id} 有下级节点，不能删除`;
  const siblings = childrenOf(state, found.parentId);
  if (!siblings) return `世界志节点 ${id} 不存在`;
  const index = siblings.findIndex((node) => !isRef(node) && node.id === id);
  if (index >= 0) siblings.splice(index, 1);
  return undefined;
}

export function applyCanonChanges(state: CanonState, changes: CanonChange[]): string[] {
  const errors: string[] = [];
  const deferred: CanonChange[] = [];
  const applyOne = (change: CanonChange, allowDefer: boolean): void => {
    const type = change.type;
    const op = change.op;
    if (type === "chapter_meta") {
      const chapterId = String(change.chapter_id);
      const chapter = state.chapters.get(chapterId);
      if (!chapter) {
        errors.push(`章节 ${chapterId} 不存在，不能更新摘要`);
        return;
      }
      chapter.summary = String(change.summary);
      chapter.key_characters = [...(change.key_characters as string[])];
      const schemaProblems = checkSchema(validators.chapter, chapter, `章节 ${chapterId}`);
      errors.push(...schemaProblems);
      return;
    }
    if (type === "character" && op === "upsert") {
      const doc = change.doc as Record<string, unknown>;
      const problems = checkSchema(validators.character, doc, `人物 ${String(doc.id)}`);
      if (problems.length > 0) errors.push(...problems);
      else state.characters.set(String(doc.id), structuredClone(doc));
      return;
    }
    if (type === "character" && op === "delete") {
      const id = String(change.id);
      if (!state.characters.has(id)) errors.push(`人物 ${id} 不存在`);
      else state.characters.delete(id);
      return;
    }
    if (type === "library" && op === "upsert") {
      const doc = change.doc as Record<string, unknown>;
      const problems = checkSchema(validators.library, doc, `资料 ${String(doc.id)}`);
      if (problems.length > 0) errors.push(...problems);
      else state.library.set(String(doc.id), structuredClone(doc));
      return;
    }
    if (type === "library" && op === "delete") {
      const id = String(change.id);
      if (!state.library.has(id)) errors.push(`资料 ${id} 不存在`);
      else state.library.delete(id);
      return;
    }
    if (type === "world_node" && op === "upsert") {
      const parentId = (change.parent_id ?? null) as string | null;
      const node = change.node as Record<string, unknown>;
      if (parentId !== null && !findWorld(state, parentId) && !findWorld(state, String(node.id))) {
        if (allowDefer) deferred.push(change);
        else errors.push(`世界志父节点 ${parentId} 不存在`);
        return;
      }
      const problem = upsertWorld(state, parentId, node);
      if (problem) errors.push(problem);
      return;
    }
    if (type === "world_node" && op === "delete") {
      const problem = deleteWorld(state, String(change.id));
      if (problem) errors.push(problem);
      return;
    }
    if (type === "outline_node" && op === "upsert") {
      const node = change.node as OutlineNode;
      const index = state.outline.nodes.findIndex((item) => item.id === node.id);
      if (index >= 0) state.outline.nodes[index] = structuredClone(node);
      else state.outline.nodes.push(structuredClone(node));
      return;
    }
    if (type === "outline_node" && op === "delete") {
      const id = String(change.id);
      const index = state.outline.nodes.findIndex((item) => item.id === id);
      if (index < 0) errors.push(`大纲节点 ${id} 不存在`);
      else state.outline.nodes.splice(index, 1);
    }
  };

  for (const change of changes) applyOne(change, true);
  for (const change of deferred) applyOne(change, false);
  errors.push(...checkSchema(validators.world, state.world, "世界志"));
  errors.push(...checkSchema(validators.outline, state.outline, "大纲"));
  errors.push(...consistencyErrors(state));
  return [...new Set(errors)];
}

export function validateDocuments(state: CanonState): string[] {
  const errors: string[] = [];
  errors.push(...checkSchema(validators.world, state.world, "世界志"));
  errors.push(...checkSchema(validators.outline, state.outline, "大纲"));
  for (const chapter of state.chapters.values()) errors.push(...checkSchema(validators.chapter, chapter, `章节 ${chapter.id}`));
  for (const [id, doc] of state.characters) errors.push(...checkSchema(validators.character, doc, `人物 ${id}`));
  for (const [id, doc] of state.library) errors.push(...checkSchema(validators.library, doc, `资料 ${id}`));
  return errors;
}

export async function saveCanon(workDir: string, before: CanonState, after: CanonState): Promise<string[]> {
  const paths = canonPaths(workDir);
  const written: string[] = [];
  const changed = async (file: string, next: string, previous: string | undefined) => {
    if (next === previous) return;
    if (next === "") rmSync(file, { force: true });
    else await atomicWrite(file, next);
    written.push(file);
  };
  for (const id of new Set([...before.chapters.keys(), ...after.chapters.keys()])) {
    const file = join(paths.chapters, `${id}.json`);
    const next = after.chapters.has(id) ? `${JSON.stringify(after.chapters.get(id), null, 2)}\n` : "";
    const previous = before.chapters.has(id) ? `${JSON.stringify(before.chapters.get(id), null, 2)}\n` : undefined;
    await changed(file, next, previous);
  }
  for (const id of new Set([...before.characters.keys(), ...after.characters.keys()])) {
    const file = join(paths.characters, `${id}.json`);
    const next = after.characters.has(id) ? `${JSON.stringify(after.characters.get(id), null, 2)}\n` : "";
    const previous = before.characters.has(id) ? `${JSON.stringify(before.characters.get(id), null, 2)}\n` : undefined;
    await changed(file, next, previous);
  }
  for (const id of new Set([...before.library.keys(), ...after.library.keys()])) {
    const file = join(paths.library, `${id}.json`);
    const next = after.library.has(id) ? `${JSON.stringify(after.library.get(id), null, 2)}\n` : "";
    const previous = before.library.has(id) ? `${JSON.stringify(before.library.get(id), null, 2)}\n` : undefined;
    await changed(file, next, previous);
  }
  const worldNext = `${JSON.stringify(after.world, null, 2)}\n`;
  const worldPrev = `${JSON.stringify(before.world, null, 2)}\n`;
  if (worldNext !== worldPrev) {
    await atomicWrite(paths.world, worldNext);
    written.push(paths.world);
  }
  const outlineNext = `${JSON.stringify(after.outline, null, 2)}\n`;
  const outlinePrev = `${JSON.stringify(before.outline, null, 2)}\n`;
  if (outlineNext !== outlinePrev) {
    await atomicWrite(paths.outline, outlineNext);
    written.push(paths.outline);
  }
  const syncNext = `${JSON.stringify(after.sync, null, 2)}\n`;
  const syncPrev = `${JSON.stringify(before.sync, null, 2)}\n`;
  if (syncNext !== syncPrev) {
    await atomicWrite(paths.sync, syncNext);
    written.push(paths.sync);
  }
  return written;
}

export async function writeInitialCanon(workDir: string): Promise<void> {
  const paths = canonPaths(workDir);
  const state = emptyCanon();
  await writeJson(paths.world, state.world);
  await writeJson(paths.outline, state.outline);
  await writeJson(paths.sync, state.sync);
}

export interface ListedItem {
  type: CanonType;
  id: string;
  title: string;
  summary: string;
  text: string;
  doc: unknown;
}

function nodeSummary(node: { title?: string; summary?: string; content?: string; name?: string }): string {
  return node.summary || node.content || "";
}

export function listCanon(state: CanonState): ListedItem[] {
  const items: ListedItem[] = [];
  for (const chapter of state.chapters.values()) {
    items.push({
      type: "chapter",
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      text: `${chapter.title}\n${chapter.summary}\n${chapter.content}`,
      doc: chapter,
    });
  }
  for (const [id, doc] of state.characters) {
    items.push({
      type: "character",
      id,
      title: String(doc.name ?? id),
      summary: String(doc.summary ?? ""),
      text: JSON.stringify(doc),
      doc,
    });
  }
  for (const [id, doc] of state.library) {
    items.push({
      type: "library",
      id,
      title: String(doc.name ?? id),
      summary: String(doc.summary ?? ""),
      text: JSON.stringify(doc),
      doc,
    });
  }
  walkWorld(state.world.nodes, (node) => {
    if (isRef(node)) return;
    items.push({
      type: "world_node",
      id: node.id,
      title: node.title,
      summary: nodeSummary(node),
      text: `${node.title}\n${node.summary}\n${node.content}`,
      doc: node,
    });
  });
  for (const node of state.outline.nodes) {
    items.push({
      type: "outline_node",
      id: node.id,
      title: node.title,
      summary: node.content,
      text: `${node.title}\n${node.content}`,
      doc: node,
    });
  }
  return items;
}

export function limitDepth(node: WorldNode, depth: number | undefined): WorldNode {
  if (depth === undefined) return structuredClone(node);
  const copy = structuredClone(node);
  if (depth === 0) {
    copy.children = [];
    return copy;
  }
  copy.children = copy.children.map((child) => (isRef(child) ? child : limitDepth(child, depth - 1)));
  return copy;
}
