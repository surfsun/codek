# codek

`codek` is a terminal coding agent. It can inspect files, search a project, patch or write files, run shell commands with approval, and keep a short conversation context while working in the current directory.

## Install

```bash
npm i -g codek
```

For local development:

```bash
npm install
npm run build
npm link
```

## Configuration

By default, `codek` targets a local OpenAI-compatible service:

```bash
OPENAI_BASE_URL=http://127.0.0.1:1234/v1
OPENAI_API_KEY=codek-local
```

After installing from npm, do not edit files inside the npm package directory. Put `.env` in one of these runtime locations:

```text
$HOME/.codek/.env        user defaults for every project
<project>/.env           project-specific config; this is the directory where you run codek or pass with --cwd
```

You can also load an explicit file:

```bash
codek --env /path/to/codek.env
CODEK_ENV_PATH=/path/to/codek.env codek
```

`.env` values are loaded in this order: `$HOME/.codek/.env`, project `.env`, `CODEK_ENV_PATH`, then `--env`. Later files override earlier files, but real system environment variables and command-line flags still take precedence.

Example `.env`:

```bash
OPENAI_API_KEY="..."
OPENAI_BASE_URL="http://127.0.0.1:1234/v1"
```

Lines prefixed with `export` are also accepted.

Optional environment variables:

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
export CODEK_LLM_TRACE="off"
```

Conversation history is archived locally as append-only JSONL. This keeps raw conversations available for later summarization and retrieval without sending every past message into each new prompt.
Project memories are stored separately and can be managed explicitly from the interactive prompt.
Conversation summaries are stored as a lightweight index for later retrieval.
Logs are stored per CLI session. `events.jsonl` records agent/tool events, while `llm.jsonl` records model request parameters and streamed responses for debugging.
LLM requests and responses are recorded to `llm.jsonl` when logs are enabled. Use `/llm list` in interactive mode to browse them without interrupting the normal answer stream. Use `CODEK_LLM_TRACE=compact` or `--llm-trace` only when you need live terminal tracing.

By default, npm-installed `codek` stores user-owned data under `$HOME/.codek/projects/<project-hash>/` instead of inside the npm package directory.

## Usage

Interactive mode:

```bash
codek
```

One-shot mode:

```bash
codek "read this repo and explain how to run it"
codek --model google/gemma-4-e4b "add a README section for publishing"
```

Useful flags:

```bash
codek --help
codek --version
codek --cwd /path/to/project
codek --max-run 900 "finish this refactor"
codek --yes "run tests and fix failures"
codek --shell-approval ask "run tests"
codek --shell-approval model "inspect and fix lint errors"
codek --shell-approval allow "run tests and fix failures"
codek --verbose "inspect the CLI entrypoint"
codek --llm-trace "show live model traffic while answering"
codek --llm-trace full "debug the full live prompt and response stream"
```

Shell approval modes:

```text
ask     ask before every shell command
model   let the model decide whether a shell command needs approval; dangerous commands still ask
allow   always execute shell commands
```

When approval is required, choose:

```text
Enter / 1   execute once
2           always execute this exact command for the current session
3           do not execute and stop the current task
```

In an interactive terminal, option 1 is selected by default. Use the up/down arrow keys to switch options, then press Enter.

`--yes` is kept as a shortcut for `--shell-approval allow`.

Interactive commands:

```text
/help    show commands
/clear   clear conversation history
/log     show or change terminal debug output: /log on, /log off
/llm     show LLM recording status
/llm list
         browse recorded LLM requests and responses
/llm live on
         show live LLM traffic in the terminal
/llm live off
         stop live LLM traffic output
/model   choose model interactively
/model current
         show current model
/model list
         list supported models
/model <name>
         switch to a model by name
/memory
         list durable memories
/memory add <text>
         add a project memory
/memory forget <id>
         remove a memory
/summary
         list recent conversation summaries
/exit    quit
```

## Publish

```bash
npm run build
npm publish
```
