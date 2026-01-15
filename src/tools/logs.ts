import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

const ENGINE_LOG_PATH = path.join(homedir(), 'Library/Logs/Keyboard Maestro/Engine.log');
const EDITOR_LOG_PATH = path.join(homedir(), 'Library/Logs/Keyboard Maestro/Editor.log');

interface LogEntry {
    timestamp: string;
    date: Date;
    message: string;
    isError: boolean;
    macroName?: string;
    actionId?: string;
    errorDetails?: string;
}

/**
 * Parse a single log line into a structured entry
 */
function parseLogLine(line: string): LogEntry | null {
    // Format: 2025-12-19 09:10:00 Message text
    const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+)$/);
    if (!match) return null;

    const [, timestamp, message] = match;
    const date = new Date(timestamp);

    const isError = /failed|error|cancelled|timeout/i.test(message);

    // Extract macro name if present - multiple patterns
    let macroName: string | undefined;

    // Pattern 1: Macro "Name" cancelled/executed
    const macroMatch = message.match(/Macro "([^"]+)"/);
    if (macroMatch) {
        macroName = macroMatch[1];
    }

    // Pattern 2: Execute macro "Name"
    if (!macroName) {
        const execMatch = message.match(/Execute macro "([^"]+)"/);
        if (execMatch) {
            macroName = execMatch[1];
        }
    }

    // Extract action ID if present
    const actionMatch = message.match(/Action (\d+)/);
    const actionId = actionMatch ? actionMatch[1] : undefined;

    return {
        timestamp,
        date,
        message,
        isError,
        macroName,
        actionId
    };
}

/**
 * Read and parse the Engine log file
 */
export async function readEngineLog(options: {
    lines?: number;
    errorsOnly?: boolean;
    since?: Date;
    macroFilter?: string;
} = {}): Promise<LogEntry[]> {
    const { lines = 100, errorsOnly = false, since, macroFilter } = options;

    try {
        const content = await readFile(ENGINE_LOG_PATH, 'utf-8');
        const allLines = content.split('\n').filter(l => l.trim());

        // Take the last N lines
        const recentLines = allLines.slice(-lines);

        let entries = recentLines
            .map(parseLogLine)
            .filter((e): e is LogEntry => e !== null);

        // Apply filters
        if (errorsOnly) {
            entries = entries.filter(e => e.isError);
        }

        if (since) {
            entries = entries.filter(e => e.date >= since);
        }

        if (macroFilter) {
            const filter = macroFilter.toLowerCase();
            entries = entries.filter(e =>
                e.macroName?.toLowerCase().includes(filter)
            );
        }

        return entries;
    } catch (error: any) {
        throw new Error(`Failed to read Engine log: ${error.message}`);
    }
}

/**
 * Read and parse the Editor log file
 */
export async function readEditorLog(lines: number = 100): Promise<LogEntry[]> {
    try {
        const content = await readFile(EDITOR_LOG_PATH, 'utf-8');
        const allLines = content.split('\n').filter(l => l.trim());
        const recentLines = allLines.slice(-lines);

        return recentLines
            .map(parseLogLine)
            .filter((e): e is LogEntry => e !== null);
    } catch (error: any) {
        throw new Error(`Failed to read Editor log: ${error.message}`);
    }
}

/**
 * Get a summary of recent errors grouped by macro
 */
export async function getErrorSummary(hours: number = 24): Promise<{
    totalErrors: number;
    errorsByMacro: Record<string, { count: number; lastError: string; lastTime: string }>;
    recentErrors: LogEntry[];
}> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const entries = await readEngineLog({ lines: 5000, errorsOnly: true, since });

    const errorsByMacro: Record<string, { count: number; lastError: string; lastTime: string }> = {};

    for (const entry of entries) {
        const key = entry.macroName || 'Unknown';
        if (!errorsByMacro[key]) {
            errorsByMacro[key] = { count: 0, lastError: '', lastTime: '' };
        }
        errorsByMacro[key].count++;
        errorsByMacro[key].lastError = entry.message;
        errorsByMacro[key].lastTime = entry.timestamp;
    }

    return {
        totalErrors: entries.length,
        errorsByMacro,
        recentErrors: entries.slice(-10)
    };
}
