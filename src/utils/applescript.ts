import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute an AppleScript and return the result
 */
export async function runAppleScript(script: string): Promise<string> {
    try {
        const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { maxBuffer: 1024 * 1024 * 50 });
        if (stderr) {
            console.error('AppleScript stderr:', stderr);
        }
        return stdout.trim();
    } catch (error: any) {
        throw new Error(`AppleScript error: ${error.message}`);
    }
}

/**
 * Execute a multi-line AppleScript
 */
export async function runAppleScriptFile(script: string): Promise<string> {
    try {
        // Use heredoc style for multi-line scripts
        const { stdout, stderr } = await execAsync(`osascript <<'APPLESCRIPT'
${script}
APPLESCRIPT`, { maxBuffer: 1024 * 1024 * 50 });
        if (stderr) {
            console.error('AppleScript stderr:', stderr);
        }
        return stdout.trim();
    } catch (error: any) {
        throw new Error(`AppleScript error: ${error.message}`);
    }
}

/**
 * Parse XML plist to extract macro information
 */
export function parseMacrosFromXml(xmlHex: string): any[] {
    try {
        // The getmacros command returns hex-encoded XML
        const xml = Buffer.from(xmlHex.replace(/[^0-9A-Fa-f]/g, ''), 'hex').toString('utf8');

        // Simple extraction of macro names and UIDs using regex
        const macros: any[] = [];
        const macroRegex = /<key>name<\/key>\s*<string>([^<]+)<\/string>[\s\S]*?<key>uid<\/key>\s*<string>([^<]+)<\/string>/gi;

        let match;
        while ((match = macroRegex.exec(xml)) !== null) {
            macros.push({
                name: match[1],
                uid: match[2]
            });
        }

        return macros;
    } catch (error) {
        console.error('Error parsing XML:', error);
        return [];
    }
}
