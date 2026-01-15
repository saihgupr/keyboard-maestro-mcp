import { runAppleScript, runAppleScriptFile } from '../utils/applescript.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Helper to wrap XML content in a full plist if not already wrapped
 */
function wrapXmlInPlist(xml: string): string {
  const trimmed = xml.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<plist')) {
    return trimmed;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${trimmed}
</plist>`;
}

/**
 * Write XML to a temp file and return the path.
 * This avoids AppleScript string escaping issues that cause "Invalid XML From AppleScript" errors.
 */
function writeTempXml(xml: string): string {
  const tempPath = path.join(os.tmpdir(), `km_action_${Date.now()}.plist`);
  fs.writeFileSync(tempPath, wrapXmlInPlist(xml), 'utf8');
  return tempPath;
}

/**
 * Clean up a temp file
 */
function cleanupTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}


interface MacroInfo {
  name: string;
  uid: string;
  enabled?: boolean;
  group?: string;
}

interface MacroGroup {
  name: string;
  uid: string;
  macroCount?: number;
}

/**
 * List all macros from Keyboard Maestro
 */
export async function listMacros(): Promise<MacroInfo[]> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to ";;;"
  
  set idList to id of every macro
  set nameList to name of every macro
  set countMacros to count of idList
  
  set resultList to {}
  repeat with i from 1 to countMacros
    set end of resultList to (item i of nameList) & "|||" & (item i of idList)
  end repeat
  
  set output to resultList as text
  set AppleScript's text item delimiters to oldDelims
  return output
end tell`;

    const result = await runAppleScriptFile(script);

    if (!result.trim()) return [];

    return result.split(';;;').map(item => {
      const [name, uid] = item.split('|||');
      return {
        name: name || '',
        uid: uid || ''
      };
    });
  } catch (error: any) {
    throw new Error(`Failed to list macros: ${error.message}`);
  }
}
/**
 * Search for macros by name
 */
export async function searchMacros(query: string): Promise<MacroInfo[]> {
  const escapedQuery = query.replace(/"/g, '\\"');
  try {
    const script = `
tell application "Keyboard Maestro"
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to ";;;"
  
  set matchMacros to every macro whose name contains "${escapedQuery}"
  
  set resultList to {}
  repeat with aMacro in matchMacros
    set end of resultList to (name of aMacro) & "|||" & (id of aMacro)
  end repeat
  
  set output to resultList as text
  set AppleScript's text item delimiters to oldDelims
  return output
end tell`;

    const result = await runAppleScriptFile(script);

    if (!result.trim()) return [];

    return result.split(';;;').map(item => {
      const [name, uid] = item.split('|||');
      return {
        name: name || '',
        uid: uid || ''
      };
    });
  } catch (error: any) {
    throw new Error(`Failed to search macros: ${error.message}`);
  }
}
/**
 * Get macro details by name or UID
 */
export async function getMacro(identifier: string): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${identifier}" or id is "${identifier}"
  return name of theMacro & "|" & id of theMacro & "|" & enabled of theMacro
end tell`;

    const result = await runAppleScriptFile(script);
    const [name, uid, enabled] = result.split('|');

    return JSON.stringify({ name, uid, enabled: enabled === 'true' });
  } catch (error: any) {
    throw new Error(`Failed to get macro: ${error.message}`);
  }
}

/**
 * Get the full XML definition of a macro
 */
export async function getMacroXml(identifier: string): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${identifier}" or id is "${identifier}"
  return xml of theMacro
end tell`;
    return await runAppleScriptFile(script);
  } catch (error: any) {
    throw new Error(`Failed to get macro XML: ${error.message}`);
  }
}

/**
 * Create a new macro with a name. Optionally include action XML to add an initial action.
 */
export async function createMacro(name: string, actionXml?: string, groupName?: string): Promise<string> {
  const escapedName = name.replace(/"/g, '\\"');

  try {
    const script = groupName
      ? `
tell application "Keyboard Maestro"
  set newMacro to make new macro with properties {name:"${escapedName}"}
  set macroId to id of newMacro
  move newMacro to macro group "${groupName.replace(/"/g, '\\"')}"
  return macroId
end tell`
      : `
tell application "Keyboard Maestro"
  set newMacro to make new macro with properties {name:"${escapedName}"}
  return id of newMacro
end tell`;

    const macroId = await runAppleScriptFile(script);


    if (actionXml) {
      await addAction(macroId, actionXml);
    }

    return `Macro "${name}" created successfully with ID: ${macroId}`;
  } catch (error: any) {
    throw new Error(`Failed to create macro: ${error.message}`);
  }
}

/**
 * Duplicate an existing macro
 */
export async function duplicateMacro(identifier: string, newName?: string): Promise<string> {
  try {
    const script = newName
      ? `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${identifier}" or id is "${identifier}"
  set newMacros to duplicate theMacro
  
  if class of newMacros is list then
    set newMacro to item 1 of newMacros
  else
    set newMacro to newMacros
  end if
  
  set name of newMacro to "${newName.replace(/"/g, '\\"')}"
  return id of newMacro
end tell`
      : `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${identifier}" or id is "${identifier}"
  set newMacros to duplicate theMacro
  
  if class of newMacros is list then
    set newMacro to item 1 of newMacros
  else
    set newMacro to newMacros
  end if
  
  return id of newMacro
end tell`;

    const macroId = await runAppleScriptFile(script);
    return `Macro "${identifier}" duplicated successfully. New ID: ${macroId.trim()}`;
  } catch (error: any) {
    throw new Error(`Failed to duplicate macro: ${error.message}`);
  }
}

/**
 * Add an action to an existing macro
 */
export async function addAction(macroIdentifier: string, actionXml: string): Promise<string> {
  const tempPath = writeTempXml(actionXml);
  try {
    // Get current action count before adding
    const countScript = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  return count of actions of theMacro
end tell`;
    const beforeCount = parseInt(await runAppleScriptFile(countScript)) || 0;

    const script = `
set xmlContent to read POSIX file "${tempPath}" as «class utf8»
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    make new action with properties {xml:xmlContent}
  end tell
end tell`;

    await runAppleScriptFile(script);

    // Verify action was actually added
    const afterCount = parseInt(await runAppleScriptFile(countScript)) || 0;
    if (afterCount <= beforeCount) {
      throw new Error('Action was not created - XML may be invalid or malformed');
    }

    return `Action added to macro "${macroIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to add action: ${error.message}`);
  } finally {
    cleanupTempFile(tempPath);
  }
}

/**
 * Move a macro to a different group
 */
export async function moveMacroToGroup(macroIdentifier: string, groupIdentifier: string): Promise<string> {
  try {
    const escapedMacro = macroIdentifier.replace(/"/g, '\\"');
    const escapedGroup = groupIdentifier.replace(/"/g, '\\"');
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${escapedMacro}" or id is "${escapedMacro}"
  set theGroup to first macro group whose name is "${escapedGroup}" or id is "${escapedGroup}"
  move theMacro to theGroup
end tell`;
    await runAppleScriptFile(script);
    return `Macro "${macroIdentifier}" moved to group "${groupIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to move macro: ${error.message}`);
  }
}

/**
 * Add a trigger to a macro
 */
export async function addTrigger(macroIdentifier: string, triggerXml: string): Promise<string> {
  const tempPath = writeTempXml(triggerXml);
  try {
    const script = `
set xmlContent to read POSIX file "${tempPath}" as «class utf8»
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    make new trigger with properties {xml:xmlContent}
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Trigger added to macro "${macroIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to add trigger: ${error.message}`);
  } finally {
    cleanupTempFile(tempPath);
  }
}

/**
 * Delete a trigger from a macro
 */
export async function deleteTrigger(macroIdentifier: string, triggerIndex: number): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    delete trigger ${triggerIndex}
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Trigger ${triggerIndex} deleted from macro "${macroIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to delete trigger: ${error.message}`);
  }
}


/**
 * Delete a macro by name or UID
 */
export async function deleteMacro(identifier: string): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  delete (first macro whose name is "${identifier}" or id is "${identifier}")
end tell`;

    await runAppleScriptFile(script);
    return `Macro "${identifier}" deleted successfully`;
  } catch (error: any) {
    throw new Error(`Failed to delete macro: ${error.message}`);
  }
}

/**
 * Enable or disable a macro
 */
export async function setMacroEnabled(identifier: string, enabled: boolean): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set enabled of (first macro whose name is "${identifier}" or id is "${identifier}") to ${enabled}
end tell`;

    await runAppleScriptFile(script);
    return `Macro "${identifier}" ${enabled ? 'enabled' : 'disabled'} successfully`;
  } catch (error: any) {
    throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} macro: ${error.message}`);
  }
}

/**
 * List all macro groups
 */
export async function listGroups(): Promise<MacroGroup[]> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to ";;;"
  set groupList to {}
  repeat with aGroup in macro groups
    set end of groupList to (name of aGroup & "|||" & id of aGroup)
  end repeat
  set resultList to groupList as text
  set AppleScript's text item delimiters to oldDelims
  return resultList
end tell`;

    const result = await runAppleScriptFile(script);

    if (!result.trim()) return [];

    return result.split(';;;').map(item => {
      const [name, uid] = item.split('|||');
      return { name: name?.trim() || '', uid: uid?.trim() || '' };
    }).filter(g => g.name);
  } catch (error: any) {
    throw new Error(`Failed to list groups: ${error.message}`);
  }
}

/**
 * Create a new macro group
 */
export async function createGroup(name: string): Promise<string> {
  try {
    const escapedName = name.replace(/"/g, '\\"');
    const script = `
tell application "Keyboard Maestro"
  set newGroup to make new macro group with properties {name:"${escapedName}"}
  return id of newGroup
end tell`;

    const groupId = await runAppleScriptFile(script);

    return `Macro Group "${name}" created successfully with ID: ${groupId.trim()}`;
  } catch (error: any) {
    throw new Error(`Failed to create macro group: ${error.message}`);
  }
}

/**
 * Delete a macro group
 */
export async function deleteGroup(identifier: string): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  delete (first macro group whose name is "${identifier}" or id is "${identifier}")
end tell`;

    await runAppleScriptFile(script);
    return `Macro Group "${identifier}" deleted successfully`;
  } catch (error: any) {
    throw new Error(`Failed to delete macro group: ${error.message}`);
  }
}

/**
 * Enable or disable a macro group
 */
export async function toggleGroup(identifier: string, enabled: boolean): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set enabled of (first macro group whose name is "${identifier}" or id is "${identifier}") to ${enabled}
end tell`;

    await runAppleScriptFile(script);
    return `Macro Group "${identifier}" ${enabled ? 'enabled' : 'disabled'} successfully`;
  } catch (error: any) {
    throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} macro group: ${error.message}`);
  }
}

/**
 * Execute a macro by name or UID
 */
export async function executeMacro(identifier: string, parameter?: string): Promise<string> {
  try {
    const script = parameter
      ? `tell application "Keyboard Maestro Engine" to do script "${identifier}" with parameter "${parameter}"`
      : `tell application "Keyboard Maestro Engine" to do script "${identifier}"`;

    await runAppleScript(script);
    return `Macro "${identifier}" executed successfully`;
  } catch (error: any) {
    throw new Error(`Failed to execute macro: ${error.message}`);
  }
}

/**
 * Get the XML of a specific action in a macro
 */
export async function getActionXml(macroIdentifier: string, actionIndex: number): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    return xml of action ${actionIndex}
  end tell
end tell`;

    return await runAppleScriptFile(script);
  } catch (error: any) {
    throw new Error(`Failed to get action XML: ${error.message}`);
  }
}

/**
 * Set the XML of a specific action in a macro (edit the action)
 */
export async function setActionXml(macroIdentifier: string, actionIndex: number, xml: string): Promise<string> {
  const tempPath = writeTempXml(xml);
  try {
    const script = `
set xmlContent to read POSIX file "${tempPath}" as «class utf8»
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    set xml of action ${actionIndex} to xmlContent
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Action ${actionIndex} in macro "${macroIdentifier}" updated successfully`;
  } catch (error: any) {
    throw new Error(`Failed to set action XML: ${error.message}`);
  } finally {
    cleanupTempFile(tempPath);
  }
}

/**
 * Delete a specific action from a macro
 */
export async function deleteAction(macroIdentifier: string, actionIndex: number): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    delete action ${actionIndex}
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Action ${actionIndex} deleted from macro "${macroIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to delete action: ${error.message}`);
  }
}

/**
 * Search and replace text in a macro action
 */
export async function searchReplaceInAction(
  macroIdentifier: string,
  actionIndex: number,
  searchText: string,
  replaceText: string
): Promise<string> {
  try {
    // Escape for AppleScript
    const escapedSearch = searchText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedReplace = replaceText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    set theXML to xml of action ${actionIndex}
    tell application "Keyboard Maestro Engine"
      set fixedXML to search theXML for "${escapedSearch}" replace "${escapedReplace}" regex false case sensitive true process tokens false
    end tell
    set xml of action ${actionIndex} to fixedXML
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Replaced "${searchText}" with "${replaceText}" in action ${actionIndex} of macro "${macroIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to search/replace in action: ${error.message}`);
  }
}

/**
 * List actions in a macro
 */
export async function listActions(macroIdentifier: string): Promise<any[]> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  set resultList to {}
  set actionCount to count of actions of theMacro
  
  repeat with i from 1 to actionCount
    set theAction to action i of theMacro
    set actionName to name of theAction
    set actionEnabled to enabled of theAction
    set end of resultList to (i as text) & "|||" & actionName & "|||" & (actionEnabled as text)
  end repeat
  
  set oldDelims to AppleScript's text item delimiters
  set AppleScript's text item delimiters to ";;;"
  set output to resultList as text
  set AppleScript's text item delimiters to oldDelims
  return output
end tell`;

    const result = await runAppleScriptFile(script);

    if (!result.trim()) return [];

    return result.split(';;;').map(item => {
      const [index, name, enabled] = item.split('|||');
      return {
        index: parseInt(index),
        name: name,
        enabled: enabled === 'true'
      };
    });
  } catch (error: any) {
    throw new Error(`Failed to list actions: ${error.message}`);
  }
}

/**
 * Move an action to a new position
 */
export async function moveAction(macroIdentifier: string, actionIndex: number, newIndex: number): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    if ${newIndex} > count of actions then
      move action ${actionIndex} to after last action
    else
      move action ${actionIndex} to before action ${newIndex}
    end if
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Moved action ${actionIndex} to index ${newIndex} in macro "${macroIdentifier}"`;
  } catch (error: any) {
    throw new Error(`Failed to move action: ${error.message}`);
  }
}

/**
 * Get the XML of a specific trigger in a macro
 */
export async function getTriggerXml(macroIdentifier: string, triggerIndex: number): Promise<string> {
  try {
    const script = `
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    return xml of trigger ${triggerIndex}
  end tell
end tell`;

    return await runAppleScriptFile(script);
  } catch (error: any) {
    throw new Error(`Failed to get trigger XML: ${error.message}`);
  }
}

/**
 * Set the XML of a specific trigger in a macro
 */
export async function setTriggerXml(macroIdentifier: string, triggerIndex: number, xml: string): Promise<string> {
  const tempPath = writeTempXml(xml);
  try {
    const script = `
set xmlContent to read POSIX file "${tempPath}" as «class utf8»
tell application "Keyboard Maestro"
  set theMacro to first macro whose name is "${macroIdentifier}" or id is "${macroIdentifier}"
  tell theMacro
    set xml of trigger ${triggerIndex} to xmlContent
  end tell
end tell`;

    await runAppleScriptFile(script);
    return `Trigger ${triggerIndex} in macro "${macroIdentifier}" updated successfully`;
  } catch (error: any) {
    throw new Error(`Failed to set trigger XML: ${error.message}`);
  } finally {
    cleanupTempFile(tempPath);
  }
}

// ============================================================================
// HIGH-LEVEL ACTION HELPERS
// These provide simpler interfaces for common action types
// ============================================================================

/**
 * Add a notification action to a macro
 */
export async function addNotificationAction(
  macroIdentifier: string,
  title: string,
  message: string,
  subtitle?: string
): Promise<string> {
  const xml = `<dict>
	<key>MacroActionType</key>
	<string>Notification</string>
	<key>Title</key>
	<string>${escapeXml(title)}</string>
	<key>Subtitle</key>
	<string>${escapeXml(subtitle || '')}</string>
	<key>Text</key>
	<string>${escapeXml(message)}</string>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add a pause action to a macro
 */
export async function addPauseAction(
  macroIdentifier: string,
  seconds: number
): Promise<string> {
  const xml = `<dict>
	<key>MacroActionType</key>
	<string>Pause</string>
	<key>Time</key>
	<string>${seconds}</string>
	<key>TimeOutAbortsMacro</key>
	<true/>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add a set variable to text action
 */
export async function addSetVariableAction(
  macroIdentifier: string,
  variable: string,
  value: string
): Promise<string> {
  const xml = `<dict>
	<key>MacroActionType</key>
	<string>SetVariableToText</string>
	<key>Variable</key>
	<string>${escapeXml(variable)}</string>
	<key>Text</key>
	<string>${escapeXml(value)}</string>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add a set variable to calculation action
 */
export async function addCalculationAction(
  macroIdentifier: string,
  variable: string,
  expression: string
): Promise<string> {
  const xml = `<dict>
	<key>MacroActionType</key>
	<string>SetVariableToCalculation</string>
	<key>Variable</key>
	<string>${escapeXml(variable)}</string>
	<key>Text</key>
	<string>${escapeXml(expression)}</string>
	<key>UseFormat</key>
	<false/>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add a display text action (shows text in a window)
 */
export async function addDisplayTextAction(
  macroIdentifier: string,
  title: string,
  text: string
): Promise<string> {
  const xml = `<dict>
	<key>MacroActionType</key>
	<string>Alert</string>
	<key>Title</key>
	<string>${escapeXml(title)}</string>
	<key>Text</key>
	<string>${escapeXml(text)}</string>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add an if-then-else action based on variable containing a value
 */
export async function addIfVariableContainsAction(
  macroIdentifier: string,
  variable: string,
  containsValue: string,
  thenActionsXml?: string,
  elseActionsXml?: string
): Promise<string> {
  const thenActions = thenActionsXml ? thenActionsXml : '';
  const elseActions = elseActionsXml ? elseActionsXml : '';

  const xml = `<dict>
	<key>MacroActionType</key>
	<string>IfThenElse</string>
	<key>Conditions</key>
	<dict>
		<key>ConditionList</key>
		<array>
			<dict>
				<key>ConditionType</key>
				<string>Variable</string>
				<key>Variable</key>
				<string>${escapeXml(variable)}</string>
				<key>VariableConditionType</key>
				<string>Contains</string>
				<key>VariableValue</key>
				<string>${escapeXml(containsValue)}</string>
			</dict>
		</array>
		<key>ConditionListMatch</key>
		<string>All</string>
	</dict>
	<key>ThenActions</key>
	<array>${thenActions}</array>
	<key>ElseActions</key>
	<array>${elseActions}</array>
	<key>TimeOutAbortsMacro</key>
	<true/>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add an if-then-else action based on a calculation condition
 */
export async function addIfCalculationAction(
  macroIdentifier: string,
  calculation: string,
  thenActionsXml?: string,
  elseActionsXml?: string
): Promise<string> {
  const thenActions = thenActionsXml ? thenActionsXml : '';
  const elseActions = elseActionsXml ? elseActionsXml : '';

  const xml = `<dict>
	<key>MacroActionType</key>
	<string>IfThenElse</string>
	<key>Conditions</key>
	<dict>
		<key>ConditionList</key>
		<array>
			<dict>
				<key>ConditionType</key>
				<string>Calculation</string>
				<key>Text</key>
				<string>${escapeXml(calculation)}</string>
			</dict>
		</array>
		<key>ConditionListMatch</key>
		<string>All</string>
	</dict>
	<key>ThenActions</key>
	<array>${thenActions}</array>
	<key>ElseActions</key>
	<array>${elseActions}</array>
	<key>TimeOutAbortsMacro</key>
	<true/>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add an execute macro action
 */
export async function addExecuteMacroAction(
  macroIdentifier: string,
  macroToExecute: string,
  parameter?: string
): Promise<string> {
  // First get the UID of the macro to execute
  const macroInfo = await getMacro(macroToExecute);
  const parsed = JSON.parse(macroInfo);
  const macroUID = parsed.uid;

  const xml = parameter
    ? `<dict>
	<key>MacroActionType</key>
	<string>ExecuteMacro</string>
	<key>MacroUID</key>
	<string>${macroUID}</string>
	<key>UseParameter</key>
	<true/>
	<key>Parameter</key>
	<string>${escapeXml(parameter)}</string>
	<key>TimeOutAbortsMacro</key>
	<true/>
	<key>Asynchronously</key>
	<false/>
</dict>`
    : `<dict>
	<key>MacroActionType</key>
	<string>ExecuteMacro</string>
	<key>MacroUID</key>
	<string>${macroUID}</string>
	<key>UseParameter</key>
	<false/>
	<key>TimeOutAbortsMacro</key>
	<true/>
	<key>Asynchronously</key>
	<false/>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Add a shell script action
 */
export async function addShellScriptAction(
  macroIdentifier: string,
  script: string,
  saveToVariable?: string
): Promise<string> {
  const displayKind = saveToVariable ? 'Variable' : 'None';
  const variableTag = saveToVariable
    ? `<key>Variable</key>
	<string>${escapeXml(saveToVariable)}</string>`
    : '';

  const xml = `<dict>
	<key>MacroActionType</key>
	<string>ExecuteShellScript</string>
	<key>DisplayKind</key>
	<string>${displayKind}</string>
	${variableTag}
	<key>Text</key>
	<string>${escapeXml(script)}</string>
	<key>UseText</key>
	<true/>
	<key>TimeOutAbortsMacro</key>
	<true/>
	<key>TrimResults</key>
	<true/>
</dict>`;
  return addAction(macroIdentifier, xml);
}

/**
 * Helper to escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
