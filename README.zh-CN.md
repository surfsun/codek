# codek

`codek` 是一个终端里的编码智能体。它可以查看文件、搜索项目、修改或创建文件、在确认后执行 shell 命令，并在当前工作目录内维护一段简短的对话上下文。

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

默认情况下，`codek` 会连接本地 OpenAI 兼容服务：

```bash
OPENAI_BASE_URL=http://127.0.0.1:1234/v1
OPENAI_API_KEY=codek-local
```

npm 安装后，不要修改 npm 包目录里的文件。请把 `.env` 放到运行时目录：

```text
$HOME/.codek/.env        所有项目共用的用户默认配置
<project>/.env           当前项目配置；即运行 codek 的目录，或 --cwd 指定的目录
```

也可以显式指定配置文件：

```bash
codek --env /path/to/codek.env
CODEK_ENV_PATH=/path/to/codek.env codek
```

`.env` 的加载顺序是：`$HOME/.codek/.env`、项目 `.env`、`CODEK_ENV_PATH`、`--env`。后加载的文件会覆盖先加载的文件，但真实系统环境变量和命令行参数优先级更高。

`.env` 示例：

```bash
OPENAI_API_KEY="..."
OPENAI_BASE_URL="http://127.0.0.1:1234/v1"
```

也支持带 `export` 前缀的写法。

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

对话历史会以追加写入的 JSONL 文件保存在本地，便于后续总结和检索，而不需要每次都把完整历史发给模型。
项目记忆会单独保存，并可在交互式命令行里显式管理。
对话摘要会作为轻量索引保存。
日志按 CLI 会话保存。`events.jsonl` 记录智能体和工具事件，`llm.jsonl` 记录模型请求参数和流式响应，主要用于调试。

npm 安装后的 `codek` 默认会把用户数据保存到 `$HOME/.codek/projects/<project-hash>/`，不会写入 npm 包目录。

## 使用

交互模式：

```bash
codek
```

一次性任务：

```bash
codek "阅读这个仓库并说明如何运行"
codek --model google/gemma-4-e4b "给 README 添加发布说明"
```

常用参数：

```bash
codek --help
codek --version
codek --cwd /path/to/project
codek --env /path/to/codek.env
codek --max-run 900 "完成这个重构"
codek --yes "运行测试并修复失败"
codek --shell-approval ask "运行测试"
codek --shell-approval model "检查并修复 lint 错误"
codek --shell-approval allow "运行测试并修复失败"
codek --verbose "检查 CLI 入口"
```

shell 审批模式：

```text
ask     每条 shell 命令都询问
model   由模型判断是否需要审批；危险命令仍会询问
allow   始终允许执行 shell 命令
```

需要审批时，可以选择：

```text
Enter / 1   执行一次
2           当前会话中始终执行这条完全相同的命令
3           不执行，并停止当前任务
```

在交互式终端中，默认选择是 1。可以用上下方向键切换选项，然后按 Enter。

`--yes` 是 `--shell-approval allow` 的快捷方式。

交互式命令：

```text
/help    显示命令
/clear   清空对话上下文
/log     查看或切换终端调试输出：/log on、/log off
/model   交互式选择模型
/model current
         显示当前模型
/model list
         列出支持的模型
/model <name>
         切换到指定模型
/memory
         列出持久记忆
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
