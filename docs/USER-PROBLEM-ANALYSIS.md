# 用户痛点分析报告（Coding Agent 需求基线）

> 调查日期：2026-08-26
> 调查范围：`D:\zisonzishen\development` 全部项目 + `~/.codex`（Codex 会话数据库）
> 目的：从真实项目史提取 coding agent 可根治的痛点，作为 spica 后续改进的需求基线
> 状态：🟡 已记录，待实施（每项修复后更新 ✅）

---

## 一、调查方法与数据源

| 数据源 | 内容 |
|---|---|
| 20+ 个项目 | puttyon / AAPS / jch / pattern-seperator / PS / fabric / process / searcher / autocatalogue / g1oncontrol / label / wrong-style-detach / qrquote / wfyrag / webpage / literia-bun / auto-patternmaking 等 |
| git 历史 | puttyon 1290 commits、AAPS 156、jch 159、PS 136、searcher 108 等，分析 fix/revert 比例与提交内容 |
| 代码扫描 | 超大文件、空 catch、`any` 类型、TODO、仓库卫生 |
| Codex 数据库 | `logs_2.sqlite`（58,877 条日志）+ `state_5.sqlite`（147 线程）+ 97 个 rollout 文件（130,888 事件，12,773 次 shell 调用） |
| 项目文档 | 全部 CLAUDE.md / AGENTS.md / 审计报告 / 周报 / 踩坑记录 |

用户使用的 coding agent：Claude Code（CLAUDE.md 系）、Codex（147 sessions）、spica（自研）、pi。

---

## 二、核心数据（先看数字）

- puttyon 1290 commits 中 **43% 是 fix**（556 个），tryon 域 78 个 fix 高居榜首
- puttyon 前端 **3.1 万行，自动化测试 = 0**
- 5 个前端文件超 1000 行：CatalogBeta.tsx **4874**、i18n.tsx 3700、TryonResult.tsx 3668、api.ts 1446、Lookbook.tsx 1355
- **空 catch 53 个、`: any` 335 处**——7-30 审查时仅 9 个空 catch，修复后反而增长到 53（无持续检查机制）
- **两次审查发现同一类问题**：7-30（凭证明文/SSRF/无认证）→ 8-14（81 条，4 critical 仍为凭证明文/零鉴权/SSRF）
- Codex：147 sessions、12,773 次 shell 调用（平均每 session 132 次）、139 次中断、41 次上下文压缩、3 次回滚
- Codex 模型：90/147 用 deepseek-v4-flash；jch 单项目累计 **18 亿 tokens**（反复试错成本）
- Codex rules 中两条 `Remove-Item .git/index.lock` 后 commit 的规则——git 锁冲突是常态
- 用户手工沉淀的约定：puttyon 14 条"关键架构事实（容易搞错）"、pattern-seperator 12 条"关键约定（容易踩坑）"、AAPS 大篇幅"讨论确认口径"

---

## 三、问题清单

### A 类：Shell / Windows 环境（Codex 日志实证）

| # | 问题 | 证据 | 根因 |
|---|------|------|------|
| A1 | bash 语法混入 PowerShell | `tasklist 2>/dev/null` → `out-file : Could not find a part of the path 'D:\dev\null'` | agent 把 bash 习语写进 pwsh |
| A2 | GBK/UTF-8 编码崩溃 | `UnicodeEncodeError: 'gbk' codec can't encode` 反复出现；脚本输出 `????` mojibake | Windows 控制台默认 GBK |
| A3 | 命令超时无感知 | `command timed out after 124044 milliseconds` (exit 124) | 长命令无预判、无超时策略 |
| A4 | 依赖不在 PATH | `cmake: CommandNotFoundException`（agent-pedal 反复撞） | 环境探测缺失 |
| A5 | 磁盘满无预警 | `C1088: No space left on device`（JUCE 编译） | 无磁盘空间预检 |

**agent 层改进**：
- [ ] A1 shell 适配层：检测 pwsh，自动翻译常见 bash 语法（`2>/dev/null`→`2>$null`、`$VAR` 转义、`&&`/`;` 语义差异）
- [ ] A2 编码自动探测与统一：命令输出按 GBK 解码失败时回退 UTF-8，脚本生成带 `# -*- coding: utf-8 -*-` 与 `sys.stdout.reconfigure(encoding='utf-8')`
- [ ] A3 命令执行前超时预估（按命令类型）+ 超时后自动提供替代方案
- [ ] A4 环境预检工具：`spica doctor` 检测 node/python/java/cmake 等常用依赖并给出修复命令
- [ ] A5 bash 工具执行前检查磁盘剩余空间（<2GB 告警）

### B 类：验证与质量纪律（puttyon 实证）

| # | 问题 | 证据 | 根因 |
|---|------|------|------|
| B1 | 不跑测试就交付 | CLAUDE.md 明文"mvn test 全绿后方可提交" | 提示词纪律，无机制 |
| B2 | 前端零测试 | 3.1 万行 0 个测试文件 | agent 从未被要求写 |
| B3 | 修完的坑又长出来 | 空 catch 9→53 | 审查一次性，无持续检查 |
| B4 | 43% fix 提交率 | 556/1290 | 写代码质量低→返工常态 |
| B5 | 大文件无限膨胀 | CatalogBeta 4874 行 | 无拆分红线，读取也爆 context |

**agent 层改进**：
- [ ] B1 **验证闭环机制化**：edit/write 后自动跑项目验证命令（自动探测 package.json lint/test、mvn test），失败结果注入循环修复，连续失败 3 轮停止（P0）
- [ ] B3 **代码质量门**：提交/会话结束前扫描空 catch、`any` 滥用、console.log 残留、>800 行文件，生成报告（P1）
- [ ] B5 **大文件截断**：read 超 2000 行自动截断 + offset/limit 提示；>800 行文件编辑时提醒拆分（P1）
- [ ] B2 测试建议：新功能完成后提示"此改动缺少测试"，提供测试模板（P2）

### C 类：安全（两次审计实证）

| # | 问题 | 证据 |
|---|------|------|
| C1 | 凭据明文入库 | SEC-002：application.yml 密码 + OSS AK/SK，`${VAR:默认值}` 明文兜底 |
| C2 | 全 API 零鉴权 | SEC-001：24 个 Controller 180+ 接口无任何校验 |
| C3 | SSRF ×3 | SEC-003/004/006：ERP 图片下载、AI 配置、测试连接三个口子 |
| C4 | api_key 明文回显 | SEC-004：GET /api/settings 直接返回 |
| C5 | 修完再犯 | 7-30 与 8-14 两次审查高度重叠 |

**agent 层改进**：
- [ ] C1/C4 安全基线扫描器：检测写文件内容中的明文凭据模式（`password=`/`accessKey`/`api_key` 赋值）、`${VAR:默认值}` 兜底模式、无鉴权 Controller（P2）
- [ ] C3 SSRF 模式识别：`RestTemplate`/`fetch` 直接请求用户可控 URL 且无白名单时告警（P2）

### D 类：数据与资产保护（jch / AAPS 实证）

| # | 问题 | 证据 |
|---|------|------|
| D1 | 源文件被污染 | jch AGENTS.md："严禁覆盖源文件……（2026-08-07 污染教训）" |
| D2 | git 锁冲突 | codex rules 里 `Remove-Item .git/index.lock` 后 commit |
| D3 | 外部字段被猜 | AAPS："字段映射以权威版为准……部分字段已按 2026-08 核对结果修正" |
| D4 | 只读纪律靠约定 | AAPS 自己实现"代码层硬性只读保护" |

**agent 层改进**：
- [ ] D1 **只读保护区**：`.spica/settings.json` 配置 `readonlyPaths`（如 `samples/`、`*.JCH`），写工具硬拦截（P0）
- [ ] D2 **git 全局互斥锁**：agent 内所有 git 操作串行 + 锁文件等待机制，遇 index.lock 自动等待而非删锁（P1）
- [ ] D3 外部 schema 引用纪律：访问外部系统字段前先读权威映射文档，禁止直接猜字段名（P2，可用 skill 约束）

### E 类：记忆与上下文（所有项目实证）

| # | 问题 | 证据 |
|---|------|------|
| E1 | 反复踩同样的坑 | puttyon 14 条 + pattern-seperator 12 条"容易搞错/踩坑"约定——全部靠人写 |
| E2 | 长 session 上下文丢失 | Codex 41 次压缩、3 次回滚 |
| E3 | 领域知识不沉淀 | REPAINT_JOURNEY：onnx 外部权重被当垃圾删、NCHW、splice 时机——连环踩坑才总结 |
| E4 | 跨 session 无法检索 | 只有人工浏览，无搜索 |

**agent 层改进**：
- [ ] E1 **重复失败自动沉淀**：learnings 升级——同一工具/同一错误模式失败 ≥3 次自动提炼并写入 `.spica/learnings/`，新 session 自动注入（P1）
- [ ] E4 **会话全文搜索**：`spica search <query>` 检索全部存档 session（P1）
- [ ] E3 领域知识 skill 包：纺织图像处理（ONNX 外部数据/值域/NCHW）、ERP 接入、二进制逆向各自 SKILL.md，按项目挂载（P2）

### F 类：项目卫生（低优先级）

| # | 问题 | 证据 |
|---|------|------|
| F1 | venv/依赖进仓库 | AAPS `.venv`（9 万行文件）、`_erp/pi-ref` |
| F2 | 临时脚本堆积 | puttyon 38 个、AAPS 34 个 `_`/`test` 脚本入 git |
| F3 | 废弃项目不清理 | puttyon-main（Flask 旧版）、`backend/` Express 废弃、空目录 ×2 |

**agent 层改进**：
- [ ] F1/F2 临时脚本自动归档提醒：`.gitignore` 建议、`_` 前缀脚本检测（P3）

---

## 四、改进路线图

| 优先级 | 改进项 | 对应问题 | 工作量 | 状态 |
|---|---|---|---|---|
| **P0** | 验证闭环机制化（edit→自动验证→修复循环） | B1/B4 | 小 | 🟡 |
| **P0** | 危险操作确认门（rm -rf / 覆盖写 / git 危险操作） | D1 | 小 | 🟡 |
| **P0** | Shell 适配层（pwsh 语法翻译、编码探测、环境预检） | A1/A2/A4 | 中 | 🟡 |
| **P1** | 只读保护区（路径级硬拦截） | D1/D4 | 小 | 🟡 |
| **P1** | git 全局互斥锁 | D2 | 小 | 🟡 |
| **P1** | 重复失败自动沉淀记忆 + 会话搜索 | E1/E4 | 中 | 🟡 |
| **P1** | 大文件截断 + 拆分提醒 | B5 | 小 | 🟡 |
| **P2** | 安全基线扫描（凭据/鉴权/SSRF） | C1-C5 | 中 | 🟡 |
| **P2** | 领域知识 skill 包（纺织图像/ERP/逆向） | E3 | 中 | 🟡 |
| **P3** | eval 回放（golden session） | B4 长期 | 大 | 🟡 |

**验收原则**：每项修复必须带 vitest 测试（沿用仓库现有 69 测试文件体系）；修复后更新本文档状态为 ✅。

---

## 五、非 agent 层问题（明确不做）

- 工序数据本身混乱（4794 个唯一工序名）——数据治理问题
- ERP 外部系统缺陷——供应商问题
- 废弃项目清理——人的决策
