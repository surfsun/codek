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

You can also put your local service config in `.env`:

```bash
export OPENAI_API_KEY="..."
export OPENAI_BASE_URL="http://127.0.0.1:1234/v1"
```

Optional environment variables:

```bash
export OPENAI_BASE_URL="https://api.openai.com/v1"
export CODEK_MODEL="google/gemma-4-e4b"
export CODEK_MODELS="deepseek-v4-flash,google/gemma-4-e4b,gpt-4.1,gpt-4.1-mini"
export CODEK_MAX_STEPS="50"
export CODEK_SHELL_APPROVAL_MODE="model"
```

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
codek --yes "run tests and fix failures"
codek --shell-approval ask "run tests"
codek --shell-approval model "inspect and fix lint errors"
codek --shell-approval allow "run tests and fix failures"
codek --verbose "inspect the CLI entrypoint"
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
/log     show or change verbose logging: /log on, /log off, /log toggle
/model   choose model interactively
/model current
         show current model
/model list
         list supported models
/model <name>
         switch to a model by name
/exit    quit
```

## Publish

```bash
npm run build
npm publish
```
