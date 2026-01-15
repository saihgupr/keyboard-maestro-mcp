import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query: string): Promise<string> => new Promise(r => rl.question(query, r));

const box = (text: string) => {
    const line = '─'.repeat(text.length + 2);
    console.log(`┌${line}┐`);
    console.log(`│ ${text} │`);
    console.log(`└${line}┘`);
};

const step = (n: number, text: string) => console.log(`\n  [${n}] ${text}\n`);

// ─────────────────────────────────────────────────────────────
// Client Definitions
// ─────────────────────────────────────────────────────────────

interface ClientInfo {
    name: string;
    configPath: (platform: NodeJS.Platform) => string | null;
    configKey: string;
}

const CLIENTS: ClientInfo[] = [
    {
        name: 'Claude Desktop',
        configPath: (p) => p === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
            : p === 'win32'
                ? path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
                : null,
        configKey: 'mcpServers'
    },
    {
        name: 'Cursor',
        configPath: () => path.join(os.homedir(), '.cursor', 'mcp.json'),
        configKey: 'mcpServers'
    },
    {
        name: 'VS Code (Copilot)',
        configPath: (p) => p === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json')
            : p === 'win32'
                ? path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json')
                : null,
        configKey: 'mcp.servers'
    },
    {
        name: 'Windsurf',
        configPath: () => path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
        configKey: 'mcpServers'
    },
    {
        name: 'Antigravity',
        configPath: () => path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json'),
        configKey: 'mcpServers'
    },
    {
        name: 'Other / Show Config',
        configPath: () => null,
        configKey: 'mcpServers'
    }
];

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
    console.clear();
    box('Keyboard Maestro MCP Setup');
    console.log('\n  This wizard will configure your AI client to use\n  the Keyboard Maestro MCP server.\n');

    // Server config
    const serverPath = path.join(__dirname, 'index.js');
    const serverConfig = { command: 'node', args: [serverPath] };

    // ─── Step 1: Select Client ─────────────────────────────────
    step(1, 'Select your AI client');

    CLIENTS.forEach((c, i) => console.log(`      ${i + 1}. ${c.name}`));
    console.log();

    const choice = await ask('  Enter number: ');
    const idx = parseInt(choice, 10) - 1;

    if (idx < 0 || idx >= CLIENTS.length) {
        console.log('\n  Invalid selection. Exiting.\n');
        process.exit(1);
    }

    const client = CLIENTS[idx];
    const configPath = client.configPath(process.platform);

    // ─── Fallback: Print Config ────────────────────────────────
    if (!configPath) {
        step(2, 'Copy this configuration');

        console.log('  Add to your MCP config file:\n');
        console.log('  ──────────────────────────────────────────────');
        const jsonBlock = JSON.stringify({ 'keyboard-maestro': serverConfig }, null, 2);
        jsonBlock.split('\n').forEach(line => console.log('  ' + line));
        console.log('  ──────────────────────────────────────────────');
        console.log(`\n  Server path: ${serverPath}\n`);
        rl.close();
        return;
    }

    // ─── Step 2: Confirm ───────────────────────────────────────
    step(2, 'Confirm installation');

    console.log(`  Config file:\n  ${configPath}\n`);
    const confirm = await ask('  Install keyboard-maestro server? [Y/n] ');

    if (confirm.toLowerCase() === 'n') {
        console.log('\n  Aborted.\n');
        process.exit(0);
    }

    // ─── Step 3: Install ───────────────────────────────────────
    step(3, 'Installing...');

    try {
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        let config: any = {};
        if (fs.existsSync(configPath)) {
            const backup = `${configPath}.backup`;
            fs.copyFileSync(configPath, backup);
            console.log(`  Backup saved: ${backup}`);

            try {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch {
                console.log('  (Existing file was empty or invalid, starting fresh)');
            }
        }

        // Handle nested keys like "mcp.servers"
        const keys = client.configKey.split('.');
        let target = config;
        for (let i = 0; i < keys.length - 1; i++) {
            target[keys[i]] = target[keys[i]] || {};
            target = target[keys[i]];
        }
        const finalKey = keys[keys.length - 1];
        target[finalKey] = target[finalKey] || {};
        target[finalKey]['keyboard-maestro'] = serverConfig;

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('  Configuration saved!\n');

    } catch (err: any) {
        console.error(`\n  Error: ${err.message}\n`);
        process.exit(1);
    }

    // ─── Step 4: Done ──────────────────────────────────────────
    step(4, 'Done!');

    console.log(`  Restart ${client.name} to activate the server.\n`);

    const runVerify = await ask('  Run connection test now? [Y/n] ');
    if (runVerify.toLowerCase() !== 'n') {
        console.log('\n  ─── Connection Test ───\n');
        try {
            execSync('npm run verify', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
        } catch {
            // verify handles its own output
        }
    }

    console.log();
    rl.close();
}

main();
