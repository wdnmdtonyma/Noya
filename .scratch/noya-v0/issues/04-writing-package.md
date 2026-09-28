# 04 — Writing Package

**What to build:** 作者说"写第一章"后，Context Agent 用 `save_package` 保存 Writing Brief 与 Context Pack，得到 `package_id`。Brief 按 WritingBrief schema 校验；Pack 每段材料必须标明来源，来源 ID 必须真实存在；新写章节的 `chapter_id` 不能与已定稿章节或其他对象重名。不合格时 Context Agent 收到列出全部原因的拒绝。保存的 Package 是不可变版本，之后派发 Writer 时使用。

契约详见 `.scratch/noya-v0/spec.md`："任务产物"（Brief 规则、Pack 解析规则）、"ID 与版本"、"校验与错误约定"、附录中的 `save_package`。Brief schema 采用 `docs/design/writing-brief.md` 中的 WritingBrief。

"存在待同步章节时拒绝"与 `rewrite_chapter` 的"必须是已定稿章节"都依赖定稿功能，在 08 中实现与测试；本 ticket 中 `rewrite_chapter` 因不存在已定稿章节而一律被拒即可。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `save_package({ brief, pack })`：`prepareArguments` 中严格校验；Brief 按 WritingBrief schema（ajv 2020-12 设置同 spec）
- [ ] Brief 的 `id` 与 `chapter_id` 符合 ID 格式；`write_chapter` 的 `chapter_id` 不是已定稿章节、不与任何非章节对象 ID 冲突；`rewrite_chapter` 的 `chapter_id` 必须是已定稿章节
- [ ] Pack 按 spec 的解析规则：行首 `## ` 划分段落；首个段落前只允许空白；代码块内的 `## ` 不算；每段恰好一行 `来源：`（全角或半角冒号）；ID 以 `、` `,` `，` 或空白分隔；`无` 只能单独出现；ID 必须是存在的正式资料 ID，不能是 Brief ID
- [ ] 通过后保存为不可变版本 `package_N`（按任务从 1 编号），存入任务区 `artifacts`，返回 `package_id`
- [ ] 任务区 `artifacts` 不在任何角色内置文件工具的可写范围内（守卫配置）
- [ ] 测试：Brief schema 错误 → 拒；`chapter_id` 与人物 ID 重名 → 拒；Pack 某段无来源行 → 拒；某段两行来源 → 拒；来源 ID 不存在 → 拒；`无` 与其他 ID 混写 → 拒；代码块中的 `## ` 不被当作段落；合法 Package 返回 `package_1`，再次保存返回 `package_2`；Context 用 `edit` 修改 `artifacts` 中的文件被拒
