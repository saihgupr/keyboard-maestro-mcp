import { listMacros } from './tools/macros.js';
import { getVariable, setVariable, deleteVariable } from './tools/variables.js';

async function verify() {
    console.log('🔍 Running Keyboard Maestro MCP connection check...\n');

    try {
        // 1. Check Macro Access
        console.log('1. Checking Macros...');
        const macros = await listMacros();
        console.log(`   ✅ Successfully retrieved definition of ${macros.length} macros.`);
        if (macros.length > 0) {
            console.log(`      Sample: "${macros[0].name}" (${macros[0].uid})`);
        }

        // 2. Check Variable Access
        console.log('\n2. Checking Variables...');
        const TEST_VAR = 'MCP_Connection_Test';
        const TEST_VAL = 'Success-' + Date.now();

        await setVariable(TEST_VAR, TEST_VAL);
        const val = await getVariable(TEST_VAR);

        if (val === TEST_VAL) {
            console.log('   ✅ Successfully set and retrieved a test variable.');
        } else {
            console.error(`   ❌ Variable mismatch. Expected "${TEST_VAL}", got "${val}"`);
            process.exit(1);
        }

        await deleteVariable(TEST_VAR);
        console.log('   ✅ Successfully cleaned up test variable.');

        console.log('\n✨ MCP Server is fully operational and connected to Keyboard Maestro Engine!');
        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ Verification Failed:', error.message);
        if (error.message.includes('Can’t get reference')) {
            console.error('   Hint: Ensure Keyboard Maestro Engine is running.');
        }
        process.exit(1);
    }
}

verify();
