# Context 类型定义

逐类记录已经确认的内容结构，尚未讨论的类型不视为 schema 已定稿。长期内容沿用正文、大纲、世界志、人物志、资料库、伏线、笔法七类；任务级 Writing Brief、Context Pack 和 Writing Package 另行定义。

作品内容采用有版本和校验的结构化文件，文本字段允许 Markdown 语法，具体编码尚未选定。本文细化 ADR 0003；旧 PRD 中 Markdown 文件与定稿、资料同步共同生效的描述，分别以 ADR 0003 和 ADR 0002 为准。

以下用 JSON Schema 描述数据结构，不限定落盘必须使用 JSON；如果采用 YAML，也应先解析成相同的数据结构再校验。当前内容 schema 版本为 `1`，字段全部显式提供，不接受未声明字段，也不自动补值或转换类型。版本、历史和资料同步的运行元数据尚未定义，以下不是完整的持久化协议。

## 正文：已确认的第一版边界

以章为基本存储单位，一章一份结构化文档，正文保留为完整长文本，暂不拆成独立的场景、段落或对白记录。

| 字段 | 含义 |
|---|---|
| `schema_version` | 文档格式版本 |
| `id` | 稳定章节身份，不随标题或顺序变化 |
| `title` | 章节标题 |
| `order` | 章节在作品中的顺序 |
| `status` | 初稿或定稿状态，与资料同步状态分开 |
| `content` | 完整正文，允许 Markdown 语法 |
| `summary` | 根据实际正文生成的剧情摘要，方便筛选和检索章节 |
| `key_characters` | 重要登场角色的人物 ID 列表，直接关联人物志 |

摘要面向内部检索，可包含结局、秘密、关键事件、状态与认知变化，不写成避剧透的宣传简介。摘要是派生资料，不是唯一检索入口；需要时仍可搜索和阅读原文。本章安排不能直接充当摘要。

重要登场角色包括实际参与关键行动、对话或发生重要状态变化的人物，不要求收录所有提及人名；用稳定人物 ID 避免别名、同名和改名导致关联失效。暂不增加地点、物品等引用字段，待相应类型定义时再判断。

正文修改后，摘要与重要登场角色需要随之更新，不能保留已删除的剧情或人物。需能识别摘要所依据的正文版本，以及资料同步覆盖的定稿版本，避免沿用过期结果；版本、历史与同步元数据的具体字段和存放位置尚未细化。

本章安排、正文摘要和正文的职责分开；摘要归属章节，不单列为第八类长期资料。初稿可以保存修改，作者接受后正文成为正式剧情依据，资料同步失败不使其退回初稿。

### Chapter schema

`status` 使用 `draft`（初稿）和 `finalized`（定稿）。`key_characters` 无重要登场角色时为 `[]`；空摘要只能作为编辑中的占位，不表示本章没有事件，也不能作为已经准备好的检索资料。初稿允许空正文，定稿要求正文非空。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Chapter",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version", "id", "title", "order", "status",
    "content", "summary", "key_characters"
  ],
  "properties": {
    "schema_version": { "type": "integer", "const": 1 },
    "id": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "order": { "type": "integer", "minimum": 1 },
    "status": { "type": "string", "enum": ["draft", "finalized"] },
    "content": { "type": "string", "description": "完整正文，允许 Markdown 语法" },
    "summary": { "type": "string", "description": "根据实际正文生成的检索摘要" },
    "key_characters": {
      "type": "array",
      "uniqueItems": true,
      "items": { "type": "string", "minLength": 1 },
      "description": "重要登场角色的人物 ID"
    }
  },
  "allOf": [
    {
      "if": { "properties": { "status": { "const": "finalized" } } },
      "then": { "properties": { "content": { "minLength": 1, "pattern": "\\S" } } }
    }
  ]
}
```

章节 `id` 和 `order` 在作品内分别唯一；顺序号无需连续。人物引用必须指向同一作品中存在的人物档案。上述跨文件约束由存储层另行校验；人物是否实际重要登场、摘要是否忠实且对应当前正文，由内容整理流程检查，JSON Schema 本身无法证明。

## 大纲：已确认的第一版边界

大纲是整部小说的故事时间线，类似电影进度条：定位到某处，可以了解那一段的场景、关键事件或人物处境。它同时包含已经写出的剧情、当前位置和作者确定的未来节点，明确区分已发生事实与未来意图。

大纲由按故事顺序排列的节点组成，节点按有意义的剧情事件或阶段划分，不强制一章一个节点。一段调查可以跨多章，一个转折也可以只占半章；已写节点可以关联实际章节，未来节点可以只有一句话、一个画面或一个结果，不必确定章号。

未来可以只有零散锚点，中间允许留白；空白不触发 Agent 自动补全，也不要求作者先规划完整部小说。当前进展是大纲的一部分，不另拆成独立的长期资料类型。已写节点的内容以定稿正文为依据，未来节点以作者接受的方向为依据。

每个节点先采用以下字段：

| 字段 | 含义 |
|---|---|
| `id` | 节点的稳定标识 |
| `order` | 在大纲中的排列顺序 |
| `title` | 便于浏览的节点标题，例如“矿洞调查” |
| `content` | 剧情、画面或作者已经确定的结果，允许 Markdown |
| `status` | 已写到、正在推进、尚未写到 |
| `chapter_ids` | 关联的实际章节，未来节点可以为空 |
| `key_characters` | 相关重要角色的人物 ID，方便准备 Context；未来节点表示计划相关人物，不代表已经登场 |

节点直接描述剧情本身，例如“主角回忆起小时候被救的经历”，按该剧情在小说中展开的位置排列，无需因回忆内容发生在过去而搬动节点。大纲通过节点状态表达进展，不要求未来节点具备完整剧情。

这一决定更新了旧 PRD 对大纲仅以连续文稿组织、排除时间线形态的限制；当前只确定内容模型，不启动前端设计或实现。

### Outline schema

整份大纲包含 `schema_version` 和 `nodes`。节点状态使用 `written`（已写到）、`in_progress`（正在推进）和 `planned`（尚未写到）；状态描述故事推进程度，不是后台任务执行状态。`chapter_ids` 和 `key_characters` 暂无关联时显式使用 `[]`，空大纲允许 `nodes: []`。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Outline",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "nodes"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1 },
    "nodes": {
      "type": "array",
      "items": { "$ref": "#/$defs/outline_node" }
    }
  },
  "$defs": {
    "outline_node": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id", "order", "title", "content", "status",
        "chapter_ids", "key_characters"
      ],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "order": { "type": "integer", "minimum": 1 },
        "title": { "type": "string", "minLength": 1 },
        "content": {
          "type": "string",
          "minLength": 1,
          "description": "剧情、画面或已确定的结果，允许 Markdown 语法"
        },
        "status": {
          "type": "string",
          "enum": ["written", "in_progress", "planned"]
        },
        "chapter_ids": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        },
        "key_characters": {
          "type": "array",
          "uniqueItems": true,
          "items": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

节点 `id` 和 `order` 在一份大纲中分别唯一，以 `order` 决定顺序，顺序号无需连续；章节和人物引用必须属于同一作品且实际存在。这些约束由存储层另行校验。`planned` 节点允许只写一个已确定的画面或结果；节点之间的留白不要求创建空节点或自动补齐剧情。

## 世界志：已确认的第一版边界

世界志记录空间与组织，以及修炼、自然、社会制度、经济资源等运行规则。采用递归嵌套的树形结构，数据文件自身直接呈现层级，不使用需要重新组装的扁平节点表。

每份世界志内容文件包含 `schema_version` 和文件顶层 `nodes`。每个节点通过 `children` 包含下级节点，也可用 `ref_id` 引用其他文件中的子树；叶节点显式写 `children: []`，空世界志允许 `nodes: []`。层级深度和父子归属由嵌套位置及子树引用表达，不重复存储 `parent_id` 或 `level`。文件顶层节点不一定是整个世界志的根节点。节点移动后保留稳定 ID，其他资料仍通过该 ID 引用。

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | string | 作品内稳定且唯一的世界志节点标识 |
| `kind` | string | 条目类型；示例使用 `faction`、`location`、`rule`，完整词表尚未收口 |
| `title` | string | 节点名称 |
| `summary` | string | 快速浏览与检索用的摘要，概括相关背景和重要约束 |
| `content` | string | 完整设定，允许 Markdown 语法，可明确记述尚未确定的内容 |
| `children` | (WorldNode 或 WorldNodeRef)[] | 完整下级节点，或仅含 `ref_id` 的子树引用 |

并非每句话都要拆成子节点。普通描述直接放在 `content` 中，需要独立检索和反复引用的地点或规则可以建为节点。树表达资料归属，不自动表达所有联盟、敌对或控制关系，也不意味着所有规则对整棵子树无条件生效；具体适用范围应写清楚。

### WorldGuide schema（格式规则）

下面定义程序如何校验世界志数据。`children` 中的完整节点递归使用同一种定义，每一层都必须包含摘要和详细内容字段，不能因为是父节点或叶节点就省略。子树引用则只有 `ref_id`，完整字段保存在目标节点中，不能同时混写引用和节点内容。Schema 中的 `$ref` 引用格式规则，数据中的 `ref_id` 引用实际节点，两者不同。当前 `kind` 只约束为非空字符串，示例值不是已经确定的完整枚举。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WorldGuide",
  "description": "包含空间、组织和运行规则的递归世界志文档",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "nodes"],
  "properties": {
    "schema_version": {
      "type": "integer",
      "const": 1,
      "description": "文档格式版本"
    },
    "nodes": {
      "type": "array",
      "description": "本文件包含的完整子树根节点，层级由 children 继续展开",
      "items": { "$ref": "#/$defs/world_node" }
    }
  },
  "$defs": {
    "world_node_ref": {
      "type": "object",
      "additionalProperties": false,
      "required": ["ref_id"],
      "properties": {
        "ref_id": {
          "type": "string",
          "minLength": 1,
          "description": "其他内容文件中完整子树根节点的稳定 ID，通过索引定位"
        }
      }
    },
    "world_node": {
      "type": "object",
      "description": "一个拥有摘要、详细设定和下级条目的世界志节点",
      "additionalProperties": false,
      "required": [
        "id", "kind", "title", "summary", "content", "children"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "description": "作品内稳定且唯一的节点 ID，移动节点不改变 ID"
        },
        "kind": {
          "type": "string",
          "minLength": 1,
          "description": "条目类型，例如 faction、location、rule；完整词表待定"
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "description": "节点名称"
        },
        "summary": {
          "type": "string",
          "description": "供 Context Agent 快速筛选资料的摘要，应与详细设定保持一致"
        },
        "content": {
          "type": "string",
          "description": "完整设定与适用范围，允许 Markdown；未知内容保持明确未知"
        },
        "children": {
          "type": "array",
          "description": "完整下级节点或子树引用；没有下级时使用空数组",
          "items": {
            "oneOf": [
              { "$ref": "#/$defs/world_node" },
              { "$ref": "#/$defs/world_node_ref" }
            ]
          }
        }
      }
    }
  }
}
```

节点 ID 在整个世界志中唯一，每个节点只保存一份完整内容。存储层另行校验跨文件引用存在、目标是其他文件中的完整子树根节点、树中每个节点至多一个父节点且不存在循环；JSON Schema 不检查这些跨节点关系，也不能证明设定在剧情上正确。`summary` 与 `content` 均为完整节点的必填字段；空字符串不表示已经确定该节点没有设定，未确定内容应明确说明，不能自动补造事实。

子树拆分、可重建索引与按需读取的完整案例见 [Context 存储与读取](context-storage.md)。以下单文件嵌套示例仍然有效，拆分不是每个节点的强制要求。

### 世界志完整数据示例（遵循上述 schema）

以下是虚构样例数据，用于说明保存格式，不代表 Noya 项目中已有的正式作品事实。每一层均保留全部字段，示例中的 Markdown 标题、列表和换行都是 `content` 字符串的内容。

```json
{
  "schema_version": 1,
  "nodes": [
    {
      "id": "world_qingyun",
      "kind": "faction",
      "title": "青云宗",
      "summary": "东境修行宗门，分内外门。宗门控制落星矿脉，弟子进入矿区需要领取任务凭证。",
      "content": "## 宗门概况\n青云宗依落星山脉而建，矿脉是其主要收入来源。\n\n## 出入制度\n弟子进入宗门管辖的矿区，需要持有外务堂发放的任务凭证。",
      "children": [
        {
          "id": "world_luoxing_mine",
          "kind": "location",
          "title": "落星矿洞",
          "summary": "青云宗西侧的废弃矿洞，分上中下三层。下层存在侵蚀神识的黑雾，普通照明无法驱散。",
          "content": "## 地形\n上层为旧矿工驻地，中层分布运输轨道，下层通向尚未探明的天然裂隙。\n\n## 当前状况\n矿洞已停止开采，但入口仍由宗门弟子看守。\n\n## 危险\n黑雾集中在下层入口之后，进入前很难从外部观察其范围。",
          "children": [
            {
              "id": "world_black_mist",
              "kind": "rule",
              "title": "矿洞黑雾",
              "summary": "只存在于矿洞下层，会逐渐侵蚀神识。火把无效，屏息也不能避免影响。",
              "content": "## 作用方式\n黑雾直接影响神识，与是否吸入无关。停留越久，方向感和对外界的感知越弱。\n\n## 已知边界\n- 普通火焰只能照明，不能驱散黑雾。\n- 离开黑雾区域后，轻度影响可以逐渐消退。\n\n## 尚未确定\n黑雾的来源与彻底清除的方法尚未确定。",
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

准备矿洞相关章节时，Context Agent 可以先读矿洞摘要，再取矿洞及其下级黑雾规则，并按需补充上级青云宗的入矿制度。规则属于世界志；某个角色是否已经知道该规则属于人物认知；该角色实际遭遇了什么则由正文记录。

## 人物志：已确认的第一版结构

人物志采用一人一份结构化文档，既保留人物画像和小传，也分别保存状态、能力、持有物、资源、人物关系和认知。以下顶层分区、嵌套字段和完整示例已获确认，作为第一版可校验格式，不要求作者为每个角色编造完整设定。

| 字段 | 类型 | 含义 |
|---|---|---|
| `schema_version` | integer | 格式版本 |
| `id` | string | 稳定人物 ID |
| `name` | string | 当前姓名 |
| `aliases` | string[] | 别名、称号，方便查找 |
| `summary` | string | 快速认识人物的摘要 |
| `content` | string | 画像、经历、性格和动机，允许 Markdown |
| `state` | object | 所在地点与已明确的状态项 |
| `abilities` | Ability[] | 资料库能力引用、掌握程度及个人使用情况 |
| `possessions` | Possession[] | 具体持有记录，包含物品引用、数量、使用方式、存放位置、品相与认主情况 |
| `resources` | Resource[] | 货币、宗门贡献等资源余额 |
| `relationships` | Relationship[] | 指向其他人物的有方向的关系描述 |
| `cognition` | Cognition[] | 重要知情、相信、怀疑和明确不知情的记录 |

### 字段边界与未知值

- `state.attributes` 使用有稳定 `key` 的状态项，每项有可读 `label` 和文本 `value`。修为、伤势、身份等按已知情况添加，不强制每本小说都有同一套修炼或身体属性。`location_id` 指向世界志节点，未知时为 `null`。
- `abilities.entry_id` 引用资料库的能力定义；`mastery` 保存该人物掌握程度，未知时为 `null`；`content` 补充个人限制和表现，不复制完整功法规则。
- `possessions.id` 标识本作品内的具体持有物或同质物品堆，`entry_id` 引用资料库的物品定义。两枚相同法宝如果损坏程度或认主情况不同，应是不同持有记录；可堆叠且状态相同的丹药可以用同一条记录的 `quantity` 表达。重要物品转移时保留具体物品 ID，移动持有记录，不能让同一物品同时出现在两个人的当前持有列表。
- `usage` 区分 `equipped`（正在装备/使用）、`carried`（随身携带）、`stored`（另处存放）、`unknown`（未明确）。`location` 用文本说明佩戴位置或存放处，`condition` 描述品相/损坏，`attunement` 描述认主或绑定，均允许 `null`。普通未独立建档物品的 `entry_id` 可以为 `null`，名称与必要描述仍保留；反复使用且自身有稳定规则的对象再进入资料库。
- 资源 `amount` 为非负数或 `null`，`unit` 明确计量单位。余额未知不能写成 `0`，不得自动换算尚未确定汇率的货币。货币数量在 `resources` 维护，不再在 `possessions` 维护同一份余额。
- 关系记录的 `character_id` 指向对方人物，`content` 从本人物的角度描述；不能据此自动推导对方态度相同。
- 认知使用 `kind`：`known`（已知）、`belief`（相信但未必为真）、`suspicion`（怀疑）、`unaware`（明确不知情）。`content` 必须表明人物视角；`unaware` 只在确有依据时记录，不能从条目缺失推导。`source_chapter_ids` 保存可追溯的正文依据；作者直接确认、尚无正文来源时允许空数组，来源类型的完整协议后续再定义。
- 顶层容器显式提供；没有记录时使用 `[]`，它只表示暂无记录，不证明人物没有能力、物品或关系。未知标量用 `null`，不能编造占位设定；非空字符串字段只在条目实际建立时要求提供。

### CharacterProfile schema（格式规则）

每个嵌套对象都限制未声明字段，`content` 字段均允许 Markdown。以下定义当前人物资料视图，不实现历史人物快照；历史章读取、版本与同步新鲜度仍需后续协议支持，不能用这份最新视图直接回答任意旧章的人物状态。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CharacterProfile",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "id", "name", "aliases", "summary", "content", "state", "abilities", "possessions", "resources", "relationships", "cognition"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1, "description": "格式版本" },
    "id": { "$ref": "#/$defs/id", "description": "稳定人物 ID" },
    "name": { "type": "string", "minLength": 1, "description": "当前姓名" },
    "aliases": { "type": "array", "uniqueItems": true, "items": { "type": "string", "minLength": 1 }, "description": "别名与称号" },
    "summary": { "type": "string", "description": "人物检索摘要" },
    "content": { "type": "string", "description": "画像、经历、性格与动机，允许 Markdown" },
    "state": { "$ref": "#/$defs/state", "description": "当前地点与已明确状态" },
    "abilities": { "type": "array", "items": { "$ref": "#/$defs/ability" }, "description": "已掌握的能力与掌握程度" },
    "possessions": { "type": "array", "items": { "$ref": "#/$defs/possession" }, "description": "装备、随身物品与另处存放的物品" },
    "resources": { "type": "array", "items": { "$ref": "#/$defs/resource" }, "description": "货币、贡献等资源余额" },
    "relationships": { "type": "array", "items": { "$ref": "#/$defs/relationship" }, "description": "本人物视角的人物关系" },
    "cognition": { "type": "array", "items": { "$ref": "#/$defs/cognition" }, "description": "重要认知与明确不知情记录" }
  },
  "$defs": {
    "id": { "type": "string", "minLength": 1 },
    "nullable_text": { "type": ["string", "null"], "minLength": 1 },
    "state": {
      "type": "object", "additionalProperties": false,
      "required": ["location_id", "attributes"],
      "properties": {
        "location_id": { "$ref": "#/$defs/nullable_text", "description": "所在世界志节点 ID；未知为 null" },
        "attributes": { "type": "array", "items": { "$ref": "#/$defs/state_attribute" }, "description": "按作品需要建立的状态项" }
      }
    },
    "state_attribute": {
      "type": "object", "additionalProperties": false,
      "required": ["key", "label", "value"],
      "properties": {
        "key": { "type": "string", "minLength": 1, "description": "状态项稳定键，同一人物内唯一" },
        "label": { "type": "string", "minLength": 1, "description": "可读名称，例如修为、伤势" },
        "value": { "type": "string", "minLength": 1, "description": "已经明确的状态描述" }
      }
    },
    "ability": {
      "type": "object", "additionalProperties": false,
      "required": ["entry_id", "mastery", "content"],
      "properties": {
        "entry_id": { "$ref": "#/$defs/id", "description": "资料库中的能力定义 ID" },
        "mastery": { "$ref": "#/$defs/nullable_text", "description": "掌握程度；未知为 null" },
        "content": { "type": "string", "description": "个人使用情况和限制，允许 Markdown" }
      }
    },
    "possession": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "entry_id", "name", "quantity", "usage", "location", "condition", "attunement", "content"],
      "properties": {
        "id": { "$ref": "#/$defs/id", "description": "具体物品或同质物品堆的稳定 ID" },
        "entry_id": { "$ref": "#/$defs/nullable_text", "description": "资料库物品定义 ID；未单独建档为 null" },
        "name": { "type": "string", "minLength": 1, "description": "持有物名称" },
        "quantity": { "type": ["integer", "null"], "minimum": 1, "description": "持有数量；未知为 null，耗尽则移出当前持有列表" },
        "usage": { "type": "string", "enum": ["equipped", "carried", "stored", "unknown"], "description": "装备、携带、存放或未明确" },
        "location": { "$ref": "#/$defs/nullable_text", "description": "佩戴位置或存放处" },
        "condition": { "$ref": "#/$defs/nullable_text", "description": "当前品相或损坏情况" },
        "attunement": { "$ref": "#/$defs/nullable_text", "description": "认主、绑定情况" },
        "content": { "type": "string", "description": "该持有物的个人经历或特殊情况，允许 Markdown" }
      }
    },
    "resource": {
      "type": "object", "additionalProperties": false,
      "required": ["key", "name", "amount", "unit", "content"],
      "properties": {
        "key": { "type": "string", "minLength": 1, "description": "资源类型稳定键，同一人物内唯一" },
        "name": { "type": "string", "minLength": 1, "description": "资源名称" },
        "amount": { "type": ["number", "null"], "minimum": 0, "description": "当前余额；未知为 null" },
        "unit": { "type": "string", "minLength": 1, "description": "数量单位" },
        "content": { "type": "string", "description": "个人余额相关说明，允许 Markdown" }
      }
    },
    "relationship": {
      "type": "object", "additionalProperties": false,
      "required": ["character_id", "content"],
      "properties": {
        "character_id": { "$ref": "#/$defs/id", "description": "对方人物 ID" },
        "content": { "type": "string", "minLength": 1, "description": "从本人物角度描述关系、态度与变化，允许 Markdown" }
      }
    },
    "cognition": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "kind", "content", "source_chapter_ids"],
      "properties": {
        "id": { "$ref": "#/$defs/id", "description": "认知记录稳定 ID" },
        "kind": { "type": "string", "enum": ["known", "belief", "suspicion", "unaware"], "description": "已知、相信、怀疑或明确不知情" },
        "content": { "type": "string", "minLength": 1, "description": "人物视角的具体认知，允许 Markdown" },
        "source_chapter_ids": { "type": "array", "uniqueItems": true, "items": { "$ref": "#/$defs/id" }, "description": "支持该认知记录的正文来源；尚无正文来源时为空" }
      }
    }
  }
}
```

除 schema 外，存储层还应检查引用属于同一作品且目标存在、状态和资源 `key` 不重复、能力引用不重复、持有物和认知 ID 不重复。名称与资料库显示名的一致性、持有物转移、数量变化以及认知与正文的一致性需由更新流程处理，不能只靠 JSON Schema 判断。

### 人物志完整数据示例

以下是虚构的林凡档案快照，所有结构字段完整保留。假定被引用的人物、世界节点、资料库条目和第 90 章已存在；此处示范人物格式，不创建那些目标档案，也不声称已经完成跨文件引用校验。

```json
{
  "schema_version": 1,
  "id": "character_lin_fan",
  "name": "林凡",
  "aliases": ["林师弟"],
  "summary": "青云宗外门弟子，筑基初期。谨慎，不愿欠人情，正在调查落星矿洞。左臂受伤，佩戴已认主的护心玉。",
  "content": "## 人物画像\n出身贫寒，习惯先观察再行动，不轻易相信别人的善意。\n\n## 核心动机\n希望查清父亲的死因，并获得不再受人摆布的能力。\n\n## 与沈砚的经历\n曾与沈砚共同执行外门差事，对他有旧日交情。",
  "state": {
    "location_id": "world_luoxing_mine",
    "attributes": [
      { "key": "identity", "label": "身份", "value": "青云宗外门弟子" },
      { "key": "cultivation", "label": "修为", "value": "筑基初期" },
      { "key": "injury", "label": "伤势", "value": "左臂受伤，尚未痊愈，长时间持剑会疼痛" }
    ]
  },
  "abilities": [
    {
      "entry_id": "library_yinqi_jue",
      "mastery": "第三层",
      "content": "已能稳定运转，但当前左臂伤势会影响行功。"
    },
    {
      "entry_id": "library_sword_control",
      "mastery": "初学",
      "content": "只能短距离控制飞剑，尚不能御剑载人。"
    }
  ],
  "possessions": [
    {
      "id": "item_huxin_jade_001",
      "entry_id": "library_huxin_jade",
      "name": "护心玉",
      "quantity": 1,
      "usage": "equipped",
      "location": "贴身佩戴于胸前",
      "condition": "表面有一道裂纹，仍可使用",
      "attunement": "已认主林凡",
      "content": "父亲留下的旧物。此前抵挡过一次袭击，留下裂纹。"
    },
    {
      "id": "item_huiqi_pills_001",
      "entry_id": "library_huiqi_pill",
      "name": "回气丹",
      "quantity": 3,
      "usage": "carried",
      "location": "腰间药袋",
      "condition": "完好",
      "attunement": null,
      "content": "进入矿洞前准备的补给。"
    },
    {
      "id": "item_broken_sword_001",
      "entry_id": null,
      "name": "断剑",
      "quantity": 1,
      "usage": "carried",
      "location": "随身储物袋内",
      "condition": "剑尖折断",
      "attunement": null,
      "content": "普通旧剑，尚未发现值得独立建档的特殊规则。"
    }
  ],
  "resources": [
    { "key": "low_grade_spirit_stone", "name": "下品灵石", "amount": 20, "unit": "枚", "content": "当前可用余额。" },
    { "key": "sect_contribution", "name": "宗门贡献", "amount": 100, "unit": "点", "content": "尚未兑换奖励。" }
  ],
  "relationships": [
    {
      "character_id": "character_shen_yan",
      "content": "外门旧识，有共同执行差事的交情；近期觉得他的行为反常，尚未当面质问。"
    }
  ],
  "cognition": [
    {
      "id": "cognition_lin_mist_harm",
      "kind": "known",
      "content": "知道矿洞下层黑雾会侵蚀神识。",
      "source_chapter_ids": ["chapter_0090"]
    },
    {
      "id": "cognition_lin_mist_breath",
      "kind": "belief",
      "content": "认为屏息可以避免黑雾影响，准备进入时闭气。",
      "source_chapter_ids": ["chapter_0090"]
    },
    {
      "id": "cognition_lin_shen_identity",
      "kind": "unaware",
      "content": "尚不知道沈砚的真实身份，仍把他视为普通外门弟子。",
      "source_chapter_ids": ["chapter_0090"]
    }
  ]
}
```

示例中的“屏息可以避免影响”是人物的错误相信，不能回写成世界规则。Writer 同时读取黑雾规则和林凡认知，才能写出“他带着错误判断行动”而不是让人物提前知道真相。

## 资料库：已确认的第一版结构

资料库采用一条资料一份结构化文件，保存功法、技能、法宝、丹药、材料及关键物品本身的规则。采用稳定公共字段、常用规则分区和可扩展属性，不为每个种类分别建立一套 schema，也不要求所有条目具备相同的特有属性。

| 字段 | 类型 | 含义 |
|---|---|---|
| `schema_version` | integer | 格式版本 |
| `id` | string | 资料条目的稳定 ID，供人物能力和持有物等引用 |
| `kind` | string | 条目类型，例如功法、技能、法宝；完整词表待定 |
| `name` | string | 条目名称 |
| `aliases` | string[] | 别名与其他称呼 |
| `summary` | string | 便于查找与筛选的摘要 |
| `effects` | string[] | 已确定的作用和效果 |
| `requirements` | string[] | 已确定的使用、修炼或触发条件 |
| `limitations` | string[] | 已确定的限制、代价或不能做到的事情 |
| `attributes` | Attribute[] | 品阶、元素、修复材料等特有属性 |
| `content` | string | 外观、背景、补充说明与明确未知，允许 Markdown |

### 扩展与一致性规则

- 每项扩展属性都有固定结构：`key` 是稳定标识，`label` 是可读名称，`value` 是文本、数字、布尔值或这些标量组成的列表，`unit` 是非空单位文本或 `null`。数字保留数值类型，不把单位拼进数字；描述型值仍可用自然语言。
- 同一条目内属性 `key` 唯一，同一作品中同义属性复用相同键；新增品阶、材料或成长条件一般只新增属性数据，不修改公共 schema。属性的具体含义、键名一致性和单位适配不能仅靠通用 JSON Schema 验证。
- 顶层字段显式提供；暂无记录的列表为 `[]`，不代表已确认没有效果、条件或限制。属性尚未确定时可以不建该属性，并在 `content` 中明确未知，不编造数值、用 `0` 或 `false` 代替未知。
- 规则各有一处完整说明：作用、条件和限制优先进入对应分区，其他特性进入 `attributes`；摘要可以概括，但不得与详细内容相互矛盾。
- 资料库记录对象定义，人物志记录掌握程度、持有数量、佩戴、存放、认主和损坏情况。扩展属性不用于偷偷维护某个人的具体持有状态。
- 普通一次性物件不因存在 schema 就必须单独建档。完整类型词表与更细的属性字典尚未确定，当前不强行按修仙题材封死所有种类。

### LibraryEntry schema（格式规则）

`additionalProperties: false` 保持每层结构受控；新增设定使用 `attributes`，不随意增加顶层字段。扩展值允许标量或一层标量列表，暂不接受任意嵌套对象；需要复杂结构时应明确演进 schema，而不是依赖无法校验的隐藏格式。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LibraryEntry",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "id", "kind", "name", "aliases", "summary", "effects", "requirements", "limitations", "attributes", "content"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1, "description": "格式版本" },
    "id": { "type": "string", "minLength": 1, "description": "稳定资料条目 ID" },
    "kind": { "type": "string", "minLength": 1, "description": "资料类型，例如 artifact；完整词表待定" },
    "name": { "type": "string", "minLength": 1, "description": "条目名称" },
    "aliases": { "type": "array", "uniqueItems": true, "items": { "$ref": "#/$defs/text" }, "description": "别名与其他称呼" },
    "summary": { "type": "string", "description": "检索摘要，与详细设定保持一致" },
    "effects": { "type": "array", "items": { "$ref": "#/$defs/text" }, "description": "已确定的作用与效果" },
    "requirements": { "type": "array", "items": { "$ref": "#/$defs/text" }, "description": "已确定的使用、修炼或触发条件" },
    "limitations": { "type": "array", "items": { "$ref": "#/$defs/text" }, "description": "已确定的限制和代价" },
    "attributes": { "type": "array", "items": { "$ref": "#/$defs/attribute" }, "description": "对象特有的可扩展属性" },
    "content": { "type": "string", "description": "外观、背景、补充说明和未知，允许 Markdown" }
  },
  "$defs": {
    "text": { "type": "string", "minLength": 1 },
    "scalar": {
      "type": ["string", "number", "boolean"],
      "minLength": 1,
      "description": "非空文本、数字或布尔值，必须是已确定的信息"
    },
    "attribute": {
      "type": "object",
      "additionalProperties": false,
      "required": ["key", "label", "value", "unit"],
      "properties": {
        "key": { "type": "string", "minLength": 1, "description": "属性稳定键，同一条目内唯一，同义属性在作品内复用" },
        "label": { "type": "string", "minLength": 1, "description": "可读属性名称" },
        "value": {
          "oneOf": [
            { "$ref": "#/$defs/scalar" },
            { "type": "array", "items": { "$ref": "#/$defs/scalar" } }
          ],
          "description": "已确定的属性值，或一层标量列表"
        },
        "unit": { "type": ["string", "null"], "minLength": 1, "description": "必要的计量单位；无单位或不适用时为 null" }
      }
    }
  }
}
```

资料 ID 唯一性、属性 `key` 唯一性和跨文档引用由存储层另行校验；JSON Schema 只验证结构和值类型，不证明小说设定正确。

### 资料库完整数据示例

以下为虚构的护心玉定义，保存物品本身的规则，不记录林凡所持有那枚玉的裂纹、数量或当前蓄能情况。扩展属性新增后仍遵循相同 schema。

```json
{
  "schema_version": 1,
  "id": "library_huxin_jade",
  "kind": "artifact",
  "name": "护心玉",
  "aliases": [],
  "summary": "一枚防御法宝，认主后可自动抵挡外力冲击。",
  "effects": [
    "受到外力冲击时释放护罩，保护佩戴者。"
  ],
  "requirements": [
    "完成认主并贴身佩戴。",
    "处于已蓄能状态。"
  ],
  "limitations": [
    "一次蓄能只能触发一次护罩。",
    "不能防御针对神识的攻击。"
  ],
  "attributes": [
    {
      "key": "grade",
      "label": "品阶",
      "value": "玄阶下品",
      "unit": null
    },
    {
      "key": "element",
      "label": "属性",
      "value": "土",
      "unit": null
    }
  ],
  "content": "## 外观\n青白色玉佩，正面刻有环形纹路。\n\n## 尚未确定\n重新蓄能的方法与护罩承受上限尚未确定。"
}
```

## 伏线：已确认的第一版结构

一条伏线一份文档，包含基本信息、埋设目的、揭开条件、当前进展、已确认推进记录和未来计划。此版先用于 MVP，后续根据实际写作效果调整；不将未来计划伪装成已经发生的剧情，也不将作者确定的幕后事实伪装成正文。

| 字段 | 类型 | 含义 |
|---|---|---|
| `schema_version` | integer | 格式版本 |
| `id` | string | 伏线稳定 ID |
| `title` | string | 伏线名称 |
| `summary` | string | 当前进展和作用的检索摘要 |
| `importance` | enum | `major` 重、`minor` 轻、`atmosphere` 氛围，沿用旧产品方案的分类 |
| `status` | enum | `open` 仍在展开、`resolved` 已完成兑现；部分揭开不自动视为全部兑现 |
| `truth` | string 或 null | 作者已经确定的背后真相；还没想好时为 null |
| `purpose` | string 或 null | 为什么埋这条线，希望产生什么叙事效果；未定时为 null |
| `reveal_condition` | string 或 null | 什么剧情条件成立后适合揭开；未定时为 null |
| `progress` | string 或 null | 根据已写正文对当前铺垫程度的判断；尚未判断时为 null |
| `related` | object | 相关人物、世界节点与资料库条目引用 |
| `events` | Event[] | 按故事推进排列的已确认记录，容纳多次埋设、幕后推进与揭开 |
| `future_plan` | object 或 null | 未来怎么走；可关联大纲节点，未决定时为 null |

`events` 分为两种结构：

- 正文事件：`kind` 为 `clue`（线索）或 `reveal`（揭开），包含 `chapter_id`、`excerpt` 和 `meaning`。`excerpt` 保存定稿正文中的原文片段，`meaning` 解释这一处与伏线的关系，未确定时可为 null。记录必须与实际正文一致，不由计划生成虚构引文。
- 幕后事件：`kind` 为 `behind_scenes`，包含 `at_chapter_id` 和 `content`。只接收作者已经确认的幕后事实，`at_chapter_id` 只标记对应故事位置，不作为正文证据；尚未定位时为 null。没有 `excerpt`，不提供假冒的正文出处。

`future_plan.content` 可以记录后续埋设、幕后行动或揭开安排，`outline_node_id` 关联未来剧情节点，尚未确定位置时为 null。它与 `truth` 职责不同：真相可以已定而揭开方式未定。计划修改不删除已经成立的事件；兑现后新增实际事件，更新剩余计划及状态，不覆盖旧线索。候选方案和初稿中的线索仍是任务材料，不直接进入已确认事件。

`truth` 回答秘密是什么，`purpose` 回答为什么值得写这个秘密；`reveal_condition` 描述适合揭开的剧情条件，`future_plan` 保存暂定的揭开位置与方式。到达大纲节点不等于自动满足揭开条件。`progress` 是结合正文形成的可更新判断，不是客观计分或作者新增设定，应说明具体已有铺垫及尚缺什么，不得仅凭“关系很好”等档案标签认定条件成立。

Context Agent 准备章节时综合读取这些信息和相关正文，将本章需要继续铺垫、推进怀疑、揭开或暂不触及伏线的具体要求整理进 Writing Brief。条件与原定计划不匹配时回到剧情讨论，不机械回收，也不擅自改变作者目的。目的和条件尚未明确时允许留白；这些字段提供判断依据，不保证模型必然产生预期效果。

`truth` 与 `meaning` 是作者视角的信息，不自动成为人物认知。`related` 只表达关联，不表示相关人物都知情；准备 Context 时仍需读取人物认知并区分信息适用者。氛围类沿用旧方案的“不自动催促或兑现”，不是必须完成的待办。

### ForeshadowThread schema（格式规则）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ForeshadowThread",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "id", "title", "summary", "importance", "status", "truth", "purpose", "reveal_condition", "progress", "related", "events", "future_plan"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1, "description": "格式版本" },
    "id": { "$ref": "#/$defs/text", "description": "伏线稳定 ID" },
    "title": { "$ref": "#/$defs/text", "description": "伏线名称" },
    "summary": { "type": "string", "description": "根据当前伏线信息整理的检索摘要" },
    "importance": { "type": "string", "enum": ["major", "minor", "atmosphere"], "description": "重、轻或氛围" },
    "status": { "type": "string", "enum": ["open", "resolved"], "description": "仍在展开或已经完成兑现" },
    "truth": { "$ref": "#/$defs/nullable_text", "description": "作者确定的背后真相；未定为 null" },
    "purpose": { "$ref": "#/$defs/nullable_text", "description": "埋设目的及希望产生的叙事效果；未定为 null" },
    "reveal_condition": { "$ref": "#/$defs/nullable_text", "description": "适合揭开所需的剧情条件；未定为 null，不等同于预定章号或节点" },
    "progress": { "$ref": "#/$defs/nullable_text", "description": "结合已写正文对铺垫程度的判断，包括已具备和欠缺之处；未判断为 null" },
    "related": { "$ref": "#/$defs/related", "description": "相关资料引用，不代表人物知情" },
    "events": {
      "type": "array",
      "description": "按故事推进排列的已确认事件，数组位置表达顺序",
      "items": {
        "oneOf": [
          { "$ref": "#/$defs/text_event" },
          { "$ref": "#/$defs/behind_scenes_event" }
        ]
      }
    },
    "future_plan": {
      "oneOf": [
        { "type": "null" },
        { "$ref": "#/$defs/future_plan" }
      ],
      "description": "尚未发生的安排；还没想好时为 null"
    }
  },
  "$defs": {
    "text": { "type": "string", "minLength": 1 },
    "nullable_text": { "type": ["string", "null"], "minLength": 1 },
    "id_list": { "type": "array", "uniqueItems": true, "items": { "$ref": "#/$defs/text" } },
    "related": {
      "type": "object", "additionalProperties": false,
      "required": ["character_ids", "world_node_ids", "library_entry_ids"],
      "properties": {
        "character_ids": { "$ref": "#/$defs/id_list", "description": "相关人物" },
        "world_node_ids": { "$ref": "#/$defs/id_list", "description": "相关世界志节点" },
        "library_entry_ids": { "$ref": "#/$defs/id_list", "description": "相关资料库条目" }
      }
    },
    "text_event": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "kind", "chapter_id", "excerpt", "meaning"],
      "properties": {
        "id": { "$ref": "#/$defs/text", "description": "事件稳定 ID" },
        "kind": { "type": "string", "enum": ["clue", "reveal"], "description": "已写线索或已写揭开" },
        "chapter_id": { "$ref": "#/$defs/text", "description": "实际定稿章节 ID" },
        "excerpt": { "$ref": "#/$defs/text", "description": "对应正文原文片段，不可凭空生成" },
        "meaning": { "$ref": "#/$defs/nullable_text", "description": "这一处与伏线的关系；未明确为 null" }
      }
    },
    "behind_scenes_event": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "kind", "at_chapter_id", "content"],
      "properties": {
        "id": { "$ref": "#/$defs/text", "description": "事件稳定 ID" },
        "kind": { "type": "string", "const": "behind_scenes" },
        "at_chapter_id": { "$ref": "#/$defs/nullable_text", "description": "对应故事位置，不是正文出处；未定位为 null" },
        "content": { "$ref": "#/$defs/text", "description": "作者已确认的幕后事实，允许 Markdown" }
      }
    },
    "future_plan": {
      "type": "object", "additionalProperties": false,
      "required": ["outline_node_id", "content"],
      "properties": {
        "outline_node_id": { "$ref": "#/$defs/nullable_text", "description": "计划关联的大纲节点；未定位为 null" },
        "content": { "$ref": "#/$defs/text", "description": "后续怎么推进或揭开的已接受安排，允许 Markdown" }
      }
    }
  }
}
```

JSON Schema 只检查结构；存储与更新流程还需校验事件 ID 唯一、引用存在且属于同一作品、正文事件的章节已定稿、引文与当前有效正文一致，并确保幕后事件确由作者确认。正文修改导致引文失效时必须重新核对记录；具体引用版本和定位协议仍待定义，不能仅因 ID 和 excerpt 字段非空就当成证据已验证。

### 伏线完整数据示例

以下是一组虚构示例，假设故事写到第 40 章，所引章节、原文和大纲节点均作为示例前提，未在作品中创建或核验。每种事件都完整展示自身字段；幕后事件没有正文引文字段是有意的格式差异，不是省略。

```json
{
  "schema_version": 1,
  "id": "foreshadow_shen_identity",
  "title": "沈砚的真实身份",
  "summary": "沈砚的举动多次露出破绽，林凡已开始怀疑，但尚未确认他的身份。",
  "importance": "major",
  "status": "open",
  "truth": "沈砚是赤霄门派来的卧底，最初利用林凡调查矿脉，后来逐渐产生真实交情。",
  "purpose": "让林凡在真正信任沈砚之后发现自己被利用，产生对旧日交情真假的冲突，而不仅是识破一个敌人。",
  "reveal_condition": "两人的信任已通过具体剧情建立，林凡愿意把重要事情托付给沈砚后再揭开；暂定位置见后续计划。",
  "progress": "目前线索已让林凡产生怀疑，但已写剧情尚未展现他向沈砚作出重要托付。关系仍停留在有交情的普通朋友，目标中的信任程度尚未写足。",
  "related": {
    "character_ids": ["character_shen_yan", "character_lin_fan"],
    "world_node_ids": ["world_qingyun", "world_luoxing_mine"],
    "library_entry_ids": []
  },
  "events": [
    {
      "id": "event_shen_token",
      "kind": "clue",
      "chapter_id": "chapter_0012",
      "excerpt": "沈砚看见令牌，脱口而出：赤霄门？随后又说，自己曾在集市见过。",
      "meaning": "沈砚对赤霄门令牌过于熟悉，但林凡当时接受了他的解释。"
    },
    {
      "id": "event_shen_message",
      "kind": "behind_scenes",
      "at_chapter_id": "chapter_0025",
      "content": "沈砚秘密传信，告知赤霄门矿洞重新开放。作者确认此事已经在幕后发生，正文未描写。"
    },
    {
      "id": "event_shen_seal",
      "kind": "clue",
      "chapter_id": "chapter_0040",
      "excerpt": "桌角落着一块封蜡。林凡拾起，看见背面压着一道熟悉的赤色纹路。",
      "meaning": "封蜡上的暗记与赤霄门有关，林凡开始怀疑沈砚。"
    }
  ],
  "future_plan": {
    "outline_node_id": "outline_outer_sect_tournament",
    "content": "在外门大比时，沈砚为了救林凡使用赤霄门秘术，暴露真实身份。"
  }
}
```

## 笔法：已确认的第一版结构

一本作品先保存一份笔法文档，由总体写法说明和一组带说明的认可范例组成。它随作者认可、修改正文和试写逐渐积累，不要求作者在开书前填写完整的文风或精神内核。

| 字段 | 类型 | 含义 |
|---|---|---|
| `schema_version` | integer | 格式版本 |
| `id` | string | 笔法文档的稳定 ID |
| `summary` | string | 当前笔法的简短介绍，方便检索和准备材料 |
| `content` | string | 总体写法说明，允许 Markdown，尚未确定时可为空字符串 |
| `examples` | StyleExample[] | 作者认可的范例；尚未积累时为 `[]` |

每条范例包含 `id`、`scope`（适用场景）、`guidance`（如何写）、`excerpt`（具体片段）、`rationale`（为何认可）和 `source`（来源）。适用场景不是固定枚举；日常、弱势冲突、大战等可以采用不同写法。不能因为某段范例使用短句，就推断全书都必须用短句。

`source` 区分 `chapter`（本作品定稿章节）、`trial`（试写）和 `reference`（作者提供的其他参考片段）。章节来源要求提供 `chapter_id`；试写和外部参考的 `chapter_id` 固定为 null，`description` 说明具体来源，不能伪装成本作品的已发生剧情。来源与片段不代表该片段对当前人物状态或剧情具有事实权威；即使来自旧定稿章，当前情境仍以当前任务相关事实为准。

### 使用与维护

- `content` 只记录已经认可的总体写法，例如叙述视角、作品稳定追求的阅读感受；当前阶段写法可直接说明适用范围，不要求作者维护卷级配置或填写主题口号。
- 作者要求“这一段短一点”只作用于当前修改；明确要求“以后类似场景都这样”时才沉淀为长期写法。反复出现的反馈可供 Agent 提炼，但不把一次局部意见自动推广成全书限制。
- 范例必须是作者认可的版本，未接受的候选试写不进入当前范例集。认可试写的写法不等于接受其中的全部设定。
- Context Agent 根据本章场景选择相关写法说明和少量范例，通常一至两段放入 Writing Package，而非把全部范例都给 Writer。这不是强制读取数量，也不要求每章都有对应范例。
- Writer 学习表达方式、节奏和信息组织，不照搬范例的措辞、人物或事件。解释范例为何有效，与保存片段本身同样必要。
- 范例应随作者反馈和故事阶段整理，移出不再适用的材料；历史保留机制另行定义。笔法更新不自动重写既有章节。

### WritingStyle schema（格式规则）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WritingStyle",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "id", "summary", "content", "examples"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1, "description": "格式版本" },
    "id": { "$ref": "#/$defs/text", "description": "笔法文档稳定 ID" },
    "summary": { "type": "string", "description": "当前笔法的简短介绍" },
    "content": { "type": "string", "description": "已认可的总体写法，允许 Markdown；尚未确定时可为空" },
    "examples": {
      "type": "array",
      "description": "作者认可的带说明范例，允许暂时为空",
      "items": { "$ref": "#/$defs/style_example" }
    }
  },
  "$defs": {
    "text": { "type": "string", "minLength": 1 },
    "style_example": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "scope", "guidance", "excerpt", "rationale", "source"],
      "properties": {
        "id": { "$ref": "#/$defs/text", "description": "范例稳定 ID" },
        "scope": { "$ref": "#/$defs/text", "description": "适用的场景、情境或阶段" },
        "guidance": { "$ref": "#/$defs/text", "description": "从范例中应采用的写法，允许 Markdown" },
        "excerpt": { "$ref": "#/$defs/text", "description": "被认可的具体片段，保留原文和分段" },
        "rationale": { "$ref": "#/$defs/text", "description": "这段为何有效、值得学习什么，允许 Markdown" },
        "source": {
          "description": "来源标识；试写和参考片段不构成本作品的剧情事实",
          "oneOf": [
            { "$ref": "#/$defs/chapter_source" },
            { "$ref": "#/$defs/non_chapter_source" }
          ]
        }
      }
    },
    "chapter_source": {
      "type": "object", "additionalProperties": false,
      "required": ["kind", "chapter_id", "description"],
      "properties": {
        "kind": { "type": "string", "const": "chapter", "description": "来自本作品定稿章节" },
        "chapter_id": { "$ref": "#/$defs/text", "description": "来源章节的稳定 ID" },
        "description": { "$ref": "#/$defs/text", "description": "具体来源场景与说明" }
      }
    },
    "non_chapter_source": {
      "type": "object", "additionalProperties": false,
      "required": ["kind", "chapter_id", "description"],
      "properties": {
        "kind": { "type": "string", "enum": ["trial", "reference"], "description": "试写或作者提供的其他参考片段" },
        "chapter_id": { "type": "null", "description": "不声称有本作品定稿章节出处" },
        "description": { "$ref": "#/$defs/text", "description": "试写场景、参考材料名称或来源位置等具体来源说明" }
      }
    }
  }
}
```

存储与整理流程另行校验范例 ID 唯一、章节引用存在且已定稿、片段确实来自所标来源，以及作者是否认可；JSON Schema 不能证明这些语义。章节或来源改动后需核对范例是否仍适用；版本与精确引用定位协议仍待定义。

### 笔法完整数据示例

以下为虚构示例，演示假设作者认可后的存储形式，不表示用户已经选择这段文字作为真实作品的笔法。片段来源是试写，因此没有章节 ID，不能自动成为林凡已经经历过的剧情。

```json
{
  "schema_version": 1,
  "id": "style_main",
  "summary": "第三人称，主要贴近林凡。弱势冲突通过动作和物件呈现压迫感，其他场景不强制沿用同一节奏。",
  "content": "## 总体写法\n第三人称，主要贴近林凡的感受。成长不仅体现为境界提高，也体现为他逐渐能自己做选择。\n\n## 情绪与后果\n日常可以轻松，重大损失要有后续影响。场景的镜头距离与句子节奏可以变化，不要求全书只用短句。",
  "examples": [
    {
      "id": "style_example_power_imbalance",
      "scope": "主角处于弱势，被权力更大的人刁难的近距离冲突场景。",
      "guidance": "用动作、物件和对话表现压迫感；情绪可以通过身体反应表达，不必每次直接解释。",
      "excerpt": "执事把木牌推回桌边。\n林凡伸手去接，他却又用两根手指按住。\n“还差一份担保。”\n身后有人催促。林凡收回手，站到队伍旁边，袖口攥出一道皱褶。",
      "rationale": "执事按住木牌，表现控制；林凡收手、攥袖口，表现忍耐。冲突明确发生，但人物没有直接喊出情绪；值得学习的是表达方式，不是照搬这些动作或把所有场面写成短句。",
      "source": {
        "kind": "trial",
        "chapter_id": null,
        "description": "用于校准弱势冲突写法的杂役院领差试写；本示例假定作者已认可该版本，不属于正式章节。"
      }
    }
  ]
}
```

## 尚待定义

七类长期内容均已有第一版 schema；当前是内容结构设计，不代表完整后端实现规格。世界志和资料库的完整类型词表，以及历史人物状态、版本、来源、派生资料新鲜度、同步记录与历史恢复的具体结构仍待细化。[Writing Brief](writing-brief.md) 已提供字段、schema 和完整示例草案，供本轮讨论；Context Pack、Writing Package 的数据结构及工具接口尚未定义。
