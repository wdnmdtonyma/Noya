# 章节检查结果：第一版 schema 草案

本文把已经确认的质量门禁、编辑建议和反馈粒度落实为结构化交接格式，供本轮对账；具体字段设计尚待确认。它是写作任务内的检查产物，不是第八类长期 Context，不改变正式剧情，也不代表作者已经定稿。流程边界见 [Writing Brief 设计](writing-brief.md)。

这里只定义正文检查结果，不同时定义 Chapter Plan 的评审格式，不新增 Agent、评分、固定修改轮次或试写实验。使用 JSON Schema Draft 2020-12 描述结构，不限定落盘编码；说明性文本允许 Markdown。所有字段显式提供，拒绝未声明字段，不自动补值或转换类型。

## 结构与职责

| 字段 | 回答的问题 |
|---|---|
| `schema_version` | 使用哪个格式版本？ |
| `chapter_id` | 检查哪一章？ |
| `checks` | 四项门禁各自检查出了什么结论？ |
| `feedback` | 具体哪里有问题、依据是什么、希望怎样修正？ |

`checks` 必须包含以下四项，不用空反馈列表代替检查结论：

| 字段 | 检查范围 |
|---|---|
| `requirements` | 是否符合已接受的写作要求 |
| `character_motivation` | 动机是否有符合人设、关系、认知和处境的支撑 |
| `possessions_and_abilities` | 角色的持有物、掌握能力及其当时状态是否正确 |
| `ability_rules` | 道具和法术的效果、条件、代价、限制是否正确 |

每项使用 `passed`、`failed` 或 `needs_verification`。第三种表示检查遇到了资料不足或冲突，不能证明通过，也不能冒充已证实的错误。尚未开始或被中断的检查不提交为完整检查结果，任务运行状态另行处理。

每条 `feedback` 包含：

| 字段 | 含义 |
|---|---|
| `kind` | `violation` 明确冲突；`needs_verification` 待核实；`suggestion` 编辑建议 |
| `category` | 对应四项门禁之一；编辑建议使用 `expression` |
| `location` | 原文摘录及定位说明，回答“哪里有问题” |
| `reason` | 具体问题及判断理由，回答“为什么” |
| `evidence` | 支撑判断的来源 ID、来源内位置和原文摘录 |
| `revision_goal` | 修正目标，不必提供替换正文；待核实项为 `null` |

待核实项的 `reason` 说明缺什么依据，留给 Context Agent 补查，不要求 Writer 自行补造事实。补查后仍无法判断时如何处理仍待讨论，此格式不决定必须询问作者或必须继续修改。

### 定位与来源

- `location.excerpt` 是被检查正文中的原文，`description` 说明场景和位置，帮助区分重复文本。
- 对“要求发生的事件完全没写”这种遗漏，`excerpt` 可以为 `null`，`description` 必须明确说明缺失内容与应检查的范围，不能编造原文。
- `evidence` 的 `source_id` 指向本次 Brief 或作品资料的稳定 ID；`locator` 指出字段或段落；`excerpt` 是该处原文，而不是检查者自己的结论。自己的推断写在 `reason`。
- 明确冲突至少有一条来源证据；待核实项与编辑建议允许 `evidence: []`。不把“人物志没有记录”引用成“这个人物不会”的证据。
- 当前格式中的位置说明用于阅读和定位，不是可以自动执行的文本替换地址。

结果只适用于本次实际检查的正文和要求、资料。`chapter_id` 只是章节身份，不足以识别正文版本；运行层必须把结果关联到本次检查输入，正文或相关依据变化后不能复用旧结论。关联方式随任务版本协议定义，本草案不引入完整 Context 冻结或复制所有资料。

## ChapterReview schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ChapterReview",
  "description": "一次章节正文检查的四项结论及具体反馈，不代表作者定稿或文学质量评分",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "chapter_id", "checks", "feedback"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1, "description": "检查结果的格式版本" },
    "chapter_id": { "$ref": "#/$defs/text", "description": "被检查章节的稳定 ID，不替代正文版本关联" },
    "checks": {
      "type": "object",
      "description": "四项门禁的检查结论，所有项必须显式提供",
      "additionalProperties": false,
      "required": ["requirements", "character_motivation", "possessions_and_abilities", "ability_rules"],
      "properties": {
        "requirements": { "$ref": "#/$defs/check_status", "description": "本次写作要求的符合性" },
        "character_motivation": { "$ref": "#/$defs/check_status", "description": "人物动机与人设及剧情依据的一致性" },
        "possessions_and_abilities": { "$ref": "#/$defs/check_status", "description": "人物持有物、掌握能力及其当时状态的正确性" },
        "ability_rules": { "$ref": "#/$defs/check_status", "description": "道具和法术的效果、条件、代价与限制的正确性" }
      }
    },
    "feedback": {
      "type": "array",
      "description": "明确冲突、待核实事项和编辑建议；无反馈时显式为空数组",
      "items": { "$ref": "#/$defs/feedback_item" }
    }
  },
  "$defs": {
    "text": { "type": "string", "minLength": 1, "pattern": "\\S", "description": "至少包含一个非空白字符的文本，允许 Markdown" },
    "check_status": {
      "type": "string",
      "enum": ["passed", "failed", "needs_verification"],
      "description": "已检查通过、存在明确冲突，或证据不足待核实"
    },
    "location": {
      "type": "object",
      "description": "被检查正文中的问题位置，遗漏问题允许没有可摘录原文",
      "additionalProperties": false,
      "required": ["excerpt", "description"],
      "properties": {
        "excerpt": {
          "description": "当前正文的原文摘录；问题是内容遗漏时为 null",
          "anyOf": [{ "$ref": "#/$defs/text" }, { "type": "null" }]
        },
        "description": { "$ref": "#/$defs/text", "description": "场景和位置说明；遗漏问题需说明缺失内容与检查范围" }
      }
    },
    "evidence": {
      "type": "object",
      "description": "一条可回查的要求或作品依据，摘录与检查者的推断分开",
      "additionalProperties": false,
      "required": ["source_id", "locator", "excerpt"],
      "properties": {
        "source_id": { "$ref": "#/$defs/text", "description": "Writing Brief、章节或作品资料条目的稳定 ID" },
        "locator": { "$ref": "#/$defs/text", "description": "来源内的字段或段落位置，例如 limitations[1]" },
        "excerpt": { "$ref": "#/$defs/text", "description": "来源该处的原文摘录，不填写模型自行推导的结论" }
      }
    },
    "feedback_item": {
      "type": "object",
      "description": "一项具体检查反馈：区分性质并提供位置、理由、来源与修正目标",
      "additionalProperties": false,
      "required": ["kind", "category", "location", "reason", "evidence", "revision_goal"],
      "properties": {
        "kind": {
          "type": "string",
          "enum": ["violation", "needs_verification", "suggestion"],
          "description": "明确冲突、待核实事项或非阻断的编辑建议"
        },
        "category": {
          "type": "string",
          "enum": ["requirements", "character_motivation", "possessions_and_abilities", "ability_rules", "expression"],
          "description": "问题归属的门禁项；普通编辑建议归入 expression"
        },
        "location": { "$ref": "#/$defs/location", "description": "问题在被检查正文中的具体位置" },
        "reason": { "$ref": "#/$defs/text", "description": "具体问题与判断理由；待核实项说明当前缺失或冲突的依据" },
        "evidence": {
          "type": "array",
          "items": { "$ref": "#/$defs/evidence" },
          "description": "来源证据；明确冲突至少一条，其他类型允许为空"
        },
        "revision_goal": {
          "description": "希望达到的修正效果；待核实项为 null，不把不确定性转成修改指令",
          "anyOf": [{ "$ref": "#/$defs/text" }, { "type": "null" }]
        }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "violation" } } },
          "then": {
            "properties": {
              "evidence": { "minItems": 1 },
              "revision_goal": { "$ref": "#/$defs/text" }
            }
          }
        },
        {
          "if": { "properties": { "kind": { "const": "needs_verification" } } },
          "then": { "properties": { "revision_goal": { "type": "null" } } }
        },
        {
          "if": { "properties": { "kind": { "const": "suggestion" } } },
          "then": {
            "properties": {
              "category": { "const": "expression" },
              "revision_goal": { "$ref": "#/$defs/text" }
            }
          },
          "else": {
            "properties": {
              "category": { "enum": ["requirements", "character_motivation", "possessions_and_abilities", "ability_rules"] }
            }
          }
        }
      ]
    }
  }
}
```

### Schema 之外的一致性校验

以下规则需要程序校验，不由上面的 JSON Schema 自动保证：

1. 对同一门禁项，有 `violation` 则结论必须为 `failed`；没有明确冲突但有 `needs_verification` 则为 `needs_verification`；二者都没有才可为 `passed`。一项同时有错误和疑点时为 `failed`，但必须保留待核实反馈。
2. 每个 `failed` 或 `needs_verification` 都必须有相应反馈，不能只有一个失败标签而不解释原因。
3. 来源 ID 必须属于当前作品或任务，定位及摘录必须能回查；正文摘录必须来自实际被检查的版本。全章遗漏和证据推理是否成立仍需要语义判断。
4. 四项均为 `passed` 才表达本次四项门禁通过；`suggestion` 不改变这个结论。不增加另一份由模型自由填写、可能与四项结论冲突的总分或通过标记。

结构和引用校验都不能证明模型真的检查充分、动机判断正确或作品好看。此文件不实现运行层和版本协议。

## 完整示例一：一项明确错误、一项待核实、一条编辑建议

以下为交接数据示例，不是试写章节或正式剧情。假定同一份待检查正文中出现下述三处片段；检查者已检查四项，未发现要求和动机问题。护心玉引用沿用 `context-types.md` 中的资料库示例；清心诀的掌握情况尚缺可靠依据。

```json
{
  "schema_version": 1,
  "chapter_id": "chapter_0091",
  "checks": {
    "requirements": "passed",
    "character_motivation": "passed",
    "possessions_and_abilities": "needs_verification",
    "ability_rules": "failed"
  },
  "feedback": [
    {
      "kind": "violation",
      "category": "ability_rules",
      "location": {
        "excerpt": "护心玉亮起，将侵入识海的神识攻击尽数挡下。",
        "description": "矿道遇袭场景，第一波神识攻击的应对段落。"
      },
      "reason": "正文让护心玉抵挡神识攻击，与其明确的能力限制冲突。",
      "evidence": [
        {
          "source_id": "library_huxin_jade",
          "locator": "limitations[1]",
          "excerpt": "不能防御针对神识的攻击。"
        }
      ],
      "revision_goal": "修改这次攻击的应对方式，不扩大护心玉的能力；替代方式也必须符合人物已有能力和当前处境。"
    },
    {
      "kind": "needs_verification",
      "category": "possessions_and_abilities",
      "location": {
        "excerpt": "林凡随即运转清心诀，压住识海中的余痛。",
        "description": "矿道遇袭场景，第一波攻击结束后的恢复段落。"
      },
      "reason": "当前材料不足以确认林凡是否学过清心诀，需要补查其习得能力的相关章节；不能仅因人物志未记录便认定他不会。",
      "evidence": [],
      "revision_goal": null
    },
    {
      "kind": "suggestion",
      "category": "expression",
      "location": {
        "excerpt": "他挥剑，对方挡住。他再挥剑，对方再次挡住。",
        "description": "矿道遇袭场景，中段交锋的连续动作描写。"
      },
      "reason": "连续动作重复，尚未表现试探结果或处境变化，推进感较弱；这不构成已确认的设定或要求冲突。",
      "evidence": [],
      "revision_goal": "压缩重复动作，突出已有交锋中的变化，不为增加刺激擅自引入新法术或改变既定结果。"
    }
  ]
}
```

Context Agent 补查待核实项，把已证实的问题及适用的编辑建议交给 Writer；局部修正仍可自己处理。Writer 不把 `needs_verification` 当成必须删掉清心诀的指令。修改后按四项门禁重新检查当前整章。

## 完整示例二：四项门禁通过，没有追加反馈

假定错误已修复、待核实事项已得到可靠确认，并完成整章复查；不是仅删掉旧反馈就视为通过。

```json
{
  "schema_version": 1,
  "chapter_id": "chapter_0091",
  "checks": {
    "requirements": "passed",
    "character_motivation": "passed",
    "possessions_and_abilities": "passed",
    "ability_rules": "passed"
  },
  "feedback": []
}
```

四项通过但仍有编辑建议也合法：保留对应 `suggestion` 即可，不把门禁改为失败。通过门禁不等于作者定稿，也不意味着所有主观编辑意见都已采纳。
