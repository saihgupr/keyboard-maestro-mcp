# Keyboard Maestro MCP

An MCP server for Keyboard Maestro. Manage your macros with natural language commands.


## What Can You Do?

Instead of digging through menus and clicking buttons, just ask:

| Just say... |
|-------------|
| "Run my morning routine macro" |
| "Create a macro that types my email signature when I press Cmd+Shift+S" |
| "What macros have been failing lately? Fix them." |
| "Duplicate my 'Open Project' macro and modify it for the new client" |
| "Disable all my work macros, I'm on vacation" |

Your AI assistant becomes a power user of your Mac. It can read, create, modify, run, and debug your Keyboard Maestro macros through conversation.

## Real-World Examples

| Use Case | Example |
|----------|---------|
| Debugging | "My clipboard manager macro stopped working yesterday. Check the logs and tell me what went wrong." |
| Bulk Editing | "I have 20 macros that open Chrome. Change them all to open Arc instead." |
| Quick Automation | "Make a macro that mounts my NAS drives when I connect to my home WiFi." |
| Organization | "Create a new macro group called 'Client Work' and move all macros with 'ACME' in the name into it." |

> [!IMPORTANT]
> This MCP gives your AI full access to Keyboard Maestro. It can run, modify, and delete macros. Always review suggested changes before approving them.

## Requirements

- **macOS** (Keyboard Maestro is macOS-only)
- **Keyboard Maestro** installed and running
- **Node.js** v18+

## Quick Start

```bash
git clone https://github.com/DiggingForDinos/keyboard-maestro-mcp.git
cd keyboard-maestro-mcp
npm install
npm run setup
```

The setup wizard will configure your AI client automatically. It supports:
- Claude Desktop
- Cursor
- VS Code (Copilot)
- Windsurf
- Antigravity
- Any MCP-compatible client

## Available Tools

### Macro Management
| Tool | What it does |
|------|--------------|
| `km_search_macros` | Find macros by name |
| `km_list_macros` | List all macros |
| `km_get_macro` | Get macro details |
| `km_get_macro_xml` | Export a macro's full definition |
| `km_create_macro` | Build a new macro |
| `km_clone_macro` | Duplicate an existing macro |
| `km_delete_macro` | Remove a macro |
| `km_enable_macro` | Turn macros on/off |
| `km_run_macro` | Execute a macro right now |
| `km_manage_group` | Organize macro groups |

### Action Editing
| Tool | What it does |
|------|--------------|
| `km_list_actions` | See all steps in a macro |
| `km_add_action` | Add a new step |
| `km_move_action` | Reorder steps |
| `km_delete_action` | Remove a step |
| `km_get_action_xml` | Export a step's definition |
| `km_set_action_xml` | Replace a step |
| `km_search_replace_action` | Find and replace text in a step |

### Trigger Editing
| Tool | What it does |
|------|--------------|
| `km_add_trigger` | Add a new trigger |
| `km_delete_trigger` | Remove a trigger |
| `km_get_trigger_xml` | Export a trigger |
| `km_set_trigger_xml` | Replace a trigger |

### Variables and Logs
| Tool | What it does |
|------|--------------|
| `km_manage_variable` | Read, write, or delete KM variables |
| `km_get_errors` | Find recent macro failures |
| `km_get_log` | Search the engine log |

## Testing Your Setup

**Quick check:**
```bash
npm run verify
```

**Interactive testing:**
```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Manual Configuration

If you prefer to configure manually, add this to your AI client's MCP config:

```json
{
  "mcpServers": {
    "keyboard-maestro": {
      "command": "node",
      "args": ["/path/to/keyboard-maestro-mcp/build/index.js"]
    }
  }
}
```

## Support

Having issues? [Open an issue on GitHub](https://github.com/DiggingForDinos/keyboard-maestro-mcp/issues)

If you like this project, please consider giving the repo a ⭐ star!