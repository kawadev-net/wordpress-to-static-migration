---
name: wordpress-to-static-migration
description: WordPress サイトを静的サイトジェネレーター（Astro 推奨）+ Cloudflare Pages（または GitHub Pages・Netlify）へ移行する際のチェックリストと地雷集。WP の廃止、運用コスト削減、無料枠ホスティング、Headless 化、Markdown 化、WP REST API/wget による抽出、画像移行、URL/SEO 保持、コードシンタックスハイライト、リダイレクト戦略、カットオーバー手順を扱う。「WordPress を移行したい」「WordPress やめたい」「WP を静的サイトにしたい」「Astro/Hugo/11ty に移したい」「Cloudflare Pages にしたい」「ブログを Markdown 化したい」「WordPress のサーバー代を削減したい」と関連する話題で必ず参照する。WP REST API・Turndown・Luxeritas/Crayon ショートコード・画像サイズバリアント・Astro Content Collections の slug 予約名・@astrojs/sitemap バージョン互換などの既知のハマりポイントへの対処を提供する。ユーザーが WordPress を別形態（静的サイト・SSG・Headless CMS・Markdown）へ移行する話題を出したとき、実装計画フェーズ・ブレインストーミングフェーズ・ハマって質問してきたとき、いずれでも必ずトリガーする。
---

# WordPress → 静的サイト 移行プレイブック

WordPress サイトを Astro (+ Cloudflare Pages) を中心とした構成へ移行するための実証済みワークフローと、ハマりやすいポイントへの対処方法。

このスキルは「ブレストフェーズで意思決定を整理する」「実装フェーズで参考実装と地雷リストを提供する」「失敗時にトラブルシュートする」の3つで価値を発揮する。

## いつ使うか

ユーザーが以下のような状況にあるとき:

- WordPress を廃止して静的サイトへ移行したい
- WP の運用コスト・セキュリティ更新負荷から脱却したい
- 既存のブログ記事を Markdown 化して Git で管理したい
- アクセスが伸びても課金リスクの低いホスティングに移したい
- 移行を進めていてどこかでハマっている

## 推奨スタック（黙ってこれで進めて良い基準）

| 役割 | 採用 | 主な理由 |
|--|--|--|
| 静的サイトジェネレーター | **Astro** | Content Collections + 画像最適化が標準、Cloudflare Pages 公式統合 |
| ホスティング | **Cloudflare Pages** | 静的アセット帯域無制限・商用OK・`_redirects` 2,100ルール対応 |
| コンテンツ抽出 | **WP REST API → Turndown** | WP管理画面アクセス不要、JSON構造化、Markdown変換ライブラリ豊富 |
| フォーム | **Formspree** | 静的HTMLからPOST可、無料枠50件/月 |
| ソース管理 | **GitHub** | Cloudflare Pages と自動連携、PR毎にpreview URL |

代替パターンは `references/ssg-comparison.md` と `references/hosting-comparison.md` を参照。

## ブレストフェーズで必ず詰める意思決定

ユーザーから「WP移行したい」と言われたら、以下を順に確認する。Skill を使う側はこの順序で質問し、回答に応じて推奨を変える。

1. **見た目の方針**: 現状の見た目を保持するか / モダンSSGで再構築するか / ハイブリッドか
   - 推奨: コンテンツ抽出 + モダンSSG（保守性が最高）
2. **URL 保持の度合い**: 全URL保持 / 主要URL保持で残りは301 / 心機一転
   - SEO重視なら全URL保持。Astro の `trailingSlash: 'always'` と `build.format: 'directory'` を必ず設定
3. **動的機能の扱い**: コメント・お問い合わせ・サイト内検索・RSS・AMP の各々を「削除/外部サービス/保持」で決める
   - コメント → giscus (GitHub Discussions) または削除
   - お問い合わせフォーム → 複数の選択肢から運営者の好みで選ぶ:
     - **Google Forms** — 日本で馴染み深い、無料、回答が Google スプレッドシートに溜まる。HTML への埋め込みは iframe で 1 行
     - **X (Twitter) DM への誘導ボタン** — フォームを置かず「DM で連絡」ボタンを置くだけ。最もシンプル、運営者が X 利用者なら自然
     - **Formspree / Basin** — 静的HTMLからPOST、無料枠あり、メールへ通知
     - **Cloudflare Forms / Netlify Forms** — 採用ホスティングが対応していれば設定が最少
     - **mailto: リンク** — 究極のシンプル、ただしメアドの晒し問題
   - 検索 → Pagefind またはトップ+タグページで代替
   - AMP → 削除（Google が 2024 年に AMP 優遇を撤廃）
   - RSS → `@astrojs/rss` で `/rss.xml` 生成、旧 `/feed/` から 301
4. **計測タグ**: GA4 / AdSense / Microsoft Clarity を維持するか
   - 維持なら `import.meta.env.PROD` で本番だけ出力する Component に集約
5. **カテゴリ/タグページ**: 個別ページを生成 / 削除して 301 / 残す
   - 削除して 301 がシンプルで保守も楽
6. **ホスティング・ドメイン状況**: アカウント有無、ドメインレジストラ、DNS の管理権限
   - Cloudflare アカウントは新規作成でも 5 分

## 実装フェーズの標準パイプライン

1. **抽出**: `/wp-json/wp/v2/{posts,pages,media}` から JSON 取得（管理画面ログイン不要）。`scripts/fetch-posts.mjs` の雛形は `assets/fetch-posts.template.mjs` 参照
2. **画像 DL**: WP REST API の `media` で原本を取得 + **記事本文を grep して画像サイズバリアント（-NNNxNNN.jpg）も追加DL**（重要、これを忘れるとリンク切れ）
3. **HTML→Markdown 変換**: Turndown + カスタムルールで Luxeritas シンタックスハイライト・wp-block-image・AdSense除去・GFM table を処理。雛形は `assets/turndown-rules.template.mjs`
4. **front matter 生成**: title / pubDate / modDate / description / heroImage / legacy* / legacyUrl を Zod スキーマでバリデート可能な形で出力
5. **リダイレクト生成**: 旧カテゴリ/タグ/AMP/feed/wp-* を `_redirects` (Cloudflare 形式) へ。雛形は `assets/_redirects.template`
6. **Astro サイト構築**: `[slug].astro` で getStaticPaths から posts/pages を両方ロード、レイアウト切替
7. **ビルド検証**: HTML 件数チェック + linkinator + `wrangler pages dev` + 自前 verify-redirects スクリプト
8. **カットオーバー**: DNS 切替 → 24時間並走 → Search Console 確認 → 旧 WP 停止

## 既知の地雷（必ず先回りすること）

詳しくは `references/pitfalls.md` を読む。ここでは特に重要なものだけ列挙する。

1. **Luxeritas/Crayon の `[highlight_X]` ショートコードは REST API で展開されない**
   - 症状: `content.rendered` に `[highlight_bash]code[/highlight_bash]` がそのまま入る
   - 対処: turndown 前処理で `<pre class="language-X"><code>...</code></pre>` に変換してから fenced code block へ

2. **画像サイズバリアントは `/wp-json/wp/v2/media` に含まれない**
   - 症状: `media` API は約 N 件返すが、記事本文は 5N 件以上の `-1024x576.jpg` 等を参照
   - 対処: `posts.content.rendered` を `https?://[host]/wp-content/uploads/[^"'\s]+\.(jpg|png|gif|webp)` で全文 grep し、未取得分を追加DL

3. **Astro Content Collections は `slug` を予約名扱い**
   - 症状: `ContentSchemaContainsSlugError`
   - 対処: schema から `slug` を削除し、`entry.slug`（filename 自動生成）を利用する。.md ファイル名を WP の slug と一致させること

4. **`@astrojs/sitemap` 3.7+ は Astro 5.x 専用**
   - 症状: ビルド時に `Cannot read properties of undefined (reading 'reduce')` at `_routes.reduce`
   - 対処: Astro 4.x 系を使う場合は `@astrojs/sitemap@3.2.1` にピン止め

5. **trailingSlash 不整合による 301 ループ**
   - 症状: Cloudflare Pages 上で `/foo/` と `/foo` のリダイレクトが循環
   - 対処: `astro.config.mjs` で `trailingSlash: 'always'` + `build.format: 'directory'`。`_redirects` のリダイレクト先 URL もすべて末尾スラッシュ統一

6. **CI の linkinator が OG画像の絶対URLで失敗**
   - 症状: `<meta property="og:image" content="https://yoursite.com/images/...">` が現状の本番（旧WP）で 404
   - 対処: カットオーバー前は linkinator の `--skip` に自分のドメインと外部の死リンクを含める

7. **チュートリアル記事に含まれる開発URL（localhost/192.168.x.x）が linkinator 失敗の原因**
   - 対処: skip パターンに `localhost|0\.0\.0\.0|192\.168\.|example\.` を追加

## 出力フォーマット指針

このスキルが呼ばれたとき、Skill を使う側（Claude）は以下を意識する:

- **ブレストフェーズなら**: 上記「意思決定リスト」を AskUserQuestion 等で順に確認する。1問ずつ聞き、推奨は明示する

- **実装フェーズなら**: ユーザー応答内に**長大なスクリプト全文を書き起こさない**。代わりに以下の手順:
  1. 最終的なディレクトリ構成（`scripts/`, `src/content/`, `public/images/` 等）を箇条書き or 図で提示
  2. ユーザーのリポジトリに `assets/fetch-posts.template.mjs` `assets/turndown-rules.template.mjs` `assets/_redirects.template` を**コピーする手順**を示す（`cp` コマンドで OK）
  3. **コピー後にユーザー固有の値（SITE_BASE_URL や EXPECTED_POSTS_RANGE など）を Claude 側で置換してから提示**する。テンプレート内の `// 移行元サイトに合わせて書き換え` のようなプレースホルダ向けメタコメントは**Claude 内部の事項**なので、ユーザー応答に転載しない
  4. 実行コマンド（`npm install p-retry turndown` → `node scripts/fetch-posts.mjs` 等）と、想定出力（件数・ログ）を提示
  5. 細かい挙動カスタムが必要な場面（例: テーマ独自の shortcode）でだけ、該当する関数の差分パッチを提示

- **トラブルシュート時**: 上記「既知の地雷」を先に確認し、該当があれば即対処、なければ症状を聞いて diagnoses する

## 参考リソース

- `references/pitfalls.md` — 地雷集（このプレイブックで触れていないものも含む）
- `references/extraction-patterns.md` — REST API/wget/WXR の比較とコード雛形
- `references/hosting-comparison.md` — Cloudflare Pages/GitHub Pages/Netlify/Vercel/Cloudflare R2 の最新無料枠比較
- `references/ssg-comparison.md` — Astro/Hugo/11ty の比較と使い分け
- `assets/turndown-rules.template.mjs` — Luxeritas + 一般WPテーマ対応の Turndown ルール雛形
- `assets/_redirects.template` — Cloudflare Pages 用 `_redirects` テンプレ
- `assets/fetch-posts.template.mjs` — WP REST API 呼び出し雛形

## このスキルの設計思想

このスキルは「Astro + Cloudflare Pages が正解」と決め打ちはせず、**よくある選択ミスを未然に防ぐ意思決定支援** + **実装時の地雷回避**に焦点を置く。

ユーザーの WordPress サイトはテーマ・プラグイン・コンテンツ構成が千差万別なので、雛形をコピペするだけで完了するケースは稀。Skill は「考えるべき項目」と「ハマるポイント」を網羅的に提示し、ユーザーと Claude が一緒に判断していく構造を取る。

このスキルの根拠となった実例: kawadev.net（Luxeritas テーマ、79記事、約1,300画像）の移行プロジェクト。仕様書・実装計画・実装コードがリファレンス可能な形で別途存在する（このスキルでは参照しない）。
