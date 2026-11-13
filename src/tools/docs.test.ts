import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDocs, listCategories, resolveDoc, searchDocs, getDocMarkdown, toMarkdown } from './docs.js';

test('loads the bundled wiki pages', () => {
    assert.ok(listDocs().length > 500);
    const categories = listCategories().map(c => c.category);
    for (const c of ['action', 'token', 'function', 'condition', 'trigger', 'manual', 'topic']) {
        assert.ok(categories.includes(c), `missing category ${c}`);
    }
});

test('resolves page references in every supported form', () => {
    const id = 'action/Execute_a_Shell_Script';
    for (const ref of [id, 'action:Execute_a_Shell_Script', 'action:Execute a Shell Script',
        'km-docs://action/Execute_a_Shell_Script', 'Execute_a_Shell_Script', 'Execute a Shell Script']) {
        assert.equal(resolveDoc(ref)?.id, id, ref);
    }
    assert.equal(resolveDoc('Tokens')?.id, 'Tokens');
    assert.equal(resolveDoc('no such page at all'), undefined);
});

test('search ranks the obvious page first', () => {
    assert.equal(searchDocs('shell script')[0].id, 'action/Execute_a_Shell_Script');
    assert.equal(searchDocs('SystemClipboard', { category: 'token' })[0].id, 'token/SystemClipboard');
    assert.equal(searchDocs('random', { category: 'function' })[0].id, 'function/RANDOM');
    for (const r of searchDocs('variable', { category: 'condition' })) assert.equal(r.category, 'condition');
});

test('CamelCase queries fall back to split words', () => {
    assert.ok(searchDocs('ClipboardText').length > 0);
});

test('converts DokuWiki markup to Markdown', () => {
    const md = getDocMarkdown('action/Execute_a_Shell_Script');
    assert.match(md, /^<!-- action\/Execute_a_Shell_Script /);
    assert.match(md, /^# Execute a Shell Script$/m);
    assert.match(md, /\]\(km-docs:\/\/action\//);
    assert.doesNotMatch(md, /^={2,}/m);

    // Literal %% inside code spans survives
    assert.match(getDocMarkdown('Tokens'), /Use `%%` or `\\%` to return a single `%`/);
});

test('every internal link in every page resolves', () => {
    const broken: string[] = [];
    for (const page of listDocs()) {
        for (const m of toMarkdown(page).matchAll(/\]\(km-docs:\/\/([^)]+)\)/g)) {
            if (!resolveDoc(m[1])) broken.push(`${page.id} -> ${m[1]}`);
        }
    }
    assert.deepEqual(broken, []);
});

test('unknown pages report close matches', () => {
    assert.throws(() => getDocMarkdown('shell scrpt thing'), /No Keyboard Maestro doc page matches/);
});
