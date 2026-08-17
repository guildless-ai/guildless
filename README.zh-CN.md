# Guildless（简体中文）

![Guildless](assets/guildless-icon.png)

Guildless 是一个本地优先的 AI 企业运营 OS，把企业目标连接到调研、决策、执行、证据和可验证收款。

用户只需要输入一个结果，例如：

> 让这家公司增长，在30天内把月收入增加100万日元。

Guildless 会在许可范围内恢复公司的资产、已验证能力、客户、分发渠道和资金约束；研究市场、成功案例、失败案例、竞争对手、客户和销售渠道；比较多种策略；选择最快的现金化方案；只在批准边界内执行；并用证据记录真实收款。

## 产品循环

```text
目标
  ↓ 公司理解（事实 + 证据）
能力缺口
  ↓ Local → GitHub → public-apis → npm/PyPI → Hugging Face → MCP → Browser/Web
策略选项 → Money Bet
  ↓ 在批准范围内执行
已验证的收入 / 结果
  ↓ 学习并生成下一次决策
```

经营者界面只显示 Guildless 正在调查什么、发现了什么、当前决定、下一步、是否需要人工介入，以及已经验证的现金。模型名、Agent名、工具调用和内部任务图放在开发者诊断界面中。

## 包含内容

- `guildless verify`：对commit、命令、HTTP endpoint和验证范围进行确定性检查
- `python/guildless_v0/core/`：带证据的 Money Intelligence、Money Playbook Compiler、Capability Graph 和 Money Bet
- `python/guildless_v0/core/artifacts.py`：成果物要求、质量门禁和 Asset Ledger
- `capability-acquisition/`：跨 Local、GitHub、public APIs、包、模型、MCP 和浏览器路径发现并验证能力
- `docs/`：Executive Operating View 和运行边界

`public-apis/public-apis` 只是候选目录，不是执行白名单。注册前必须重新确认官方文档、可用性、认证、价格、商业使用、速率限制并完成测试请求。

Playbook会被编译为五类 Capability Graph，与现有Registry自动比较，并把能力缺口交给 Autonomous Discovery Engine，而不是要求用户选择工具。发现了多少仓库不是成功指标；最终指标是有证据的 `cash_confirmed`。详见 [`docs/money-playbook-compiler.md`](docs/money-playbook-compiler.md)。

成果物 Definition of Done 与 Asset Ledger 规则见 [`docs/artifact-system.md`](docs/artifact-system.md)。GitHub 不是所有成果物的默认发布渠道。

## 开发

```sh
npm install
npm run check
npm test
npm run build
npm run lint
python python/run_tests.py
node capability-acquisition/test_acquisition.js
```

## 安全边界

- 未批准前不发送外部消息、不签约、不付款、不发布、不删除
- 不直接读取 Founder Memory 原始数据库或 Historical Benchmark 原始数据库
- 事实和推断分离，事实必须保留证据
- 候选发现与采用分离，不执行未验证的 OSS/API
- 线索、回复、会议和合同不是收入；只有有证据的真实收款才算已验证收入

## 许可证

MIT License。新增第三方代码保留其许可证、NOTICE和来源commit。
