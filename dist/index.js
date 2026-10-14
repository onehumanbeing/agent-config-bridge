#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const C = require("./core/convert.cjs");
const MATRIX = require("./core/matrix.json");
const VERSION = "0.1.0";
const SITE = "https://getaicodingagent.com";
const TARGET = z.enum(["claude", "codex", "cursor", "gemini"]);
const RULE_SRC = { auto: "auto", claude: "claude_md", codex: "agents_md", agents_md: "agents_md", cursor: "cursor_mdc", cursorrules: "cursorrules", gemini: "gemini_md" };
const ok = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: msg }], isError: true });
// ---------- project scanning
const RULE_FILES = [
    ["CLAUDE.md", "claude", "claude_md"], [".claude/CLAUDE.md", "claude", "claude_md"], ["CLAUDE.local.md", "claude", "claude_md"],
    ["AGENTS.md", "codex", "agents_md"], ["AGENTS.override.md", "codex", "agents_md"], ["GEMINI.md", "gemini", "gemini_md"], [".cursorrules", "cursor", "cursorrules"]
];
const MCP_FILES = [
    [".mcp.json", "claude", "mcp_json"], [".cursor/mcp.json", "cursor", "mcp_json"], [".gemini/settings.json", "gemini", "mcp_json"], [".codex/config.toml", "codex", "codex_toml"]
];
function inside(root, rel) {
    const p = path.resolve(root, rel);
    if (p !== root && !p.startsWith(root + path.sep))
        throw new Error(`Refusing path outside project: ${rel}`);
    return p;
}
function scan(dir) {
    const root = path.resolve(dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
        throw new Error(`Not a directory: ${root}`);
    const found = [];
    const add = (rel, tool, kind, format) => {
        const p = path.join(root, rel);
        if (!fs.existsSync(p))
            return;
        const st = fs.lstatSync(p), item = { path: rel, tool, kind, format, bytes: fs.statSync(p).size };
        if (st.isSymbolicLink())
            item.symlinkTo = fs.readlinkSync(p);
        if (kind === "mcp") {
            try {
                item.mcpServers = C.normalizeMcp(format, fs.readFileSync(p, "utf8")) ? Object.keys(C.normalizeMcp(format, fs.readFileSync(p, "utf8"))) : [];
            }
            catch (e) {
                item.note = "could not parse: " + e.message;
            }
            if (rel === ".gemini/settings.json" && item.mcpServers && !item.mcpServers.length) {
                item.kind = "settings";
                delete item.mcpServers;
            }
        }
        found.push(item);
    };
    RULE_FILES.forEach(([r, t, f]) => add(r, t, "rules", f));
    const rd = path.join(root, ".cursor/rules");
    if (fs.existsSync(rd)) {
        const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory())
            walk(p);
        else if (/\.mdc$/.test(e.name))
            add(path.relative(root, p), "cursor", "rules", "cursor_mdc"); });
        walk(rd);
    }
    MCP_FILES.forEach(([r, t, f]) => add(r, t, "mcp", f));
    for (const d of [".claude/skills", ".agents/skills", ".cursor/skills", ".gemini/skills"]) {
        const p = path.join(root, d);
        if (fs.existsSync(p))
            found.push({ path: d, tool: d.split("/")[0].slice(1), kind: "settings", format: "skills_dir", bytes: 0, note: fs.readdirSync(p).length + " entries" });
    }
    return { root, found };
}
function mergeJson(existing, add) {
    const a = JSON.parse(existing || "{}"), b = JSON.parse(add);
    for (const k of Object.keys(b))
        a[k] = (a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) ? { ...a[k], ...b[k] } : b[k];
    return JSON.stringify(a, null, 2) + "\n";
}
// ---------- server
const server = new McpServer({ name: "agent-config-bridge", version: VERSION });
server.registerTool("convert_rules", {
    title: "Convert instruction files",
    description: "Convert agent instructions (CLAUDE.md, AGENTS.md, .cursor/rules/*.mdc, .cursorrules, GEMINI.md) into the files Claude Code, Codex CLI, Cursor and Gemini CLI read. Returns file paths + contents and a shell command; writes nothing.",
    inputSchema: {
        text: z.string().describe("Contents of the source instruction file"),
        source: z.enum(["auto", "claude", "codex", "agents_md", "cursor", "cursorrules", "gemini"]).default("auto").describe("Source tool/format (codex = AGENTS.md, cursor = .mdc rule)"),
        targets: z.array(TARGET).min(1).default(["claude", "codex", "cursor", "gemini"]),
        link: z.enum(["none", "symlink", "import"]).default("none").describe("Share one AGENTS.md: symlink CLAUDE.md -> AGENTS.md, or CLAUDE.md with @AGENTS.md import"),
    },
}, async ({ text, source, targets, link }) => {
    const r = C.convert(text, { source: RULE_SRC[source], targets, link });
    if (r.kind === "mcp")
        return fail("This looks like an MCP config. Use convert_mcp_config.");
    if (!r.files.length)
        return fail(r.warnings.join("\n") || "Nothing to convert");
    return ok({ detected: r.source, files: r.files, shell: r.shell, warnings: r.warnings });
});
server.registerTool("convert_mcp_config", {
    title: "Convert MCP server config",
    description: "Convert MCP server definitions between Claude Code/Claude Desktop/Cursor JSON (mcpServers), Gemini CLI settings.json (httpUrl/url) and Codex config.toml [mcp_servers.*]. Returns target files; writes nothing.",
    inputSchema: {
        text: z.string().describe("mcpServers JSON or Codex TOML"),
        format: z.enum(["auto", "json", "codex_toml"]).default("auto"),
        targets: z.array(TARGET).min(1).default(["claude", "codex", "cursor", "gemini"]),
    },
}, async ({ text, format, targets }) => {
    const source = format === "auto" ? C.detect(text) : format === "json" ? "mcp_json" : "codex_toml";
    if (source !== "mcp_json" && source !== "codex_toml")
        return fail("Input is not an mcpServers JSON object or Codex [mcp_servers.NAME] TOML.");
    const r = C.convert(text, { source, targets });
    if (!r.files.length)
        return fail(r.warnings.join("\n"));
    return ok({ detected: source, servers: r.servers, files: r.files, shell: r.shell, warnings: r.warnings });
});
server.registerTool("detect_agent_configs", {
    title: "Detect agent configs in a project",
    description: "Scan a project directory (read-only) for CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules, .cursorrules, .mcp.json, .cursor/mcp.json, .gemini/settings.json, .codex/config.toml and skills folders.",
    inputSchema: { dir: z.string().describe("Absolute path of the project root") },
    annotations: { readOnlyHint: true },
}, async ({ dir }) => {
    try {
        const s = scan(dir), tools = [...new Set(s.found.map((f) => f.tool))];
        return ok({ ...s, toolsConfigured: tools, missingFor: ["claude", "codex", "cursor", "gemini"].filter((t) => !tools.includes(t)) });
    }
    catch (e) {
        return fail(e.message);
    }
});
server.registerTool("migrate_project", {
    title: "Migrate a project's agent config",
    description: "Generate target-tool config files from the project's existing instructions and MCP config. DRY RUN by default: returns the plan. Files are written only when write=true; existing files are skipped unless overwrite=true (Gemini settings.json is merged).",
    inputSchema: {
        dir: z.string().describe("Absolute path of the project root"),
        targets: z.array(TARGET).min(1),
        from: z.enum(["auto", "claude", "codex", "cursor", "gemini"]).default("auto").describe("Which tool's config to use as the source"),
        link: z.enum(["none", "symlink", "import"]).default("none"),
        write: z.boolean().default(false),
        overwrite: z.boolean().default(false),
    },
    annotations: { destructiveHint: true },
}, async ({ dir, targets, from, link, write, overwrite }) => {
    try {
        const { root, found } = scan(dir);
        const pick = (kind) => found.find((f) => f.kind === kind && (from === "auto" || f.tool === from) && !f.symlinkTo);
        const rules = pick("rules"), mcp = pick("mcp");
        if (!rules && !mcp)
            return fail(`No ${from === "auto" ? "" : from + " "}instructions or MCP config found in ${root}`);
        const outs = [], warnings = [];
        const tg = targets.filter((t) => !(rules && t === rules.tool && !mcp));
        if (rules) {
            const r = C.convert(fs.readFileSync(path.join(root, rules.path), "utf8"), { source: rules.format, targets: tg.filter((t) => t !== rules.tool), link });
            outs.push(...r.files);
            warnings.push(...r.warnings);
        }
        if (mcp) {
            const r = C.convert(fs.readFileSync(path.join(root, mcp.path), "utf8"), { source: mcp.format, targets: tg.filter((t) => t !== mcp.tool) });
            outs.push(...r.files);
            warnings.push(...r.warnings);
        }
        const plan = outs.map((f) => {
            const abs = inside(root, f.path), exists = fs.existsSync(abs);
            let action = f.symlink ? "symlink" : "create";
            if (exists)
                action = f.path === ".gemini/settings.json" ? "merge" : overwrite ? "overwrite" : "skip (exists)";
            return { ...f, action };
        });
        if (write) {
            for (const f of plan) {
                if (f.action.startsWith("skip"))
                    continue;
                const abs = inside(root, f.path);
                fs.mkdirSync(path.dirname(abs), { recursive: true });
                if (f.symlink) {
                    if (fs.existsSync(abs))
                        fs.unlinkSync(abs);
                    fs.symlinkSync(f.symlink, abs);
                }
                else
                    fs.writeFileSync(abs, f.action === "merge" ? mergeJson(fs.readFileSync(abs, "utf8"), f.content) : f.content);
                f.written = true;
            }
        }
        return ok({ root, dryRun: !write, source: { rules: rules?.path ?? null, mcp: mcp?.path ?? null }, plan: plan.map(({ content, ...x }) => ({ ...x, preview: String(content).slice(0, 400) })), warnings, next: write ? "Done. Restart the target tools." : "Dry run only. Call again with write=true to write these files." });
    }
    catch (e) {
        return fail(e.message);
    }
});
server.registerTool("compat_matrix", {
    title: "Config compatibility matrix",
    description: "Where Claude Code, Codex CLI, Cursor and Gemini CLI read instructions, MCP config and skills, with official doc links and the date each was verified. 'unknown' means not stated in the official docs.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
}, async () => ok({ ...MATRIX, more: `${SITE}/config/` }));
await server.connect(new StdioServerTransport());
