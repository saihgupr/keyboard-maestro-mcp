import { runAppleScript } from '../utils/applescript.js';

interface Variable {
    name: string;
    value: string;
}

/**
 * Get a Keyboard Maestro variable value
 */
export async function getVariable(name: string): Promise<string> {
    try {
        const result = await runAppleScript(
            `tell application "Keyboard Maestro Engine" to getvariable "${name}"`
        );
        return result;
    } catch (error: any) {
        throw new Error(`Failed to get variable "${name}": ${error.message}`);
    }
}

/**
 * Set a Keyboard Maestro variable value
 */
export async function setVariable(name: string, value: string): Promise<string> {
    try {
        // Escape the value for AppleScript
        const escapedValue = value.replace(/"/g, '\\"');

        await runAppleScript(
            `tell application "Keyboard Maestro Engine" to setvariable "${name}" to "${escapedValue}"`
        );
        return `Variable "${name}" set successfully`;
    } catch (error: any) {
        throw new Error(`Failed to set variable "${name}": ${error.message}`);
    }
}

/**
 * Delete a Keyboard Maestro variable
 */
export async function deleteVariable(name: string): Promise<string> {
    try {
        await runAppleScript(
            `tell application "Keyboard Maestro Engine" to setvariable "${name}" to "%Delete%"`
        );
        return `Variable "${name}" deleted successfully`;
    } catch (error: any) {
        throw new Error(`Failed to delete variable "${name}": ${error.message}`);
    }
}

/**
 * List variables that match a pattern (prefix-based)
 * Note: KM doesn't have a native "list all variables" command,
 * so this reads from the Engine log which often shows variable usage
 */
export async function searchVariables(prefix: string): Promise<string[]> {
    try {
        // This is a workaround - we'll try to get variables with common prefixes
        // In practice, you'd want to know your variable names
        const testVars = [
            `${prefix}`,
            `${prefix}1`,
            `${prefix}2`,
            `${prefix}3`,
        ];

        const foundVars: string[] = [];

        for (const varName of testVars) {
            try {
                const value = await getVariable(varName);
                if (value) {
                    foundVars.push(varName);
                }
            } catch {
                // Variable doesn't exist, skip
            }
        }

        return foundVars;
    } catch (error: any) {
        throw new Error(`Failed to search variables: ${error.message}`);
    }
}
