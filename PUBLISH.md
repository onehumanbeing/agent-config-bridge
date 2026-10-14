# Publish steps (need Henry)
1. Create a PUBLIC GitHub repo: https://github.com/onehumanbeing/agent-config-bridge (name must match package.json/server.json `repository`).
   cd /workspace/gaca/mcp && git remote add origin git@github.com:onehumanbeing/agent-config-bridge.git && git push -u origin main
2. npm: `npm login` (account that will own `agent-config-bridge`, name was free on 2026-10-14), then `npm publish --access public` (prepublishOnly runs build + tests).
   Check: `npm view agent-config-bridge mcpName` → io.github.onehumanbeing/agent-config-bridge
3. Registry: `~/bin/mcp-publisher login github` (device code; sign in as GitHub user onehumanbeing), then `~/bin/mcp-publisher publish`.
   Check: curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.onehumanbeing/agent-config-bridge"
Version bumps: change version in package.json AND both places in server.json.
