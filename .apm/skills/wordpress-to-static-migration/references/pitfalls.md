# 既知の地雷集 — WordPress → 静的サイト 移行

このリストは実際の移行プロジェクトでハマったポイントをまとめたもの。実装フェーズに入る前にざっと読んでおくと数時間を節約できる。

## 目次

1. コンテンツ抽出系
   - [1.1 ショートコードが REST API で展開されない](#11-ショートコードが-rest-api-で展開されない)
   - [1.2 画像サイズバリアントが /media に含まれない](#12-画像サイズバリアントが-media-に含まれない)
   - [1.3 タクソノミー slug が URLエンコード済み](#13-タクソノミー-slug-が-urlエンコード済み)
   - [1.4 description に HTML エンティティが残る](#14-description-に-html-エンティティが残る)
2. Astro / SSG 系
   - [2.1 Content Collections の `slug` 予約名](#21-content-collections-の-slug-予約名)
   - [2.2 @astrojs/sitemap バージョン互換](#22-astrojssitemap-バージョン互換)
   - [2.3 trailingSlash の不整合で 301 ループ](#23-trailingslash-の不整合で-301-ループ)
   - [2.4 astro check が @astrojs/check のインストールを要求](#24-astro-check-が-astrojscheck-のインストールを要求)
3. ホスティング / リダイレクト系
   - [3.1 `_redirects` のルール順序](#31-_redirects-のルール順序)
   - [3.2 Cloudflare Pages の単一ファイル 25MB 制限](#32-cloudflare-pages-の単一ファイル-25mb-制限)
   - [3.3 wrangler pages dev のクエリパラメータ挙動](#33-wrangler-pages-dev-のクエリパラメータ挙動)
4. CI 系
   - [4.1 linkinator が OG画像の絶対URLで失敗](#41-linkinator-が-og画像の絶対urlで失敗)
   - [4.2 旧記事内のローカル/プライベートIP/example URL](#42-旧記事内のローカルプライベートipexample-url)
5. デプロイ / カットオーバー系
   - [5.1 GitHub Pages では本物の 301 が打てない](#51-github-pages-では本物の-301-が打てない)
   - [5.2 DNS TTL を事前に短くしておく](#52-dns-ttl-を事前に短くしておく)

---

## 1. コンテンツ抽出系

### 1.1 ショートコードが REST API で展開されない

**症状**: `GET /wp-json/wp/v2/posts` の `content.rendered` に `[highlight_bash]echo hi[/highlight_bash]` のような shortcode が**そのまま**文字列で入る。

**原因**: WP REST API は WordPress の `the_content` フィルターを通すが、shortcode 処理プラグイン（Crayon Syntax Highlighter、古い Luxeritas など）が REST 経由の呼び出しでは shortcode を expand しないケースがある。

**対処**: Turndown で変換する前に preprocessing をかけて `<pre class="language-LANG"><code>...</code></pre>` に置換してから fenced code block 化する。

```javascript
function preprocessShortcodes(html) {
  return html.replace(
    /\[highlight_(\w+)\]([\s\S]*?)\[\/highlight_\1\]/g,
    (_m, lang, code) => `<pre class="language-${lang}"><code>${code.trim()}</code></pre>`
  );
}
```

**チェック方法**: 抽出後の `content.rendered` を `grep -c '\[highlight_'` で件数を見る。0 でない場合は対処が必要。

### 1.2 画像サイズバリアントが /media に含まれない

**症状**: `media` API で 200 件取れたが、移行後のサイトで `-1024x576.jpg` などの画像が大量に 404。

**原因**: WordPress はアップロード時に複数サイズの variant（150x150 / 300x246 / 768x631 等）を auto-generate するが、REST API の `media` エンドポイントは**原本のみ**を返す。

**対処**: 投稿本文を grep して `wp-content/uploads/[^"'\s]+\.(jpg|png|gif|webp)` を全部拾い、`/media` で取れない URL も直接ダウンロードする。Phase を2段階に分ける。

```javascript
const urlRe = /https:\/\/example\.com\/wp-content\/uploads\/[^"'\s)<>]+\.(?:jpg|jpeg|png|gif|webp|svg)/gi;
const set = new Set();
for (const post of posts) {
  let m;
  while ((m = urlRe.exec(post.content.rendered)) !== null) {
    set.add(m[0]);
  }
}
// → set を additional download list として並列DL
```

### 1.3 タクソノミー slug が URLエンコード済み

**症状**: `_embedded["wp:term"][0][0].slug` が `%e3%82%b3%e3%83%bc%e3%83%92%e3%83%bc` のような形で返ってくる（日本語スラッグの場合）。

**原因**: WP の slug は ASCII safe にエンコードされて保存される。

**対処**: そのまま `_redirects` ルールに使えば旧URLにマッチする（旧URL自体もエンコード形式なので）。表示用に decode する必要がある場合は `decodeURIComponent` を使う。Front matter にメタデータとして残す程度なら decode 不要。

### 1.4 description に HTML エンティティが残る

**症状**: `excerpt.rendered` を strip しても `&hellip;` `&amp;` などのエンティティが残り、OGP description などに文字化けして見える。

**対処**: 簡易デコーダで主要な named entity と numeric entity を処理する。

```javascript
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…' };
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/g, (m, name) => NAMED[name] ?? m);
}
```

---

## 2. Astro / SSG 系

### 2.1 Content Collections の `slug` 予約名

**症状**: ビルド時に
```
[ContentSchemaContainsSlugError] [astro:content-imports]
A content collection schema should not contain `slug` since it is reserved for slug generation.
```

**原因**: Astro Content Collections は `slug` を filename 由来の自動生成プロパティとして予約している。Zod schema に含めると競合する。

**対処**:
1. Zod schema から `slug` を削除（front matter に `slug:` が残るのは問題ない、Astro は無視する）
2. テンプレート / ページから `entry.data.slug` ではなく `entry.slug` を参照
3. .md ファイル名を WP の slug と一致させておく（`fetch-posts → convert-to-markdown` の段階で `${slug}.md` の命名にする）

### 2.2 @astrojs/sitemap バージョン互換

**症状**: ビルド時に
```
Cannot read properties of undefined (reading 'reduce')
  at .../node_modules/@astrojs/sitemap/dist/index.js:NN (_routes.reduce)
```

**原因**: `@astrojs/sitemap@3.7.x` 以降は Astro 5.x の新フック `astro:routes:resolved` を使う。Astro 4.x では `_routes` が undefined のまま。

**対処**: Astro 4.x 系を使い続けるなら `@astrojs/sitemap@3.2.1` にピン止め。

```bash
npm install --save-exact @astrojs/sitemap@3.2.1
```

または、Astro 自体を 5.x にアップグレードする。新規プロジェクトなら Astro 5.x を推奨。

### 2.3 trailingSlash の不整合で 301 ループ

**症状**: `https://yoursite.com/foo/` にアクセスすると `/foo` へ 301 が返り、`/foo` がさらに `/foo/` へ 301 を返す無限ループ。

**原因**: WP は通常 trailing slash あり（`/foo/`）だが、Astro のデフォルトは `trailingSlash: 'ignore'` で URL 形式が不定。Cloudflare Pages 側の自動正規化と組み合わさるとループする。

**対処**: `astro.config.mjs` で
```javascript
export default defineConfig({
  trailingSlash: 'always',
  build: { format: 'directory' },
});
```
を必ず指定する。さらに `_redirects` 内のリダイレクト先 URL も末尾スラッシュ統一する。

### 2.4 astro check が @astrojs/check のインストールを要求

**症状**: CI で `npx astro check` を実行すると `Would you like to install @astrojs/check and TypeScript?` と聞かれて hang する。

**対処**: 自動同意するなら `npx astro check --yes` を試すか、`@astrojs/check` と `typescript` を devDependencies に明示追加。検査が必須でなければ `astro sync` だけで Content Collections schema validation はかかるので、`astro check` をスキップする選択もある。

---

## 3. ホスティング / リダイレクト系

### 3.1 `_redirects` のルール順序

**症状**: 期待した 301 が出ず、別のワイルドカードルールにマッチして変な場所へリダイレクトされる。

**原因**: Cloudflare Pages の `_redirects` は**先頭から順にマッチ**する。`/*/amp/` のような広いワイルドカードを上に書くと、その下の具体ルールが効かない。

**対処**: 必ず**具体ルール（カテゴリ・タグ・固定パス）→ ワイルドカード**の順に並べる。`build-redirects.mjs` で自動生成する場合は出力順序を保証する。

### 3.2 Cloudflare Pages の単一ファイル 25MB 制限

**症状**: 大きな PDF や動画を含むサイトでデプロイが失敗。

**対処**:
- 画像は事前に最適化（WebP変換、リサイズ）して 25MB 未満に
- 25MB 超のアセットは Cloudflare R2 にアップロードして CDN 配信
- 1リポ最大 20,000 ファイル制限もあるので注意（大量の画像バリアントを残す場合は減量検討）

### 3.3 wrangler pages dev のクエリパラメータ挙動

**症状**: `/foo?bar=baz` のような URL に対してリダイレクトテストが期待通りに動かない。

**対処**: Cloudflare Pages の `_redirects` はクエリパラメータを基本的に**保持して引き渡す**。クエリ無視で `/` を返したい場合は明示的なルールが必要。検証は `wrangler pages dev dist` 起動 + `curl -I` で実機確認。

---

## 4. CI 系

### 4.1 linkinator が OG画像の絶対URLで失敗

**症状**: CI の linkinator ステップで `[404] https://yoursite.com/images/...` が大量に出る。

**原因**: Astro の BaseLayout で `og:image` などを `new URL(path, Astro.site)` で生成すると絶対URL（`https://yoursite.com/...`）になる。CI でこれを linkinator が follow すると、現状の本番（旧WP）に飛んで 404 を返す。

**対処**: カットオーバー前は linkinator の `--skip` に自分のドメインを含める。

```bash
npx linkinator dist --recurse --skip 'yoursite\.com|mailto|formspree.io|googletagmanager|googlesyndication|clarity.ms'
```

カットオーバー後は外しても OK。

### 4.2 旧記事内のローカル/プライベートIP/example URL

**症状**: 古いチュートリアル記事に `http://localhost:8000` `http://192.168.33.10/` `http://example.jp/` などの URL が残っていて linkinator が失敗。

**対処**: skip パターンに追加。

```
localhost|0\.0\.0\.0|192\.168\.|example\.
```

これらは「記事の内容としては保持」「CI検証だけ無効化」する意図的な妥協。

---

## 5. デプロイ / カットオーバー系

### 5.1 GitHub Pages では本物の 301 が打てない

**症状**: GitHub Pages を使うと旧URL→新URLの 301 リダイレクトが meta refresh ベース（SEO 効果が薄い）になる。

**対処**: SEO を保ちたいなら Cloudflare Pages や Netlify を選ぶ。GitHub Pages の手軽さを優先するなら、SEO 影響は受け入れる前提で。

### 5.2 DNS TTL を事前に短くしておく

**症状**: DNS 切替後、旧サーバへ流入が残り続けてカットオーバー判定が難しい。

**対処**: カットオーバーの 24-48 時間前に既存 DNS の TTL を 300 秒（5分）に短縮しておく。これで切替後は速やかに新サーバへ流入が移る。Cloudflare へドメインを移管する場合はネームサーバー切替自体に数時間〜数日かかることがあるので、まずは DNS TTL を短くしてからネームサーバー切替する。
