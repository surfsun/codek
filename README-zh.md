# codek

`codek` 是一个终端编码智能代理。它可以检查文件、搜索项目、修改或写入文件、在审批后执行 shell 命令，并在当前目录下维护简短的对话上下文。

## 安装

```bash
npm i -g codek
```

本地开发：

```bash
npm install
npm run build
npm link
```

## 配置

默认情况下，`codek` 连接本地 OpenAI 兼容服务：

```bash
OPENAI_BASE_URL=http://127.0.0.1:1234/v1
OPENAI_API_KEY=codek-local
```

你也可以将本地服务配置放在 `.env` 文件中：

```bash
export OPENAI_API_KEY="..."
export OPENAI_BASE_URL="http://127.0.0.1:1234/v1"
```

可选环境变量：

```bash
export OPENAI_BASE_URL="https://api.openai.com/v1"
export CODEK_MODEL="google/gemma-4-e4b"
export CODEK_MODELS="deepseek-v4-flash,google/gemma-4-e4b,gpt-4.1,gpt-4.1-mini"
export CODEK_MAX_RUN_MS="600000"
export CODEK_MAX_STEPS="200"
export CODEK_SHELL_APPROVAL_MODE="model"
export CODEK_HISTORY="on"
export CODEK_HISTORY_PATH="$HOME/.codek/projects/my-project/history.jsonl"
export CODEK_MEMORY="on"
export CODEK_MEMORY_PATH="$HOME/.codek/projects/my-project/memory.json"
export CODEK_SUMMARIES="on"
export CODEK_SUMMARY_PATH="$HOME/.codek/projects/my-project/summaries.jsonl"
export CODEK_LOGS="on"
export CODEK_LOG_DIR="$HOME/.codek/projects/my-project/logs"
```

对话历史以只追加的 JSONL 格式本地存档。这使得原始对话可用于后续的总结和检索，而无需将所有历史消息发送到每次新的提示中。

项目记忆单独存储，可以通过交互式提示符显式管理。

对话摘要作为轻量级索引存储，便于后续检索。

日志按 CLI 会话存储。`events.jsonl` 记录代理/工具事件，`llm.jsonl` 记录模型请求参数和流式响应，用于调试。

默认情况下，通过 npm 安装的 `codek` 将用户数据存储在 `$HOME/.codek/projects/<项目哈希>/` 下，而不是 npm 包目录内。

## 使用方式

交互模式：

```bash
codek
```

单次模式：

```bash
codek "阅读这个仓库并解释如何运行它"
codek --model google/gemma-4-e4b "为 README 添加发布说明"
```

常用参数：

```bash
codek --help
codek --version
codek --cwd /path/to/project
codek --max-run 900 "完成这次重构"
codek --yes "运行测试并修复失败"
codek --shell-approval ask "运行测试"
codek --shell-approval model "检查并修复 lint 错误"
codek --shell-approval allow "运行测试并修复失败"
codek --verbose "检查 CLI 入口"
```

Shell 审批模式：

```text
ask     每个 shell 命令都询问
model   由模型决定是否需要审批；危险命令仍会询问
allow   始终执行命令
```

当需要审批时，选择：

```text
Enter / 1   执行一次
2           在当前会话始终执行此命令
3           不执行并停止当前任务
```

在交互式终端中，默认选择选项 1。使用上下方向键切换选项，然后按 Enter 确认。

`--yes` 是 `--shell-approval allow` 的快捷方式。

交互命令：

```text
/help    显示帮助
/clear   清除对话历史
/log     显示或更改终端调试输出：/log on, /log off
/model   交互式选择模型
/model current
         显示当前模型
/model list
         列出支持的模型
/model <name>
         切换到指定模型
/memory
         列出持久化记忆
/memory add <text>
         添加一条项目记忆
/memory forget <id>
         删除一条记忆
/summary
         列出最近的对话摘要
/exit    退出
```

## 发布

```bash
npm run build
npm publish
```
