#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import our tool modules
import { readEngineLog, readEditorLog, getErrorSummary } from './tools/logs.js';
import {
    listMacros,
    getMacro,
    getMacroXml,
    createMacro,
    duplicateMacro,
    addAction,
    deleteMacro,
    setMacroEnabled,
    listGroups,
    executeMacro,
    getActionXml,
    setActionXml,
    deleteAction,
    searchReplaceInAction,
    listActions,
    moveAction,
    addTrigger,
    deleteTrigger,
    createGroup,
    deleteGroup,
    toggleGroup,
    getTriggerXml,
    setTriggerXml,
    searchMacros,
    moveMacroToGroup,
    // High-level action helpers
    addNotificationAction,
    addPauseAction,
    addSetVariableAction,
    addCalculationAction,
    addDisplayTextAction,
    addIfVariableContainsAction,
    addIfCalculationAction,
    addExecuteMacroAction,
    addShellScriptAction
} from './tools/macros.js';
import { getVariable, setVariable, deleteVariable } from './tools/variables.js';
import {
    searchDocs,
    getDocMarkdown,
    listDocs,
    listCategories,
    docUri,
    DOCS_URI_PREFIX,
} from './tools/docs.js';
import { SERVER_INSTRUCTIONS, MACRO_AUTHORING_GUIDE } from './tools/guide.js';

const GUIDE_URI = `${DOCS_URI_PREFIX}guide/macro_authoring`;

// Create the MCP server
const server = new Server(
    {
        name: 'keyboard-maestro-mcp',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
            resources: {},
            prompts: {},
        },
        instructions: SERVER_INSTRUCTIONS,
    }
);

// Define all available tools
const TOOLS = [
    // Documentation Tools
    {
        name: 'km_search_docs',
        description: 'Search the offline Keyboard Maestro wiki (actions, tokens, functions, conditions, triggers, user manual, topics). Returns ranked page ids with snippets; read a page with km_get_doc. Omit query to list every page in a category.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search terms, e.g. "clipboard history", "shell script path", "JSONValue"',
                },
                category: {
                    type: 'string',
                    enum: ['action', 'token', 'function', 'condition', 'trigger', 'manual', 'collection', 'application', 'assistance', 'actions', 'topic'],
                    description: 'Optional: limit to one category',
                },
                limit: {
                    type: 'number',
                    description: 'Max results (default 10, max 50). Ignored when listing a category.',
                },
            },
        },
    },
    {
        name: 'km_get_doc',
        description: 'Get a Keyboard Maestro wiki page as Markdown. Accepts a page id from km_search_docs or a link in another page (e.g. "action/Execute_a_Shell_Script", "token/ClipboardText", "manual/Variables", "km-docs://Tokens"), or a page title. Use "guide" for the macro authoring guide.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {
                    type: 'string',
                    description: 'Page id, km-docs:// URI, or title',
                },
            },
            required: ['page'],
        },
    },
    // Log Analysis Tools
    {
        name: 'km_get_errors',
        description: 'Get recent errors and failures from Keyboard Maestro Engine log. Returns errors grouped by macro with timestamps and error messages.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                hours: {
                    type: 'number',
                    description: 'How many hours back to look for errors (default: 24)',
                },
            },
        },
    },
    {
        name: 'km_get_log',
        description: 'Get raw log entries from Keyboard Maestro Engine log with optional filters.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                lines: {
                    type: 'number',
                    description: 'Number of lines to return (default: 100)',
                },
                errorsOnly: {
                    type: 'boolean',
                    description: 'Only return error entries',
                },
                macroFilter: {
                    type: 'string',
                    description: 'Filter to specific macro name (partial match)',
                },
            },
        },
    },

    // Macro Management Tools
    {
        name: 'km_list_macros',
        description: 'List all macros in Keyboard Maestro with their names and UIDs.',
        inputSchema: {
            type: 'object' as const,
            properties: {},
        },
    },

    {
        name: 'km_get_macro',
        description: 'Get details about a specific macro by name or UID.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
            },
            required: ['identifier'],
        },
    },
    {
        name: 'km_get_macro_xml',
        description: 'Get the full XML definition of a macro. Useful for understanding macro structure or creating similar macros.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
            },
            required: ['identifier'],
        },
    },
    {
        name: 'km_search_macros',
        description: 'Search for macros by name (case-insensitive partial match). returns name and UID.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query string',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'km_create_macro',
        description: 'Create a new macro with a name. Optionally include action XML to add an initial action.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: {
                    type: 'string',
                    description: 'Name for the new macro',
                },
                actionXml: {
                    type: 'string',
                    description: 'Optional: XML for an action to add (e.g. <dict><key>MacroActionType</key><string>DisplayLargeText</string><key>Text</key><string>Hello</string></dict>)',
                },
                groupName: {
                    type: 'string',
                    description: 'Optional: name of the group to add the macro to (defaults to Global Macro Group)',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'km_clone_macro',
        description: 'Duplicate an existing macro. Optionally provide a new name.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: {
                    type: 'string',
                    description: 'The macro to duplicate (name or UID)',
                },
                newName: {
                    type: 'string',
                    description: 'Optional: name for the new macro',
                },
            },
            required: ['identifier'],
        },
    },
    {
        name: 'km_add_action',
        description: 'Add an action to an existing macro using XML.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                actionXml: {
                    type: 'string',
                    description: 'XML for the action (e.g. <dict><key>MacroActionType</key><string>Notification</string><key>Title</key><string>Hello</string></dict>)',
                },
            },
            required: ['macroIdentifier', 'actionXml'],
        },
    },
    {
        name: 'km_delete_macro',
        description: 'Delete a macro by name or UID. WARNING: This cannot be undone!',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Macro name or UID to delete',
                },
            },
            required: ['identifier'],
        },
    },
    {
        name: 'km_enable_macro',
        description: 'Enable or disable a macro.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                enabled: {
                    type: 'boolean',
                    description: 'Whether to enable (true) or disable (false) the macro',
                },
            },
            required: ['identifier', 'enabled'],
        },
    },
    {
        name: 'km_run_macro',
        description: 'Execute a macro by name or UID.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Macro name or UID to execute',
                },
                parameter: {
                    type: 'string',
                    description: 'Optional parameter to pass to the macro',
                },
            },
            required: ['identifier'],
        },
    },
    {
        name: 'km_move_macro',
        description: 'Move a macro to a different macro group.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID to move',
                },
                groupIdentifier: {
                    type: 'string',
                    description: 'Target group name or UID',
                },
            },
            required: ['macroIdentifier', 'groupIdentifier'],
        },
    },

    // Variable Tools
    {
        name: 'km_get_variable',
        description: 'Get the value of a global Keyboard Maestro variable. Returns "(empty)" if it is unset.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Variable name' },
            },
            required: ['name'],
        },
    },
    {
        name: 'km_set_variable',
        description: 'Set a global Keyboard Maestro variable, overwriting any existing value. Setting it to an empty string deletes it.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Variable name' },
                value: { type: 'string', description: 'New value' },
            },
            required: ['name', 'value'],
        },
    },
    {
        name: 'km_delete_variable',
        description: 'Delete a global Keyboard Maestro variable.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Variable name' },
            },
            required: ['name'],
        },
    },

    // Action Editing Tools
    {
        name: 'km_get_action_xml',
        description: 'Get the XML definition of a specific action in a macro. Actions are 1-indexed.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                actionIndex: {
                    type: 'number',
                    description: 'Action index (1-based)',
                },
            },
            required: ['macroIdentifier', 'actionIndex'],
        },
    },
    {
        name: 'km_set_action_xml',
        description: 'Set/replace the XML of a specific action in a macro. Use km_get_action_xml first to get the current XML.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                actionIndex: {
                    type: 'number',
                    description: 'Action index (1-based)',
                },
                xml: {
                    type: 'string',
                    description: 'New XML for the action',
                },
            },
            required: ['macroIdentifier', 'actionIndex', 'xml'],
        },
    },
    {
        name: 'km_search_replace_action',
        description: 'Search and replace text within a specific action in a macro. Useful for fixing typos or updating values.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                actionIndex: {
                    type: 'number',
                    description: 'Action index (1-based)',
                },
                searchText: {
                    type: 'string',
                    description: 'Text to search for',
                },
                replaceText: {
                    type: 'string',
                    description: 'Text to replace with',
                },
            },
            required: ['macroIdentifier', 'actionIndex', 'searchText', 'replaceText'],
        },
    },
    {
        name: 'km_delete_action',
        description: 'Delete a specific action from a macro. Actions are 1-indexed. WARNING: This cannot be undone!',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                actionIndex: {
                    type: 'number',
                    description: 'Action index to delete (1-based)',
                },
            },
            required: ['macroIdentifier', 'actionIndex'],
        },
    },

    // Trigger Editing Tools
    {
        name: 'km_add_trigger',
        description: 'Add a trigger to a macro using XML.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                triggerXml: {
                    type: 'string',
                    description: 'XML for the trigger (e.g. <dict><key>MacroTriggerType</key><string>TypedString</string><key>TypedString</key><string>foo</string></dict>)',
                },
            },
            required: ['macroIdentifier', 'triggerXml'],
        },
    },
    {
        name: 'km_delete_trigger',
        description: 'Delete a trigger from a macro. Triggers are 1-indexed.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                triggerIndex: {
                    type: 'number',
                    description: 'Trigger index to delete (1-based)',
                },
            },
            required: ['macroIdentifier', 'triggerIndex'],
        },
    },

    {
        name: 'km_list_actions',
        description: 'List all actions in a macro with their index, name, and enabled status.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
            },
            required: ['macroIdentifier'],
        },
    },
    {
        name: 'km_move_action',
        description: 'Move an action to a new position index. Subsequent actions will shift down.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                actionIndex: {
                    type: 'number',
                    description: 'Current 1-based index of the action to move',
                },
                newIndex: {
                    type: 'number',
                    description: 'New 1-based index to move the action to',
                },
            },
            required: ['macroIdentifier', 'actionIndex', 'newIndex'],
        },
    },
    {
        name: 'km_list_groups',
        description: 'List all macro groups with their names and UIDs.',
        inputSchema: { type: 'object' as const, properties: {} },
    },
    {
        name: 'km_create_group',
        description: 'Create a new macro group.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                name: { type: 'string', description: 'Name for the new group' },
            },
            required: ['name'],
        },
    },
    {
        name: 'km_delete_group',
        description: 'Delete a macro group and every macro in it. WARNING: This cannot be undone!',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: { type: 'string', description: 'Group name or UID' },
            },
            required: ['identifier'],
        },
    },
    {
        name: 'km_enable_group',
        description: 'Enable or disable a macro group. Macros in a disabled group do not fire.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                identifier: { type: 'string', description: 'Group name or UID' },
                enabled: { type: 'boolean', description: 'true to enable, false to disable' },
            },
            required: ['identifier', 'enabled'],
        },
    },
    {
        name: 'km_get_trigger_xml',
        description: 'Get the XML definition of a specific trigger in a macro. Triggers are 1-indexed.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                triggerIndex: {
                    type: 'number',
                    description: 'Trigger index (1-based)',
                },
            },
            required: ['macroIdentifier', 'triggerIndex'],
        },
    },
    {
        name: 'km_set_trigger_xml',
        description: 'Set/replace the XML of a specific trigger in a macro. Use km_get_trigger_xml first to understand the format.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                triggerIndex: {
                    type: 'number',
                    description: 'Trigger index (1-based)',
                },
                xml: {
                    type: 'string',
                    description: 'New XML for the trigger',
                },
            },
            required: ['macroIdentifier', 'triggerIndex', 'xml'],
        },
    },

    // High-level Action Helper Tools
    {
        name: 'km_add_notification',
        description: 'Add a notification action to a macro. Much simpler than using km_add_action with raw XML.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                title: {
                    type: 'string',
                    description: 'Notification title',
                },
                message: {
                    type: 'string',
                    description: 'Notification message/body text',
                },
                subtitle: {
                    type: 'string',
                    description: 'Optional subtitle',
                },
            },
            required: ['macroIdentifier', 'title', 'message'],
        },
    },
    {
        name: 'km_add_pause',
        description: 'Add a pause action to a macro.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                seconds: {
                    type: 'number',
                    description: 'Number of seconds to pause',
                },
            },
            required: ['macroIdentifier', 'seconds'],
        },
    },
    {
        name: 'km_add_set_variable',
        description: 'Add an action to set a variable to a text value.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                variable: {
                    type: 'string',
                    description: 'Variable name to set',
                },
                value: {
                    type: 'string',
                    description: 'Value to set the variable to',
                },
            },
            required: ['macroIdentifier', 'variable', 'value'],
        },
    },
    {
        name: 'km_add_calculation',
        description: 'Add an action to set a variable to the result of a calculation (e.g., "Counter + 1").',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                variable: {
                    type: 'string',
                    description: 'Variable name to set',
                },
                expression: {
                    type: 'string',
                    description: 'Calculation expression (e.g., "Counter + 1", "Price * Quantity")',
                },
            },
            required: ['macroIdentifier', 'variable', 'expression'],
        },
    },
    {
        name: 'km_add_display_text',
        description: 'Add an action to display text in a window.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                title: {
                    type: 'string',
                    description: 'Window title',
                },
                text: {
                    type: 'string',
                    description: 'Text to display',
                },
            },
            required: ['macroIdentifier', 'title', 'text'],
        },
    },
    {
        name: 'km_add_if_variable_contains',
        description: 'Add an If-Then-Else action that checks if a variable contains a value.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                variable: {
                    type: 'string',
                    description: 'Variable name to check',
                },
                containsValue: {
                    type: 'string',
                    description: 'Value to check if variable contains',
                },
                thenActionsXml: {
                    type: 'string',
                    description: 'Optional: XML actions for true condition. Pass one or more <dict>...</dict> elements concatenated (they get wrapped in <array>). Example: <dict><key>MacroActionType</key><string>Notification</string><key>Title</key><string>Hi</string><key>Text</key><string>Msg</string></dict>',
                },
                elseActionsXml: {
                    type: 'string',
                    description: 'Optional: XML actions for false condition. Same format as thenActionsXml.',
                },
            },
            required: ['macroIdentifier', 'variable', 'containsValue'],
        },
    },
    {
        name: 'km_add_if_calculation',
        description: 'Add an If-Then-Else action that checks a calculation condition (e.g., "Counter >= 5").',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                calculation: {
                    type: 'string',
                    description: 'Calculation condition (e.g., "Counter >= 5", "Price < MaxPrice")',
                },
                thenActionsXml: {
                    type: 'string',
                    description: 'Optional: XML actions for true condition. Pass one or more <dict>...</dict> elements concatenated (they get wrapped in <array>). Example: <dict><key>MacroActionType</key><string>Notification</string><key>Title</key><string>Hi</string><key>Text</key><string>Msg</string></dict>',
                },
                elseActionsXml: {
                    type: 'string',
                    description: 'Optional: XML actions for false condition. Same format as thenActionsXml.',
                },
            },
            required: ['macroIdentifier', 'calculation'],
        },
    },
    {
        name: 'km_add_execute_macro',
        description: 'Add an action to execute another macro.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID to add the action to',
                },
                macroToExecute: {
                    type: 'string',
                    description: 'Name or UID of the macro to execute',
                },
                parameter: {
                    type: 'string',
                    description: 'Optional parameter to pass to the executed macro',
                },
            },
            required: ['macroIdentifier', 'macroToExecute'],
        },
    },
    {
        name: 'km_add_shell_script',
        description: 'Add an action to execute a shell script.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                macroIdentifier: {
                    type: 'string',
                    description: 'Macro name or UID',
                },
                script: {
                    type: 'string',
                    description: 'Shell script to execute',
                },
                saveToVariable: {
                    type: 'string',
                    description: 'Optional: Variable name to save the script output to',
                },
            },
            required: ['macroIdentifier', 'script'],
        },
    },
];

// Tool annotations (MCP spec): clients such as Claude use these to group tools
// and decide what needs confirmation. Hints describe effects on Keyboard Maestro.
type ToolAnnotations = {
    title: string;
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint: boolean;
};

// Only reads Keyboard Maestro or the bundled docs
const READ = { readOnlyHint: true, openWorldHint: false };
// Adds something new; never removes or overwrites existing data
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// Changes state in a way that is easy to reverse (enable/disable, move)
const UPDATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// Overwrites or deletes existing data
const OVERWRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
    // Docs
    km_search_docs: { title: 'Search Keyboard Maestro docs', ...READ },
    km_get_doc: { title: 'Read Keyboard Maestro doc page', ...READ },
    // Logs
    km_get_errors: { title: 'Get recent macro errors', ...READ },
    km_get_log: { title: 'Read engine log', ...READ },
    // Macros
    km_list_macros: { title: 'List macros', ...READ },
    km_search_macros: { title: 'Search macros', ...READ },
    km_get_macro: { title: 'Get macro', ...READ },
    km_get_macro_xml: { title: 'Get macro XML', ...READ },
    km_create_macro: { title: 'Create macro', ...ADD },
    km_clone_macro: { title: 'Clone macro', ...ADD },
    km_enable_macro: { title: 'Enable or disable macro', ...UPDATE },
    km_move_macro: { title: 'Move macro to group', ...UPDATE },
    km_delete_macro: { title: 'Delete macro', ...DELETE },
    // Running a macro can do anything the macro does, including outside Keyboard Maestro
    km_run_macro: { title: 'Run macro', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    // Groups
    km_list_groups: { title: 'List macro groups', ...READ },
    km_create_group: { title: 'Create macro group', ...ADD },
    km_enable_group: { title: 'Enable or disable macro group', ...UPDATE },
    km_delete_group: { title: 'Delete macro group', ...DELETE },
    // Actions
    km_list_actions: { title: 'List macro actions', ...READ },
    km_get_action_xml: { title: 'Get action XML', ...READ },
    km_add_action: { title: 'Add action', ...ADD },
    km_add_notification: { title: 'Add notification action', ...ADD },
    km_add_pause: { title: 'Add pause action', ...ADD },
    km_add_set_variable: { title: 'Add set variable action', ...ADD },
    km_add_calculation: { title: 'Add calculation action', ...ADD },
    km_add_display_text: { title: 'Add display text action', ...ADD },
    km_add_if_variable_contains: { title: 'Add if-variable-contains action', ...ADD },
    km_add_if_calculation: { title: 'Add if-calculation action', ...ADD },
    km_add_execute_macro: { title: 'Add execute macro action', ...ADD },
    km_add_shell_script: { title: 'Add shell script action', ...ADD },
    km_move_action: { title: 'Move action', ...UPDATE, idempotentHint: false },
    km_set_action_xml: { title: 'Replace action XML', ...OVERWRITE },
    km_search_replace_action: { title: 'Search and replace in action', ...OVERWRITE, idempotentHint: false },
    km_delete_action: { title: 'Delete action', ...DELETE },
    // Triggers
    km_get_trigger_xml: { title: 'Get trigger XML', ...READ },
    km_add_trigger: { title: 'Add trigger', ...ADD },
    km_set_trigger_xml: { title: 'Replace trigger XML', ...OVERWRITE },
    km_delete_trigger: { title: 'Delete trigger', ...DELETE },
    // Variables
    km_get_variable: { title: 'Get variable', ...READ },
    km_set_variable: { title: 'Set variable', ...OVERWRITE },
    km_delete_variable: { title: 'Delete variable', ...DELETE },
};

const ANNOTATED_TOOLS = TOOLS.map(tool => {
    const annotations = TOOL_ANNOTATIONS[tool.name];
    if (!annotations) throw new Error(`Missing annotations for tool ${tool.name}`);
    return { ...tool, title: annotations.title, annotations };
});

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ANNOTATED_TOOLS };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            // Documentation tools
            case 'km_search_docs': {
                const query = ((args?.query as string) || '').trim();
                const category = args?.category as string | undefined;
                if (!query) {
                    if (!category) {
                        return { content: [{ type: 'text', text: JSON.stringify({ categories: listCategories() }, null, 2) }] };
                    }
                    const pages = listDocs(category).map(p => ({ id: p.id, title: p.title }));
                    return { content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }] };
                }
                const results = searchDocs(query, { category, limit: args?.limit as number | undefined });
                const text = results.length ? JSON.stringify(results, null, 2) : `No docs found for "${query}".`;
                return { content: [{ type: 'text', text }] };
            }

            case 'km_get_doc': {
                const page = args?.page as string;
                if (!page) throw new Error('page is required');
                if (/^(km-docs:\/\/)?guide(\/macro_authoring)?$/i.test(page.trim())) {
                    return { content: [{ type: 'text', text: MACRO_AUTHORING_GUIDE }] };
                }
                return { content: [{ type: 'text', text: getDocMarkdown(page) }] };
            }

            // Log tools
            case 'km_get_errors': {
                const hours = (args?.hours as number) || 24;
                const result = await getErrorSummary(hours);
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            case 'km_get_log': {
                const options = {
                    lines: (args?.lines as number) || 100,
                    errorsOnly: (args?.errorsOnly as boolean) || false,
                    macroFilter: args?.macroFilter as string | undefined,
                };
                const entries = await readEngineLog(options);
                return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
            }

            // Macro tools
            case 'km_list_macros': {
                const macros = await listMacros();
                return { content: [{ type: 'text', text: JSON.stringify(macros, null, 2) }] };
            }



            case 'km_get_macro': {
                const identifier = args?.identifier as string;
                if (!identifier) throw new Error('identifier is required');
                const result = await getMacro(identifier);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_get_macro_xml': {
                const identifier = args?.identifier as string;
                if (!identifier) throw new Error('identifier is required');
                const xml = await getMacroXml(identifier);
                return { content: [{ type: 'text', text: xml }] };
            }

            case 'km_create_macro': {
                const name = args?.name as string;
                if (!name) throw new Error('name is required');
                const actionXml = args?.actionXml as string | undefined;
                const groupName = args?.groupName as string | undefined;
                const result = await createMacro(name, actionXml, groupName);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_search_macros': {
                const query = args?.query as string;
                if (!query) throw new Error('query is required');
                const result = await searchMacros(query);
                return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
            }

            case 'km_clone_macro': {
                const identifier = args?.identifier as string;
                if (!identifier) throw new Error('identifier is required');
                const newName = args?.newName as string | undefined;
                const result = await duplicateMacro(identifier, newName);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_action': {
                const macroId = args?.macroIdentifier as string;
                const actionXml = args?.actionXml as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!actionXml) throw new Error('actionXml is required');
                const result = await addAction(macroId, actionXml);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_delete_macro': {
                const identifier = args?.identifier as string;
                if (!identifier) throw new Error('identifier is required');
                const result = await deleteMacro(identifier);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_enable_macro': {
                const identifier = args?.identifier as string;
                const enabled = args?.enabled as boolean;
                if (!identifier) throw new Error('identifier is required');
                if (enabled === undefined) throw new Error('enabled is required');
                const result = await setMacroEnabled(identifier, enabled);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_run_macro': {
                const identifier = args?.identifier as string;
                if (!identifier) throw new Error('identifier is required');
                const parameter = args?.parameter as string | undefined;
                const result = await executeMacro(identifier, parameter);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_move_macro': {
                const macroId = args?.macroIdentifier as string;
                const groupId = args?.groupIdentifier as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!groupId) throw new Error('groupIdentifier is required');
                const result = await moveMacroToGroup(macroId, groupId);
                return { content: [{ type: 'text', text: result }] };
            }

            // Variable tools
            case 'km_get_variable': {
                const name = args?.name as string;
                if (!name) throw new Error('name is required');
                const val = await getVariable(name);
                return { content: [{ type: 'text', text: val || '(empty)' }] };
            }

            case 'km_set_variable': {
                const name = args?.name as string;
                const value = args?.value as string;
                if (!name) throw new Error('name is required');
                if (value === undefined) throw new Error('value is required');
                const result = await setVariable(name, value);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_delete_variable': {
                const name = args?.name as string;
                if (!name) throw new Error('name is required');
                const result = await deleteVariable(name);
                return { content: [{ type: 'text', text: result }] };
            }

            // Action editing tools
            case 'km_get_action_xml': {
                const macroId = args?.macroIdentifier as string;
                const actionIdx = args?.actionIndex as number;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!actionIdx) throw new Error('actionIndex is required');
                const xml = await getActionXml(macroId, actionIdx);
                return { content: [{ type: 'text', text: xml }] };
            }

            case 'km_set_action_xml': {
                const macroId = args?.macroIdentifier as string;
                const actionIdx = args?.actionIndex as number;
                const xml = args?.xml as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!actionIdx) throw new Error('actionIndex is required');
                if (!xml) throw new Error('xml is required');
                const result = await setActionXml(macroId, actionIdx, xml);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_search_replace_action': {
                const macroId = args?.macroIdentifier as string;
                const actionIdx = args?.actionIndex as number;
                const searchText = args?.searchText as string;
                const replaceText = args?.replaceText as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!actionIdx) throw new Error('actionIndex is required');
                if (!searchText) throw new Error('searchText is required');
                if (replaceText === undefined) throw new Error('replaceText is required');
                const result = await searchReplaceInAction(macroId, actionIdx, searchText, replaceText);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_delete_action': {
                const macroId = args?.macroIdentifier as string;
                const actionIdx = args?.actionIndex as number;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!actionIdx) throw new Error('actionIndex is required');
                const result = await deleteAction(macroId, actionIdx);
                return { content: [{ type: 'text', text: result }] };
            }

            // Trigger editing tools
            case 'km_add_trigger': {
                const macroId = args?.macroIdentifier as string;
                const triggerXml = args?.triggerXml as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!triggerXml) throw new Error('triggerXml is required');
                const result = await addTrigger(macroId, triggerXml);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_delete_trigger': {
                const macroId = args?.macroIdentifier as string;
                const triggerIdx = args?.triggerIndex as number;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!triggerIdx) throw new Error('triggerIndex is required');
                const result = await deleteTrigger(macroId, triggerIdx);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_list_actions': {
                const macroId = args?.macroIdentifier as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                const actions = await listActions(macroId);
                return { content: [{ type: 'text', text: JSON.stringify(actions, null, 2) }] };
            }

            case 'km_move_action': {
                const { macroIdentifier, actionIndex, newIndex } = args as { macroIdentifier: string, actionIndex: number, newIndex: number };
                const result = await moveAction(macroIdentifier, actionIndex, newIndex);
                return {
                    content: [{ type: "text", text: result }],
                };
            }

            case 'km_list_groups': {
                const groups = await listGroups();
                return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] };
            }

            case 'km_create_group': {
                const name = args?.name as string;
                if (!name) throw new Error('name is required');
                const result = await createGroup(name);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_delete_group': {
                const identifier = args?.identifier as string;
                if (!identifier) throw new Error('identifier is required');
                const result = await deleteGroup(identifier);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_enable_group': {
                const identifier = args?.identifier as string;
                const enabled = args?.enabled as boolean;
                if (!identifier) throw new Error('identifier is required');
                if (enabled === undefined) throw new Error('enabled is required');
                const result = await toggleGroup(identifier, enabled);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_get_trigger_xml': {
                const macroId = args?.macroIdentifier as string;
                const triggerIdx = args?.triggerIndex as number;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!triggerIdx) throw new Error('triggerIndex is required');
                const xml = await getTriggerXml(macroId, triggerIdx);
                return { content: [{ type: 'text', text: xml }] };
            }

            case 'km_set_trigger_xml': {
                const macroId = args?.macroIdentifier as string;
                const triggerIdx = args?.triggerIndex as number;
                const xml = args?.xml as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!triggerIdx) throw new Error('triggerIndex is required');
                if (!xml) throw new Error('xml is required');
                const result = await setTriggerXml(macroId, triggerIdx, xml);
                return { content: [{ type: 'text', text: result }] };
            }

            // High-level Action Helper Tools
            case 'km_add_notification': {
                const macroId = args?.macroIdentifier as string;
                const title = args?.title as string;
                const message = args?.message as string;
                const subtitle = args?.subtitle as string | undefined;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!title) throw new Error('title is required');
                if (!message) throw new Error('message is required');
                const result = await addNotificationAction(macroId, title, message, subtitle);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_pause': {
                const macroId = args?.macroIdentifier as string;
                const seconds = args?.seconds as number;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (seconds === undefined) throw new Error('seconds is required');
                const result = await addPauseAction(macroId, seconds);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_set_variable': {
                const macroId = args?.macroIdentifier as string;
                const variable = args?.variable as string;
                const value = args?.value as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!variable) throw new Error('variable is required');
                if (value === undefined) throw new Error('value is required');
                const result = await addSetVariableAction(macroId, variable, value);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_calculation': {
                const macroId = args?.macroIdentifier as string;
                const variable = args?.variable as string;
                const expression = args?.expression as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!variable) throw new Error('variable is required');
                if (!expression) throw new Error('expression is required');
                const result = await addCalculationAction(macroId, variable, expression);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_display_text': {
                const macroId = args?.macroIdentifier as string;
                const title = args?.title as string;
                const text = args?.text as string;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!title) throw new Error('title is required');
                if (!text) throw new Error('text is required');
                const result = await addDisplayTextAction(macroId, title, text);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_if_variable_contains': {
                const macroId = args?.macroIdentifier as string;
                const variable = args?.variable as string;
                const containsValue = args?.containsValue as string;
                const thenActionsXml = args?.thenActionsXml as string | undefined;
                const elseActionsXml = args?.elseActionsXml as string | undefined;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!variable) throw new Error('variable is required');
                if (!containsValue) throw new Error('containsValue is required');
                const result = await addIfVariableContainsAction(macroId, variable, containsValue, thenActionsXml, elseActionsXml);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_if_calculation': {
                const macroId = args?.macroIdentifier as string;
                const calculation = args?.calculation as string;
                const thenActionsXml = args?.thenActionsXml as string | undefined;
                const elseActionsXml = args?.elseActionsXml as string | undefined;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!calculation) throw new Error('calculation is required');
                const result = await addIfCalculationAction(macroId, calculation, thenActionsXml, elseActionsXml);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_execute_macro': {
                const macroId = args?.macroIdentifier as string;
                const macroToExecute = args?.macroToExecute as string;
                const parameter = args?.parameter as string | undefined;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!macroToExecute) throw new Error('macroToExecute is required');
                const result = await addExecuteMacroAction(macroId, macroToExecute, parameter);
                return { content: [{ type: 'text', text: result }] };
            }

            case 'km_add_shell_script': {
                const macroId = args?.macroIdentifier as string;
                const script = args?.script as string;
                const saveToVariable = args?.saveToVariable as string | undefined;
                if (!macroId) throw new Error('macroIdentifier is required');
                if (!script) throw new Error('script is required');
                const result = await addShellScriptAction(macroId, script, saveToVariable);
                return { content: [{ type: 'text', text: result }] };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

// Documentation resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: GUIDE_URI,
                name: 'Guide: Building Keyboard Maestro macros',
                description: 'How to use this server to write macros: variables, tokens, action XML, safe editing',
                mimeType: 'text/markdown',
            },
            ...listDocs().map(p => ({
                uri: docUri(p),
                name: `${p.category === 'topic' ? '' : p.category + ': '}${p.title}`,
                mimeType: 'text/markdown',
            })),
        ],
    };
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
        resourceTemplates: [
            {
                uriTemplate: `${DOCS_URI_PREFIX}{category}/{page}`,
                name: 'Keyboard Maestro wiki page',
                description: 'A page from the Keyboard Maestro wiki, e.g. km-docs://action/Execute_a_Shell_Script',
                mimeType: 'text/markdown',
            },
        ],
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const text = uri === GUIDE_URI ? MACRO_AUTHORING_GUIDE : getDocMarkdown(uri);
    return { contents: [{ uri, mimeType: 'text/markdown', text }] };
});

// Prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: [
            {
                name: 'km_macro_authoring',
                description: 'Load the guide for building and editing Keyboard Maestro macros with this server',
                arguments: [
                    {
                        name: 'task',
                        description: 'Optional: what the macro should do',
                        required: false,
                    },
                ],
            },
        ],
    };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== 'km_macro_authoring') {
        throw new Error(`Unknown prompt: ${request.params.name}`);
    }
    const task = request.params.arguments?.task?.trim();
    const text = MACRO_AUTHORING_GUIDE + (task
        ? `\n## Task\n${task}\n\nLook up the relevant actions and tokens with km_search_docs before building the macro.\n`
        : '');
    return {
        description: 'Keyboard Maestro macro authoring guide',
        messages: [{ role: 'user', content: { type: 'text', text } }],
    };
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Keyboard Maestro MCP server running on stdio');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
