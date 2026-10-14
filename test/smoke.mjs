// End-to-end: spawn the stdio server with the official MCP client, list tools, call each one.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";

const proj = fs.mkdtempSync(path.join(os.tmpdir(), "acb-"));
fs.writeFileSync(path.join(proj, "CLAUDE.md"), "# Repo\n\n- Run `npm test` before committing\n- Never edit dist/\n");
fs.writeFileSync(path.join(proj, ".mcp.json"), JSON.stringify({ mcpServers: { context7: { type: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"] }, sentry: { type: "http", url: "https://mcp.sentry.dev/mcp" } } }, null, 2));
fs.mkdirSync(path.join(proj, ".gemini")); fs.writeFileSync(path.join(proj, ".gemini/settings.json"), JSON.stringify({ theme: "Dracula" }));

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"] }));
const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
assert.deepEqual(tools.map((t) => t.name).sort(), ["compat_matrix", "convert_mcp_config", "convert_rules", "detect_agent_configs", "migrate_project"]);
const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); assert(!r.isError, name + ": " + r.content[0].text); return JSON.parse(r.content[0].text); };

let r = await call("convert_rules", { text: "---\ndescription: x\nalwaysApply: true\n---\n- Use pnpm\n", targets: ["claude", "codex"] });
assert.equal(r.detected, "cursor_mdc"); assert.equal(r.files[0].path, "CLAUDE.md"); console.log("convert_rules ok");
r = await call("convert_mcp_config", { text: '[mcp_servers.figma]\nurl = "https://mcp.figma.com/mcp"\nbearer_token_env_var = "FIGMA_OAUTH_TOKEN"\n', targets: ["gemini"] });
assert(JSON.parse(r.files[0].content).mcpServers.figma.httpUrl); console.log("convert_mcp_config ok");
r = await call("detect_agent_configs", { dir: proj });
assert(r.found.find((f) => f.path === ".mcp.json").mcpServers.includes("sentry")); assert.deepEqual(r.missingFor, ["codex", "cursor"]); console.log("detect_agent_configs ok", r.toolsConfigured);
r = await call("migrate_project", { dir: proj, targets: ["codex", "cursor", "gemini"] });
assert.equal(r.dryRun, true); assert(!fs.existsSync(path.join(proj, "AGENTS.md"))); console.log("migrate dry-run plan:", r.plan.map((p) => p.path + ":" + p.action).join(", "));
r = await call("migrate_project", { dir: proj, targets: ["codex", "cursor", "gemini"], write: true });
const toml = fs.readFileSync(path.join(proj, ".codex/config.toml"), "utf8"); assert(toml.includes("[mcp_servers.sentry]"));
const gs = JSON.parse(fs.readFileSync(path.join(proj, ".gemini/settings.json"), "utf8")); assert.equal(gs.theme, "Dracula"); assert(gs.mcpServers.sentry.httpUrl);
assert(fs.existsSync(path.join(proj, "AGENTS.md")) && fs.existsSync(path.join(proj, ".cursor/rules/project.mdc"))); console.log("migrate write ok (gemini settings merged)");
r = await call("compat_matrix", {}); assert.equal(r.verified, "2026-10-14"); assert(r.rows.length >= 7); console.log("compat_matrix ok");
const bad = await client.callTool({ name: "detect_agent_configs", arguments: { dir: "/nonexistent" } }); assert(bad.isError);
await client.close(); console.log("SMOKE PASSED");
