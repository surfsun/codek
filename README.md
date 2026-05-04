# codek

`codek` is a terminal coding agent. It can inspect files, search a project, write files, run shell commands with approval, and keep a short conversation context while working in the current directory.

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
export CODEK_MODEL="gpt-4.1-mini"
export CODEK_MAX_STEPS="20"
```

## Usage

Interactive mode:

```bash
codek
```

One-shot mode:

```bash
codek "read this repo and explain how to run it"
codek --model gpt-4.1-mini "add a README section for publishing"
```

Useful flags:

```bash
codek --help
codek --version
codek --cwd /path/to/project
codek --yes "run tests and fix failures"
codek --verbose "inspect the CLI entrypoint"
```

Interactive commands:

```text
/help    show commands
/clear   clear conversation history
/model   show current model
/exit    quit
```

## Publish

```bash
npm run build
npm publish
```
