# agent-config-bridge

<!-- mcp-name: io.github.onehumanbeing/agent-config-bridge -->

An MCP server that moves your coding-agent setup between **Claude Code, Codex CLI, Cursor and Gemini CLI**: instruction files (CLAUDE.md, AGENTS.md, `.cursor/rules/*.mdc`, `.cursorrules`, GEMINI.md) and MCP server configs (`mcpServers` JSON ⇄ Codex `config.toml` ⇄ Gemini `settings.json`).

Runs locally over stdio. **No network calls, no telemetry.** It writes files only when you call `migrate_project` with `write: true`.

Prefer a web UI? Use the same converter in your browser at **[getaicodingagent.com](https://getaicodingagent.com)**.

## Tools

| Tool | What it does |
|---|---|
| `convert_rules` | Instruction text from one tool → files and paths for the others. Can also share one AGENTS.md through a symlink or an `@AGENTS.md` import |
| `convert_mcp_config` | MCP servers: Claude Code / Claude Desktop / Cursor JSON ⇄ Codex `[mcp_servers.*]` TOML ⇄ Gemini `httpUrl`/`url` |
| `detect_agent_configs` | Scans a project read-only for every agent config file and skills folder, and lists which tools have no config yet |
| `migrate_project` | Generates the missing configs from the existing ones. **Dry run by default**. Existing files are skipped unless `overwrite: true`; `.gemini/settings.json` is merged |
| `compat_matrix` | Where each tool reads its config, with official doc links and a verified date. Anything the official docs don't state is returned as `unknown` |

## Install

**Claude Code**
```bash
claude mcp add agent-config-bridge -- npx -y agent-config-bridge
```

**Codex CLI**
```bash
codex mcp add agent-config-bridge -- npx -y agent-config-bridge
```
or add this to `~/.codex/config.toml`:
```toml
[mcp_servers.agent-config-bridge]
command = "npx"
args = ["-y", "agent-config-bridge"]
```

**Cursor** — `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):
```json
{ "mcpServers": { "agent-config-bridge": { "command": "npx", "args": ["-y", "agent-config-bridge"] } } }
```

**Gemini CLI** — `.gemini/settings.json` or `~/.gemini/settings.json`:
```json
{ "mcpServers": { "agent-config-bridge": { "command": "npx", "args": ["-y", "agent-config-bridge"] } } }
```

## Example prompts
- "Detect the agent configs in this repo and migrate them to Codex and Cursor (dry run first)."
- "Convert this Claude Desktop config to Codex TOML."
- "Where does Gemini CLI read its MCP config? Use compat_matrix."

## Links
- Web converter and compatibility table: https://getaicodingagent.com
- Config matrix for 17 agents: https://getaicodingagent.com/config/
- Compare coding agents: https://getaicodingagent.com/compare

## Develop
```bash
npm install && npm test   # builds, then runs unit tests plus an MCP client smoke test
```

MIT © onehumanbeing
