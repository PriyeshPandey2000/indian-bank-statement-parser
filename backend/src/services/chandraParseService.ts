import fs from 'fs';
import path from 'path';

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const COLMAP_CACHE_PATH = path.join(process.env['STORAGE_DIR'] ?? path.resolve(__dirname, '../../storage'), 'colmap_cache.json');

interface ChandraBlock {
  block_type: string;
  html: string;
  page: number;
  children?: ChandraBlock[];
}

interface ChandraPage {
  page: number;
  block_type: string;
  children?: ChandraBlock[];
}

interface ChandraJson {
  children: ChandraPage[];
}

interface ColMap {
  date: number;
  desc: number;
  debit: number;
  credit: number;
  balance: number;
}

export interface ChandraRawTx {
  date: string | null;
  description: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  page: number;
}

const DATE_RE = /\d{2}[\/.\-]\d{2}[\/.\-]\d{2,4}/;

// Disk-backed cache: header key -> ColMap. Loaded on startup, saved on write.
function loadColMapCache(): Map<string, ColMap> {
  const cache = new Map<string, ColMap>();
  try {
    if (fs.existsSync(COLMAP_CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(COLMAP_CACHE_PATH, 'utf8')) as Record<string, ColMap>;
      for (const [k, v] of Object.entries(data)) cache.set(k, v);
      console.log(`[ChandraParser] loaded ${cache.size} colmap entries from disk`);
    }
  } catch (e) {
    console.warn('[ChandraParser] failed to load colmap cache:', e);
  }
  return cache;
}

function saveColMapCache(cache: Map<string, ColMap>): void {
  try {
    const dir = path.dirname(COLMAP_CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj: Record<string, ColMap> = {};
    for (const [k, v] of cache) obj[k] = v;
    fs.writeFileSync(COLMAP_CACHE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('[ChandraParser] failed to save colmap cache:', e);
  }
}

const colMapCache = loadColMapCache();

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTableRows(html: string): Array<{ type: 'header' | 'data'; cells: string[] }> {
  const rows: Array<{ type: 'header' | 'data'; cells: string[] }> = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html)) !== null) {
    const inner = trMatch[1]!;
    const ths: string[] = [];
    const tds: string[] = [];

    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let m: RegExpExecArray | null;
    while ((m = thRe.exec(inner)) !== null) ths.push(stripHtml(m[1]!));

    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((m = tdRe.exec(inner)) !== null) tds.push(stripHtml(m[1]!));

    if (ths.length) rows.push({ type: 'header', cells: ths });
    else if (tds.length) rows.push({ type: 'data', cells: tds });
  }

  return rows;
}

async function mapColumnsWithLlm(headers: string[], apiKey: string): Promise<ColMap> {
  const cacheKey = headers.join('|');
  if (colMapCache.has(cacheKey)) {
    console.log(`[ChandraParser] colMap cache hit for: ${cacheKey}`);
    return colMapCache.get(cacheKey)!;
  }

  const prompt = `You are mapping bank statement column headers to standard fields.
Headers (0-indexed): ${JSON.stringify(headers)}

Return ONLY valid JSON, no explanation:
{"date": <index>, "desc": <index>, "debit": <index>, "credit": <index>, "balance": <index>}

Rules:
- date: the transaction/posting date column
- desc: narration, description, details, particulars, remarks — the transaction description
- debit: withdrawal, debit, DR — money going out
- credit: deposit, credit, CR — money coming in
- balance: running/closing balance
- Use -1 if no matching column exists`;

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 128,
    }),
  });

  if (!resp.ok) throw new Error(`Groq header mapping failed ${resp.status}: ${await resp.text()}`);

  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]!.message.content.trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  const colMap = JSON.parse(content) as ColMap;
  console.log(`[ChandraParser] LLM mapped headers=${JSON.stringify(headers)} -> ${JSON.stringify(colMap)}`);

  colMapCache.set(cacheKey, colMap);
  saveColMapCache(colMapCache);
  return colMap;
}

export async function parseChandraJson(chandraJson: unknown): Promise<ChandraRawTx[]> {
  const apiKey = process.env['GROQ_API_KEY'];
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const json = chandraJson as ChandraJson;
  let colMap: ColMap | null = null;
  const txns: ChandraRawTx[] = [];

  for (let pi = 0; pi < json.children.length; pi++) {
    const page = json.children[pi]!;
    const pageNum = (page.page ?? pi) + 1;

    for (const block of (page.children ?? [])) {
      if (block.block_type !== 'Table') continue;

      const rows = parseTableRows(block.html);

      if (!colMap) {
        const hdr = rows.find(r => r.type === 'header');
        if (hdr) {
          colMap = await mapColumnsWithLlm(hdr.cells, apiKey);
        }
      }

      if (!colMap) continue;

      for (const row of rows) {
        if (row.type !== 'data') continue;
        const c = row.cells;

        const date = colMap.date >= 0 ? (c[colMap.date] ?? null) : null;
        if (!date || !DATE_RE.test(date)) continue;

        txns.push({
          date,
          description: colMap.desc    >= 0 ? (c[colMap.desc]    || null) : null,
          debit:       colMap.debit   >= 0 ? (c[colMap.debit]   || null) : null,
          credit:      colMap.credit  >= 0 ? (c[colMap.credit]  || null) : null,
          balance:     colMap.balance >= 0 ? (c[colMap.balance] || null) : null,
          page:        pageNum,
        });
      }
    }
  }

  console.log(`[ChandraParser] extracted ${txns.length} transactions`);
  return txns;
}
