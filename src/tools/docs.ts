/**
 * Keyboard Maestro documentation: an offline copy of the Keyboard Maestro wiki
 * (wiki.keyboardmaestro.com), stored as raw DokuWiki pages in km-docs/.
 *
 * Pages are loaded lazily on first use, converted to Markdown, and searched
 * with a simple ranked keyword search.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const DOCS_URI_PREFIX = 'km-docs://';

// build/tools/docs.js -> <repo>/km-docs
const DOCS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'km-docs');

/** Top-level pages (no namespace) are reported with this category. */
export const TOPIC_CATEGORY = 'topic';

/** Preferred order when a bare page name exists in several categories. */
const CATEGORY_PRIORITY = ['action', 'token', 'function', 'condition', 'trigger', 'manual', 'collection', TOPIC_CATEGORY];

export interface DocPage {
    /** "action/Execute_a_Shell_Script", or "Tokens" for top-level pages */
    id: string;
    category: string;
    slug: string;
    title: string;
    raw: string;
}

interface DocsIndex {
    pages: DocPage[];
    byId: Map<string, DocPage>;      // lowercased id -> page
    bySlug: Map<string, DocPage[]>;  // lowercased slug -> pages
    byTitle: Map<string, DocPage[]>; // lowercased title -> pages
    searchText: Map<DocPage, { title: string; slug: string; body: string }>;
}

let index: DocsIndex | null = null;

function normalizeKey(s: string): string {
    return s.trim().replace(/\s+/g, '_').toLowerCase();
}

function addTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
}

function loadIndex(): DocsIndex {
    if (index) return index;

    if (!fs.existsSync(DOCS_DIR)) {
        throw new Error(`Keyboard Maestro docs not found at ${DOCS_DIR}`);
    }

    const pages: DocPage[] = [];
    const walk = (dir: string, category: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full, entry.name);
            } else if (entry.name.endsWith('.txt')) {
                const slug = entry.name.slice(0, -4);
                const raw = fs.readFileSync(full, 'utf8');
                const heading = raw.match(/^\s*={2,6}\s*(.+?)\s*={2,6}\s*$/m);
                pages.push({
                    id: category === TOPIC_CATEGORY ? slug : `${category}/${slug}`,
                    category,
                    slug,
                    title: heading ? heading[1] : slug.replace(/_/g, ' '),
                    raw,
                });
            }
        }
    };
    walk(DOCS_DIR, TOPIC_CATEGORY);
    pages.sort((a, b) => a.id.localeCompare(b.id));

    const idx: DocsIndex = {
        pages,
        byId: new Map(),
        bySlug: new Map(),
        byTitle: new Map(),
        searchText: new Map(),
    };
    for (const page of pages) {
        idx.byId.set(page.id.toLowerCase(), page);
        addTo(idx.bySlug, page.slug.toLowerCase(), page);
        addTo(idx.byTitle, normalizeKey(page.title), page);
        idx.searchText.set(page, {
            title: page.title.toLowerCase(),
            slug: page.slug.replace(/_/g, ' ').toLowerCase(),
            body: page.raw.toLowerCase(),
        });
    }
    index = idx;
    return idx;
}

function byPriority(a: DocPage, b: DocPage): number {
    const pa = CATEGORY_PRIORITY.indexOf(a.category);
    const pb = CATEGORY_PRIORITY.indexOf(b.category);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
}

/**
 * Resolve a page reference. Accepts "action/Execute_a_Shell_Script",
 * "action:Execute a Shell Script", "km-docs://action/Execute_a_Shell_Script",
 * a bare page name ("Execute_a_Shell_Script") or a page title.
 */
export function resolveDoc(ref: string, contextCategory?: string): DocPage | undefined {
    const idx = loadIndex();
    let key = ref.trim();
    if (key.startsWith(DOCS_URI_PREFIX)) key = key.slice(DOCS_URI_PREFIX.length);
    key = key.replace(/#.*$/, '').replace(/^[:/]+/, '').replace(/:/g, '/');
    key = normalizeKey(key);
    if (!key) return undefined;

    const direct = idx.byId.get(key);
    if (direct) return direct;

    if (!key.includes('/')) {
        if (contextCategory && contextCategory !== TOPIC_CATEGORY) {
            const inContext = idx.byId.get(`${contextCategory}/${key}`);
            if (inContext) return inContext;
        }
        const slugMatches = idx.bySlug.get(key);
        if (slugMatches) return [...slugMatches].sort(byPriority)[0];
    } else {
        // Unknown category prefix: fall back to the slug alone
        const slugMatches = idx.bySlug.get(key.split('/').pop()!);
        if (slugMatches) return [...slugMatches].sort(byPriority)[0];
    }

    const titleMatches = idx.byTitle.get(key.replace(/\//g, '_'));
    if (titleMatches) return [...titleMatches].sort(byPriority)[0];

    return undefined;
}

export function docUri(page: DocPage): string {
    return DOCS_URI_PREFIX + page.id;
}

export function listDocs(category?: string): DocPage[] {
    const pages = loadIndex().pages;
    return category ? pages.filter(p => p.category === category.toLowerCase()) : pages;
}

export function listCategories(): { category: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const p of loadIndex().pages) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    return [...counts.entries()].map(([category, count]) => ({ category, count }))
        .sort((a, b) => byPriority({ category: a.category } as DocPage, { category: b.category } as DocPage));
}

// ---------------------------------------------------------------------------
// DokuWiki -> Markdown
// ---------------------------------------------------------------------------

function convertLink(target: string, text: string | undefined, page: DocPage): string {
    target = target.trim();
    const label = text?.trim();
    if (/^(https?|mailto|ftp):/i.test(target)) {
        return `[${label || target}](${target})`;
    }
    if (target.startsWith('#')) {
        return label || target.slice(1).replace(/_/g, ' ');
    }
    const resolved = resolveDoc(target, page.category);
    const display = label || resolved?.title || target.replace(/^.*[:/]/, '').replace(/#.*$/, '').replace(/_/g, ' ');
    if (!resolved) return display;
    return `[${display}](${docUri(resolved)})`;
}

export function toMarkdown(page: DocPage): string {
    let text = page.raw.replace(/\r\n/g, '\n');

    // Protect code blocks from further conversion
    const blocks: string[] = [];
    const protect = (s: string) => `\u0000${blocks.push(s) - 1}\u0000`;
    text = text.replace(/<(code|file)(?:\s+([^\s>]+))?[^>]*>([\s\S]*?)<\/\1>/g, (_m, _tag, lang, body: string) => {
        const language = lang && lang !== '-' ? lang : '';
        const content = body.replace(/^\n/, '').replace(/\n$/, '');
        if (!content.includes('\n')) return protect('`' + content + '`');
        return protect('\n```' + language + '\n' + content + '\n```\n');
    });
    text = text.replace(/``([^`\n]+?)``|`([^`\n]+?)`/g, m => protect(m));
    text = text.replace(/<nowiki>([\s\S]*?)<\/nowiki>/g, (_m, s) => protect(s));
    text = text.replace(/%%([^\n]*?)%%/g, (_m, s) => protect(s));

    // Namespace listings (<nspages action ...>) become a list of that category
    text = text.replace(/<nspages\s+([\w-]+)[^>]*>/g, (_m, ns: string) => {
        const items = listDocs(ns).map(p => `- [${p.title}](${docUri(p)})`);
        return items.length ? items.join('\n') : '';
    });

    // Headings: ====== H1 ====== ... == H5 ==
    text = text.replace(/^[ \t]*(={2,6})\s*(.+?)\s*={2,6}[ \t]*$/gm, (_m, eq: string, title) =>
        '#'.repeat(7 - eq.length) + ' ' + title);

    // Images
    text = text.replace(/\{\{([^}]*)\}\}/g, (_m, inner: string) => {
        const alt = inner.split('|')[1]?.trim();
        return alt ? `*[image: ${alt}]*` : '';
    });

    // Links
    text = text.replace(/\[\[([^\]|]+?)(?:\|((?:[^\]]|\](?!\]))*))?\]\]/g, (_m, target, label) => convertLink(target, label, page));

    // Inline formatting
    text = text.replace(/<(key|kbd)>(.*?)<\/\1>/g, '`$2`');
    text = text.replace(/<del>(.*?)<\/del>/g, '~~$1~~');
    text = text.replace(/<\/?(sup|sub|wrap|WRAP|note)[^>]*>/g, '');
    text = text.replace(/(?<![:/\w])\/\/(?=\S)((?:(?!:\/\/).)+?)(?<=\S)\/\/(?!\/)/g, '*$1*');
    text = text.replace(/__(.+?)__/g, '$1');

    // Lists: two spaces (or a tab) per level, "*" unordered, "-" ordered
    text = text.replace(/^((?: {2})+|\t+)([*-])[ \t]+/gm, (_m, indent: string, marker) => {
        const level = indent.startsWith('\t') ? indent.length : indent.length / 2;
        return '  '.repeat(Math.max(0, level - 1)) + (marker === '*' ? '- ' : '1. ');
    });
    text = text.replace(/^\*[ \t]+/gm, '- ');

    // Tables: "^" header cells become "|", followed by a separator row
    text = text.replace(/^\^(.*)[\^|][ \t]*$/gm, (_m, inner: string) => {
        const cells = inner.split(/[\^|]/);
        return '| ' + cells.map(c => c.trim()).join(' | ') + ' |\n|' + cells.map(() => ' --- ').join('|') + '|';
    });

    // Forced line breaks
    text = text.replace(/\\\\(\s|$)/g, '<br>$1');

    // Restore protected content
    text = text.replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[Number(i)]);

    return text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface DocSearchResult {
    id: string;
    uri: string;
    title: string;
    category: string;
    snippet: string;
}

function countOccurrences(haystack: string, needle: string, cap: number): number {
    let count = 0;
    let pos = haystack.indexOf(needle);
    while (pos !== -1 && count < cap) {
        count++;
        pos = haystack.indexOf(needle, pos + needle.length);
    }
    return count;
}

function makeSnippet(page: DocPage, terms: string[]): string {
    // Skip the heading line and image/markup noise for the snippet
    const plain = page.raw
        .replace(/^\s*={2,6}.*={2,6}\s*$/gm, ' ')
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
        .replace(/\[\[([^\]]*)\]\]/g, '$1')
        .replace(/[*\/]{2}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const lower = plain.toLowerCase();
    let at = -1;
    for (const t of terms) {
        const i = lower.indexOf(t);
        if (i !== -1 && (at === -1 || i < at)) at = i;
    }
    const start = Math.max(0, at === -1 ? 0 : at - 80);
    const end = Math.min(plain.length, start + 240);
    return (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
}

export function searchDocs(query: string, options: { category?: string; limit?: number } = {}): DocSearchResult[] {
    const idx = loadIndex();
    const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
    const phrase = query.toLowerCase().replace(/[%]/g, ' ').replace(/\s+/g, ' ').trim();
    const terms = [...new Set(phrase.split(/[^\p{L}\p{N}_.#-]+/u).filter(t => t.length > 1))];
    if (terms.length === 0) return [];

    const scored: { page: DocPage; score: number }[] = [];
    for (const page of idx.pages) {
        if (options.category && page.category !== options.category.toLowerCase()) continue;
        const s = idx.searchText.get(page)!;
        let score = 0;
        let matched = 0;
        for (const term of terms) {
            let termScore = 0;
            if (s.title.includes(term)) termScore += 10;
            if (s.slug.includes(term)) termScore += 5;
            termScore += countOccurrences(s.body, term, 10);
            if (termScore > 0) matched++;
            score += termScore;
        }
        if (matched === 0) continue;
        if (terms.length > 1 && s.title.includes(phrase)) score += 25;
        if (s.title === phrase || s.slug === phrase) score += 40;
        // Strongly prefer pages that match every term
        score *= matched / terms.length;
        if (matched === terms.length) score *= 2;
        scored.push({ page, score });
    }

    if (scored.length === 0) {
        // "ClipboardText" -> "Clipboard Text", so CamelCase guesses still find something
        const split = query.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
        if (split !== query) return searchDocs(split, options);
    }

    scored.sort((a, b) => b.score - a.score || byPriority(a.page, b.page));
    return scored.slice(0, limit).map(({ page }) => ({
        id: page.id,
        uri: docUri(page),
        title: page.title,
        category: page.category,
        snippet: makeSnippet(page, terms),
    }));
}

/** Get a page as Markdown, with a short header naming its id and URI. */
export function getDocMarkdown(ref: string): string {
    const page = resolveDoc(ref);
    if (!page) {
        const suggestions = searchDocs(ref.replace(/[_:/]/g, ' '), { limit: 5 });
        const hint = suggestions.length
            ? ` Closest matches: ${suggestions.map(s => s.id).join(', ')}`
            : '';
        throw new Error(`No Keyboard Maestro doc page matches "${ref}".${hint}`);
    }
    return `<!-- ${page.id} · ${docUri(page)} -->\n` + toMarkdown(page);
}
