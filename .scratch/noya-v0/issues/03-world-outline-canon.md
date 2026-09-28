# 03 — 世界志与大纲的写入

**What to build:** 作者确认宗门、地点、修炼规则后，Context Agent 能把它们作为世界志节点写入（挂在指定父节点下或作为顶层节点），能调整节点内容而不丢失其下级节点；能写入和调整大纲节点（已写到 / 正在推进 / 尚未写到）。人物志可以引用世界志节点作为所在位置。Context Agent 能按子树读取世界志。

契约详见 `.scratch/noya-v0/spec.md`："正式资料 schema 与一致性"、附录中 `write_canon` 的 `world_node` 与 `outline_node` 变更、`query_canon` 的 `subtree`。schema 直接采用 `docs/design/context-types.md` 中的 WorldGuide 与 Outline；v0 世界志为单文件。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `world_node` upsert：新节点追加到父节点 `children` 末尾（`parent_id` 为 null 时追加到顶层 `nodes`），`children: []`；已有节点：`parent_id` 必须等于当前父节点，否则拒绝（v0 不支持移动）；只替换 `kind`、`title`、`summary`、`content`，保留 `children`
- [ ] `world_node` delete：仅限无下级节点；被引用时拒绝并列出引用方
- [ ] 世界志中任何只含 `ref_id` 的子节点引用一律拒绝
- [ ] `outline_node` upsert/delete；大纲节点 `id`、`order` 各自唯一；`chapter_ids` → 存在的章节，`key_characters` → 存在的人物
- [ ] 同一批次可以同时新建世界志节点与引用它的人物志
- [ ] `query_canon`：新增 `subtree`（按节点 ID 返回子树，可限深度）；`search`/`get`/`list` 覆盖世界志节点与大纲节点；`get` 章节也可用（章节在 08 之后才会存在）
- [ ] 测试：在父节点下新建子节点后，父节点更新不丢失子节点；改变已有节点的 `parent_id` 被拒；删除有下级的节点被拒；大纲 `order` 重复被拒；新建地点并让人物位于该地点在同一批次通过；含 `ref_id` 子节点被拒
