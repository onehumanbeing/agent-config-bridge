import { createRequire } from "node:module"; import assert from "node:assert";
const C = createRequire(import.meta.url)("../dist/core/convert.cjs");
// Real Claude Desktop config (filesystem + github servers, from MCP quickstart style)
const desktop = { mcpServers: { filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Desktop"] }, github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<token>" } } } };
let r = C.convert(JSON.stringify(desktop), { targets: ["codex"] }); assert(r.files[0].content.includes("[mcp_servers.github.env]"));
const back = JSON.parse(C.convert(r.files[0].content, { targets: ["cursor"] }).files[0].content); assert.deepEqual(back.mcpServers, desktop.mcpServers);
// Codex docs examples
r = C.convert('[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp"]\n\n[mcp_servers.context7.env]\nMY_ENV_VAR = "MY_ENV_VALUE"\n', { targets: ["claude"] });
assert.equal(JSON.parse(r.files[0].content).mcpServers.context7.env.MY_ENV_VAR, "MY_ENV_VALUE");
// Gemini docs httpUrl
r = C.convert('{"mcpServers":{"httpServer":{"httpUrl":"http://localhost:3000/mcp","timeout":5000}}}', { targets: ["claude"] }); assert.equal(JSON.parse(r.files[0].content).mcpServers.httpServer.type, "http");
// Cursor docs rule with globs
r = C.convert("---\nglobs: src/components/**/*.tsx\nalwaysApply: false\n---\n\n- Use named exports\n", { targets: ["claude"], link: "symlink" });
assert(r.warnings.length && r.shell.includes("ln -sf"));
console.log("UNIT PASSED");
