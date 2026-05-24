// fetch-posts.template.mjs
// WordPress REST API から posts と pages を全件取得して raw-export/ に書き出す雛形。
//
// 使い方:
// 1. このファイルを scripts/fetch-posts.mjs にコピー
// 2. SITE_BASE_URL を移行元サイトに書き換え
// 3. 期待件数 (EXPECTED_POSTS_RANGE / EXPECTED_PAGES_RANGE) を実サイトに合わせて調整
// 4. npm install p-retry が必要 (devDependencies に追加済みの前提)
// 5. node scripts/fetch-posts.mjs

import pRetry from 'p-retry';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_EXPORT_DIR = join(__dirname, '..', 'raw-export');

// 移行元サイトに合わせて書き換え
const SITE_BASE_URL = 'https://yoursite.com';
const EXPECTED_POSTS_RANGE = [50, 200]; // 想定件数範囲（外れたら警告）
const EXPECTED_PAGES_RANGE = [1, 20];

const BASE = `${SITE_BASE_URL}/wp-json/wp/v2`;

function buildPostsUrl({ page = 1 }) {
  const params = new URLSearchParams({
    per_page: '100',
    _embed: 'wp:term,wp:featuredmedia,author',
    orderby: 'date',
    order: 'asc',
    page: String(page),
  });
  return `${BASE}/posts?${params}`;
}

function buildPagesUrl({ page = 1 }) {
  const params = new URLSearchParams({
    per_page: '100',
    page: String(page),
  });
  return `${BASE}/pages?${params}`;
}

async function fetchAllPages(buildUrl) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const url = buildUrl({ page });
    const res = await pRetry(
      async () => {
        const r = await fetch(url, { headers: { 'User-Agent': 'migration/1.0' } });
        if (r.status === 400 || r.status === 404) return r; // 終端シグナル
        if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
        return r;
      },
      { retries: 3, minTimeout: 1000, factor: 2 }
    );
    if (res.status === 400 || res.status === 404) break;
    const batch = await res.json();
    if (batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

async function main() {
  await mkdir(RAW_EXPORT_DIR, { recursive: true });

  console.log('[fetch-posts] posts を取得中...');
  const posts = await fetchAllPages(buildPostsUrl);
  await writeFile(join(RAW_EXPORT_DIR, 'posts.json'), JSON.stringify(posts, null, 2));
  console.log(`[fetch-posts] posts: ${posts.length} 件 → raw-export/posts.json`);

  console.log('[fetch-posts] pages を取得中...');
  const pages = await fetchAllPages(buildPagesUrl);
  await writeFile(join(RAW_EXPORT_DIR, 'pages.json'), JSON.stringify(pages, null, 2));
  console.log(`[fetch-posts] pages: ${pages.length} 件 → raw-export/pages.json`);

  const errors = [];
  const [pMin, pMax] = EXPECTED_POSTS_RANGE;
  const [gMin, gMax] = EXPECTED_PAGES_RANGE;
  if (posts.length < pMin || posts.length > pMax) {
    errors.push(`posts 件数が想定外: ${posts.length}（想定: ${pMin}-${pMax}）`);
  }
  if (pages.length < gMin || pages.length > gMax) {
    errors.push(`pages 件数が想定外: ${pages.length}（想定: ${gMin}-${gMax}）`);
  }
  if (errors.length > 0) {
    console.error('[fetch-posts] 警告:');
    errors.forEach((e) => console.error('  -', e));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[fetch-posts] 失敗:', err);
  process.exit(1);
});
