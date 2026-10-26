# Agent instructions

Paste the paragraph below into Bob's custom instructions (or the equivalent setting of any other MCP-capable agent). It tells the agent to record every coding session through the `prov-mcp` server and to link the session to the commit it makes.

## 1. Register the MCP server

Add `prov-mcp` to the agent's MCP configuration. `--repo` is optional and defaults to the working directory.

```json
{
  "mcpServers": {
    "provenance": {
      "command": "prov-mcp",
      "args": ["--repo", "/absolute/path/to/your/repo"]
    }
  }
}
```

`prov-mcp` comes from `packages/mcp-server` (see the README for installation). The `--repo` path must be a git repository; file paths that resolve outside it are rejected.

## 2. Paste this into custom instructions

```text
This repository uses Provenance to trace AI-written code. Before every git commit that includes code you wrote or changed, call the `record_session` tool from the `provenance` MCP server exactly once for the task: set `prompt` to the user's request, `model` to your model name, `agent` to your agent name, `summary` to one or two sentences on what you changed and why, `contextFiles` to the repo-relative files you read, and `filesChanged` to the repo-relative files you edited or created. The tool returns a `sessionId` and a trailer line of the form `Provenance-Session: <id>`. Add that trailer line, unchanged, as the last line of the commit message, separated from the body by a blank line. Do not commit AI-written changes without it. Before editing existing code, call `find_sessions_touching` for the file and respect the intent of the sessions it returns. When the user asks why a line exists or who wrote it, call `explain_line` and answer from the session's prompt and summary. Never call `set_review_status` to approve your own work; only do so when a human reviewer tells you to.
```

## 3. What a commit looks like

```text
feat: add retry to the payment client

Wrapped charge() in exponential backoff.

Provenance-Session: 01JB8Z6Q4X2M7K9N3P5R8T0V1W
```

The `post-commit` hook installed by `prov init` reads the trailer, links the session to the commit, and stores the link as a git note on `refs/notes/provenance`. If the agent forgets the trailer but did call `record_session`, the session is still in the pending list and the hook links it to the next commit.

## 4. Tools the agent gets

| Tool | When the agent should call it |
| --- | --- |
| `record_session` | Once per task, before committing |
| `explain_line` | The user asks why a line exists or who wrote it |
| `find_sessions_touching` | Before editing existing code |
| `get_session` | It needs the full record of a session |
| `set_review_status` | Only when a human reviewer says to approve or reject |
