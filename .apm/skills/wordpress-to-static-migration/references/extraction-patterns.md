# コンテンツ抽出パターン — WordPress → 静的サイト

WP からコンテンツを取り出す手段の比較と、推奨パターン（WP REST API）の実装パターン。

## 抽出手段の比較

| 手段 | 必要権限 | 取れるもの | 制約 |
|--|--|--|--|
| **WP REST API** (推奨) | 公開のみで可（管理画面不要） | posts/pages/media/taxonomies の JSON、`_embed` で関連情報も同時取得 | Shortcode の expand は plugin 依存、画像 size variant は別途取得必要 |
| **WXR エクスポート** | 管理画面 (`/wp-admin/export.php`) | 全コンテンツの XML 1ファイル | 管理画面アクセス必須、XML パースが面倒 |
| **wget --mirror** | 公開のみ | レンダリング済みHTML一式、画像も同時取得 | 後でHTMLからコンテンツ抽出が必要、無駄なナビ等も入る |
| **DB ダンプ** | サーバーシェル / phpMyAdmin | 完全な生データ | テーマ・プラグインへの依存度が高い、Markdown変換は別途 |
| **wp2hugo / wordpress-export-to-markdown** | ツール毎 | Hugo / Markdown 直接出力 | WXR を入力にすることが多い、テーマ固有の処理が弱い |

**推奨**: WP REST API が公開なら最優先。商用 WP では `wp-json` が無効化されていることもあるので事前確認 (`curl https://yoursite/wp-json/wp/v2/posts`)。

## REST API の基本パターン

### 全件取得（ページネーション）

```javascript
const BASE = 'https://yoursite.com/wp-json/wp/v2';

async function fetchAllPages(endpoint, extra = {}) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const params = new URLSearchParams({ per_page: '100', page: String(page), ...extra });
    const res = await fetch(`${BASE}/${endpoint}?${params}`, {
      headers: { 'User-Agent': 'migration/1.0' },
    });
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const batch = await res.json();
    if (batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

const posts = await fetchAllPages('posts', {
  _embed: 'wp:term,wp:featuredmedia,author',
  orderby: 'date',
  order: 'asc',
});
```

### `_embed` で取れる関連情報

- `wp:term` — カテゴリ・タグなどのタクソノミー
- `wp:featuredmedia` — アイキャッチ画像の詳細（source_url 含む）
- `author` — 著者情報
- `replies` — コメント

これを使うと別途 N+1 リクエストせずに済む。

### REST API が無効化されている場合

レスポンスが 401/403 や HTML ログイン画面が返る場合:

1. `User-Agent` を Mozilla 互換に変えて再試行
2. それでも駄目なら WXR エクスポート or wget ミラーへ切り替え
3. もし管理画面アクセスがあるなら `Settings > Permalinks` で何かを保存（permalink 再生成で `/wp-json/` 経路が復活することがある）

## 画像ダウンロードのパターン

### Phase 1: /media 原本

```javascript
const media = await fetchAllPages('media');
// 並列度 6 程度で source_url から取得 → public/images/YYYY/MM/<filename>
```

### Phase 2: 投稿本文から size variant を追加抽出

```javascript
const urlRe = /https:\/\/yoursite\.com\/wp-content\/uploads\/[^"'\s)<>]+\.(?:jpg|jpeg|png|gif|webp|svg)/gi;
const variantUrls = new Set();
for (const post of posts) {
  let m;
  while ((m = urlRe.exec(post.content.rendered)) !== null) variantUrls.add(m[0]);
}
// → Phase 1 で取れなかった URL を追加DL
```

### 並列度の選び方

- 並列度 6 が標準（先方サーバへの負荷と速度のバランス）
- 重要な本番サイトを叩く時は並列度 3 まで下げる
- 大量画像で時間がかかる時は並列度 10-12 に上げる（429 が返り始めたら下げる）
- 必ず冪等にする（既存ファイルはスキップ）

## HTML → Markdown 変換のパターン

Turndown（npm）が安定。Pandoc は強力だが日本語見出しの ID 生成が難。

### 最小設定

```javascript
import TurndownService from 'turndown';
const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
const md = td.turndown(post.content.rendered);
```

### よく使うカスタムルール

`assets/turndown-rules.template.mjs` 参照。代表的なもの:

- Luxeritas シンタックスハイライト (`pre.wp-block-luxe-blocks-syntaxhighlighter`) → fenced code block
- `<figure class="wp-block-image">` を Markdown 画像に集約
- `<img src="https://yoursite.com/wp-content/uploads/...">` の URL を `/images/...` にリライト
- AdSense / 関連記事ウィジェット / シェアボタンの div を除去
- HTML table → GFM table

### 文字数比による異常検知

変換後に元 HTML の text length と Markdown length を比較すると、極端に短く/長くなった記事を検出できる。±50% 超ならログに残してサンプリング確認する。アフィリエイトリンクが多い記事は Markdown 化で長くなりがちなので、許容ラインは緩めに。

```javascript
function compareLength(html, md) {
  const htmlText = html.replace(/<[^>]+>/g, '').length;
  const mdText = md.length;
  const ratio = mdText / htmlText;
  return { ratio, warn: ratio < 0.5 || ratio > 1.5 };
}
```

## Front Matter 生成のパターン

Astro Content Collections を使うなら Zod schema を最初に定義し、それに合う形で front matter を吐く。

```yaml
---
title: "..."
pubDate: 2021-06-26T17:53:43+09:00
modDate: 2021-06-27T08:00:00+09:00
description: "..."
heroImage: "/images/2021/06/featured.jpg"
legacyCategories: ["docker", "error"]
legacyTags: ["wsl2", "docker"]
legacyUrl: "https://yoursite.com/error-wsl2-docker-desktop-pull/"
---
```

**注意**: `slug:` を schema に入れない（Astro Content Collections の予約名）。filename を `${slug}.md` にすれば `entry.slug` で自動取得できる。詳しくは `pitfalls.md` の 2.1 参照。

## カットオーバー後のスナップショット保存

抽出した `raw-export/{posts,pages,media}.json` は git で残しておくと「元はどう書かれていたか」を後から参照できる（容量は数MB程度）。本番カットオーバー後に旧 WP を停止する場合、これらが最後のスナップショットになるので保存価値が高い。
