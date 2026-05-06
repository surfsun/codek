# codek production roadmap

This roadmap keeps codek lightweight while moving it toward real production use.

## Principles

- Keep the agent loop small and auditable.
- Persist raw conversation history before building clever memory.
- Inject summaries and stable memories, not entire historical conversations.
- Prefer explicit lifecycle events over hidden terminal output.
- Make model, prompt, storage, and approval behavior configurable.

## Phase 1: Agent foundation

Status: in progress.

- Model selection: support curated model profiles and interactive switching.
- Agent lifecycle events: expose state changes for terminal UI and future telemetry.
- Prompt composition: split system, memory, and fallback-tool instructions.
- Conversation archive: persist raw user, assistant, tool, and final messages locally.

## Phase 2: Memory and summarization

Status: next.

- Add a summarizer that runs when a conversation ends or grows past a threshold.
- Store summaries separately from raw messages.
- Extract durable memories only when they are stable, useful, and user-relevant.
- Add `/memory` commands to inspect, add, edit, and forget memories.
- Build context from recent messages, relevant summaries, and selected memories.

## Phase 3: Retrieval and storage backends

Status: later.

- Add indexed retrieval over archived conversations.
- Add a SQLite storage backend for structured queries and migration support.
- Keep the archive interface backend-neutral so JSONL and SQLite can coexist.
- Add import/export tooling for user-owned data.

## Phase 4: Formal reliability

Status: later.

- Add tests around prompt building, command parsing, storage, and approval policy.
- Add integration fixtures for native tool calls and fallback JSON tool calls.
- Add crash-safe resume behavior for interrupted runs.
- Add redaction hooks for secrets before memory extraction.
- Add clear retention controls for local archives.
