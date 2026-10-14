/* Synced from getaicodingagent.com _src/build/static/convert.js (pure functions only). */
/* GetAICodingAgent config converter: pure functions + browser UI. No network calls. */
(function (root) {
  'use strict';
  var TARGETS = {
    claude: { name: 'Claude Code', rules: 'CLAUDE.md', mcp: '.mcp.json' },
    codex: { name: 'Codex CLI', rules: 'AGENTS.md', mcp: '.codex/config.toml' },
    cursor: { name: 'Cursor', rules: '.cursor/rules/project.mdc', mcp: '.cursor/mcp.json' },
    gemini: { name: 'Gemini CLI', rules: 'GEMINI.md', mcp: '.gemini/settings.json' }
  };
  var SOURCES = { auto: 'Auto-detect', claude_md: 'CLAUDE.md', agents_md: 'AGENTS.md', cursor_mdc: '.cursor/rules/*.mdc', cursorrules: '.cursorrules', gemini_md: 'GEMINI.md', mcp_json: 'MCP JSON (mcpServers)', codex_toml: 'Codex config.toml [mcp_servers]' };

  function detect(text) {
    var t = (text || '').trim();
    if (!t) return null;
    if (/^\s*\[mcp_servers\./m.test(t)) return 'codex_toml';
    if (t[0] === '{') { try { var j = JSON.parse(t); if (j && (j.mcpServers || j.servers)) return 'mcp_json'; } catch (e) {} }
    if (/^---\s*\n[\s\S]*?(alwaysApply|globs|description)\s*:[\s\S]*?\n---/.test(t)) return 'cursor_mdc';
    if (/claude/i.test(t.slice(0, 400)) || /^@\S+\.md\s*$/m.test(t)) return 'claude_md';
    if (/gemini/i.test(t.slice(0, 400))) return 'gemini_md';
    return 'agents_md';
  }
  var isMcp = function (s) { return s === 'mcp_json' || s === 'codex_toml'; };

  // ---------- tiny TOML subset parser for [mcp_servers.<name>] tables
  function tomlVal(v) {
    v = v.trim();
    if (/^"/.test(v) || /^'/.test(v)) { try { return JSON.parse(v[0] === "'" ? '"' + v.slice(1, -1).replace(/"/g, '\\"') + '"' : v); } catch (e) { return v.slice(1, -1); } }
    if (/^\[/.test(v)) { var out = [], re = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g, m; while ((m = re.exec(v))) out.push(m[1] !== undefined ? JSON.parse('"' + m[1] + '"') : m[2]); return out; }
    if (/^\{/.test(v)) { var o = {}, r2 = /("?[\w.-]+"?)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^,}]+)/g, k; while ((k = r2.exec(v.slice(1, -1)))) o[k[1].replace(/"/g, '')] = tomlVal(k[2]); return o; }
    if (v === 'true' || v === 'false') return v === 'true';
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  function parseCodexToml(text) {
    var servers = {}, cur = null, sub = null;
    text.split(/\r?\n/).forEach(function (line) {
      var l = line.replace(/\s+#.*$/, '').trim();
      if (!l || l[0] === '#') return;
      var h = l.match(/^\[\s*mcp_servers\.("?)([^".\]]+)\1(?:\.(\w+))?\s*\]$/);
      if (h) { cur = servers[h[2]] = servers[h[2]] || {}; sub = h[3] || null; if (sub) cur[sub] = cur[sub] || {}; return; }
      if (/^\[/.test(l)) { cur = null; return; }
      if (!cur) return;
      var kv = l.match(/^("?[\w.-]+"?)\s*=\s*(.+)$/); if (!kv) return;
      var key = kv[1].replace(/"/g, ''), val = tomlVal(kv[2]);
      if (sub) cur[sub][key] = val; else cur[key] = val;
    });
    return servers;
  }
  // ---------- normalize to {name: {command,args,env,url,headers,transport}}
  function normalizeMcp(src, text) {
    var raw = src === 'codex_toml' ? parseCodexToml(text) : ((JSON.parse(text).mcpServers) || JSON.parse(text).servers || {});
    var out = {};
    Object.keys(raw).forEach(function (n) {
      var s = raw[n] || {}, o = {};
      if (s.command) { o.command = s.command; if (s.args && s.args.length) o.args = s.args; if (s.env && Object.keys(s.env).length) o.env = s.env; if (s.cwd) o.cwd = s.cwd; }
      var url = s.httpUrl || s.url || s.serverUrl;
      if (url) { o.url = url; o.transport = s.httpUrl ? 'http' : (s.type === 'sse' ? 'sse' : 'http');
        var hd = s.headers || s.http_headers; if (hd && Object.keys(hd).length) o.headers = hd;
        if (s.bearer_token_env_var) o.bearerEnv = s.bearer_token_env_var; }
      out[n] = o;
    });
    return out;
  }
  function tq(s) { return JSON.stringify(String(s)); }
  function tkey(k) { return /^[A-Za-z0-9_-]+$/.test(k) ? k : tq(k); }
  function emitMcp(target, servers) {
    var names = Object.keys(servers);
    if (target === 'codex') {
      return names.map(function (n) {
        var s = servers[n], L = ['[mcp_servers.' + tkey(n) + ']'];
        if (s.command) { L.push('command = ' + tq(s.command)); if (s.args) L.push('args = [' + s.args.map(tq).join(', ') + ']'); if (s.cwd) L.push('cwd = ' + tq(s.cwd)); }
        if (s.url) { L.push('url = ' + tq(s.url)); if (s.bearerEnv) L.push('bearer_token_env_var = ' + tq(s.bearerEnv)); if (s.transport === 'sse') L.push('# note: Codex docs list STDIO and Streamable HTTP only; this server was SSE in the source'); }
        if (s.headers) L.push('http_headers = { ' + Object.keys(s.headers).map(function (k) { return tq(k) + ' = ' + tq(s.headers[k]); }).join(', ') + ' }');
        if (s.env) { L.push('', '[mcp_servers.' + tkey(n) + '.env]'); Object.keys(s.env).forEach(function (k) { L.push(tkey(k) + ' = ' + tq(s.env[k])); }); }
        return L.join('\n');
      }).join('\n\n') + '\n';
    }
    var obj = {};
    names.forEach(function (n) {
      var s = servers[n], o = {};
      if (s.command) { if (target === 'claude') o.type = 'stdio'; o.command = s.command; if (s.args) o.args = s.args; if (s.env) o.env = s.env; if (s.cwd) o.cwd = s.cwd; }
      if (s.url) {
        if (target === 'claude') { o.type = s.transport === 'sse' ? 'sse' : 'http'; o.url = s.url; }
        else if (target === 'gemini') { if (s.transport === 'sse') o.url = s.url; else o.httpUrl = s.url; }
        else o.url = s.url;
        var h = Object.assign({}, s.headers || {});
        if (s.bearerEnv) h.Authorization = target === 'cursor' ? 'Bearer ${env:' + s.bearerEnv + '}' : 'Bearer ${' + s.bearerEnv + '}';
        if (Object.keys(h).length) o.headers = h;
      }
      obj[n] = o;
    });
    return JSON.stringify({ mcpServers: obj }, null, 2) + '\n';
  }
  // ---------- instructions
  function stripFront(t) { var m = t.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/); return m ? { fm: m[1], body: t.slice(m[0].length) } : { fm: '', body: t }; }
  function emitRules(target, body, opts) {
    body = body.replace(/^\s+|\s+$/g, '') + '\n';
    if (target === 'cursor') return '---\ndescription: Project instructions (converted)\nalwaysApply: true\n---\n\n' + body;
    if (target === 'claude' && opts.claudeImport) return '@AGENTS.md\n';
    if (target === 'gemini' && opts.claudeImport) return null;
    return body;
  }
  function q(p) { return "'" + p.replace(/'/g, "'\\''") + "'"; }
  function heredoc(path, content) {
    var tag = 'GACA_EOF'; while (content.indexOf(tag) >= 0) tag += '_X';
    var dir = path.indexOf('/') > 0 ? 'mkdir -p ' + q(path.replace(/\/[^/]*$/, '')) + ' && ' : '';
    return dir + 'cat > ' + q(path) + " <<'" + tag + "'\n" + content.replace(/\n$/, '') + '\n' + tag;
  }
  /* convert(text, {source, targets:[...], link:'none'|'symlink'|'import'}) -> {source, kind, files:[{target,path,content,note}], shell, warnings} */
  function convert(text, opts) {
    opts = opts || {};
    var src = !opts.source || opts.source === 'auto' ? detect(text) : opts.source;
    var targets = (opts.targets && opts.targets.length) ? opts.targets : ['claude', 'codex', 'cursor', 'gemini'];
    var res = { source: src, kind: null, files: [], shell: '', warnings: [] };
    if (!src) { res.warnings.push('Paste a config file first.'); return res; }
    if (isMcp(src)) {
      res.kind = 'mcp';
      var servers;
      try { servers = normalizeMcp(src, text); } catch (e) { res.warnings.push('Could not parse input: ' + e.message); return res; }
      if (!Object.keys(servers).length) { res.warnings.push('No MCP servers found (expected "mcpServers" or [mcp_servers.NAME]).'); return res; }
      targets.forEach(function (t) {
        var f = { target: t, path: TARGETS[t].mcp, content: emitMcp(t, servers), note: '' };
        if (t === 'codex') f.note = 'Project-scoped .codex/config.toml loads for trusted projects only; or append to ~/.codex/config.toml.';
        if (t === 'gemini') f.note = 'Merge the mcpServers key into an existing .gemini/settings.json instead of overwriting other settings.';
        if (t === 'claude') f.note = 'Claude Code asks you to approve project .mcp.json servers on first use.';
        res.files.push(f);
      });
      res.servers = Object.keys(servers);
    } else {
      res.kind = 'rules';
      var sp = stripFront(text), body = sp.body;
      if (sp.fm && /globs\s*:\s*\S/.test(sp.fm)) res.warnings.push('Source rule had globs (file-scoped). Targets other than Cursor get it as always-on instructions.');
      var link = opts.link || 'none';
      var shareAgents = link !== 'none' && targets.indexOf('codex') < 0 && (targets.indexOf('claude') >= 0 || targets.indexOf('gemini') >= 0);
      if (shareAgents) res.files.push({ target: 'codex', path: 'AGENTS.md', content: emitRules('codex', body, {}), note: 'Shared source of truth for the link below.' });
      targets.forEach(function (t) {
        var f = { target: t, path: TARGETS[t].rules, note: '' };
        if (link === 'symlink' && t === 'claude') { f.symlink = 'AGENTS.md'; f.content = '(symlink → AGENTS.md)\n'; f.note = 'Symlinks need Developer Mode/admin on Windows; use the @AGENTS.md import there.'; }
        else if (link === 'import' && t === 'claude') { f.content = '@AGENTS.md\n'; f.note = 'Claude Code expands @path imports at launch.'; }
        else if (link !== 'none' && t === 'gemini') { f.path = '.gemini/settings.json'; f.content = JSON.stringify({ context: { fileName: ['AGENTS.md', 'GEMINI.md'] } }, null, 2) + '\n'; f.note = 'Makes Gemini CLI read AGENTS.md (context.fileName). Merge into existing settings.'; }
        else f.content = emitRules(t, body, {});
        if (t === 'claude' && !f.symlink && link === 'none') f.note = 'Claude Code also reads AGENTS.md when no CLAUDE.md exists (v2.1.277+).';
        res.files.push(f);
      });
    }
    res.shell = res.files.map(function (f) { return f.symlink ? 'ln -sf ' + q(f.symlink) + ' ' + q(f.path) : heredoc(f.path, f.content); }).join('\n');
    return res;
  }
  var api = { convert: convert, detect: detect, parseCodexToml: parseCodexToml, normalizeMcp: normalizeMcp, TARGETS: TARGETS, SOURCES: SOURCES };
  module.exports = api;
})(this);
