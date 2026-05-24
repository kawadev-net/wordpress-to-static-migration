# SSG 比較 — WordPress 移行先（2026年5月時点）

WordPress から移行する際の SSG 候補（Astro / Hugo / Eleventy / Next.js）の比較。

## 結論

**推奨: Astro**。理由は (1) Content Collections による型安全な front matter、(2) 画像最適化が標準装備、(3) Cloudflare Pages との公式統合、(4) MDX で混在コンテンツに対応、(5) React/Vue/Svelte コンポーネントも使える柔軟性。次点 **Hugo**（ビルド爆速・テーマ豊富）。

## 比較表

| 項目 | Astro 4.x/5.x | Hugo | Eleventy (11ty) | Next.js (Static Export) |
|--|--|--|--|--|
| **ビルド速度（80記事）** | ~2-3s | <1s | <2s | ~5-10s |
| **言語** | TypeScript/JS | Go template | JS (Nunjucks/Liquid/etc.) | TypeScript/JS |
| **画像最適化** | 内蔵 (sharp) | プラグイン or 外部 | プラグイン | 内蔵 |
| **MDX** | あり | なし | プラグイン | あり |
| **テーマ生態系** | 中 | 最大 | 小 | 中（コンポーネント転用は多い） |
| **学習コスト** | 低 (React-like) | 低 (Go template) | 中（言語選択肢多すぎ） | 中-高 |
| **front matter schema validation** | あり (Zod) | なし | あり (custom) | なし |
| **日本語対応** | OK | OK | OK | OK |
| **Cloudflare Pages 公式統合** | あり | あり | あり | あり |
| **コミュニティ規模** | 急成長中 | 大 | 中 | 巨大 |

## 各 SSG の詳細

### Astro（推奨）

**強み**:
- **Content Collections** が Zod schema で front matter を型検査
- **Image コンポーネント** で WebP 変換・srcset 自動生成
- **trailingSlash: 'always'** + **build.format: 'directory'** で WP 互換 URL を簡単に出せる
- Astro Component（`.astro`）はゼロJS出力がデフォルトで高速
- 必要なら React/Vue/Svelte コンポーネントも island として hydrate 可能
- `@astrojs/rss` / `@astrojs/sitemap` の公式統合

**弱み**:
- テーマ生態系は Hugo より小さい（が "minimal blog template" は豊富）
- Hugo より少し遅い（80記事で 1-2秒の差なので実用上問題なし）

**WP 移行との相性**:
- Content Collections のスキーマ駆動で、抽出スクリプトの出力ミスを早期検出できる
- `[slug].astro` + `getStaticPaths()` で動的ルーティングが簡潔
- ただし `slug` は schema 予約名なので `entry.slug` を使う（pitfalls.md 2.1）

### Hugo

**強み**:
- 爆速ビルド（数千記事でも数秒）
- 単一バイナリで配布、Node不要
- テーマ・短縮コード（shortcode）の生態系が成熟
- `wp2hugo` 等の専用移行ツールあり（WXR 入力）

**弱み**:
- Go template 言語の学習コスト（簡潔だが慣れが必要）
- 画像最適化はプラグイン or 外部ツール（Hugo Pipes ある）
- TypeScript 的な型安全はない

**選ぶケース**:
- 1,000記事以上の大規模ブログ
- Go 文化に親和性のあるチーム
- Astro のテーマでは足りなくて、Hugo のテーマで一目惚れがあった

### Eleventy (11ty)

**強み**:
- テンプレート言語を Nunjucks / Liquid / EJS / Handlebars / Markdown から選べる
- 政府・アクセシビリティ重視のプロジェクトで採用増加
- ビルド速度速い

**弱み**:
- セットアップに自由度が高すぎる（=コンフィグの正解が見えにくい）
- 画像最適化・RSS・sitemap などは個別プラグイン構成
- Astro より文書化が薄い

**選ぶケース**: テンプレート言語にこだわりがある、シンプル極振りしたい

### Next.js (Static Export)

**強み**:
- React 生態系が最大
- 既存の Next.js プロジェクトから流れる場合は学習コスト極小
- 画像最適化（next/image）が強力

**弱み**:
- 静的サイトには重い（フル React のオーバーヘッド）
- ビルド出力ファイル数が多くなりがち（Vercel の 16,000 制限に当たることも）
- Vercel 以外にデプロイすると Image Optimization に制約

**選ぶケース**: 既に Next.js / React に慣れている、SSR の選択肢も将来欲しい

## 移行ツール

| ツール | 入力 | 出力 | 適性 |
|--|--|--|--|
| **カスタムスクリプト + Turndown** (推奨) | WP REST API JSON | 任意 (MD + image dir) | Astro/Hugo/11ty すべてに | 
| **wp2hugo** (ashishb/wp2hugo) | WXR | Hugo (TOML/YAML front matter + MD) | Hugo 専用 |
| **wordpress-export-to-markdown** (lonekorean) | WXR | Markdown + image dir | 汎用 |
| **exitwp / exitwp-for-hugo** | WXR | Jekyll / Hugo | 古め、メンテ状態確認必要 |

**推奨**: カスタムスクリプト。WP テーマや プラグイン毎の特殊変換（Luxeritas シンタックスハイライト等）を扱える柔軟性が高い。テンプレートとして `assets/fetch-posts.template.mjs` と `assets/turndown-rules.template.mjs` を提供している。

## SSG 選定フローチャート

```
1. 80-300記事規模のシンプルなブログ？
   YES → Astro (推奨)
   NO  → 2へ

2. 1,000記事以上、ビルド速度最優先？
   YES → Hugo
   NO  → 3へ

3. React 生態系の知見が既にある？
   YES → Next.js (Static Export)
   NO  → Astro (default 推奨)

4. テンプレート言語の選択肢が欲しい？
   YES → Eleventy
   NO  → Astro (default 推奨)
```

## Astro 採用時の最小構成

```
package.json
  dependencies:
    astro                ~4.16 or ~5.x
    @astrojs/rss         ~4.0
    @astrojs/sitemap     3.2.1 (Astro 4.x) or 3.7.x (Astro 5.x)

astro.config.mjs
  site: 'https://yoursite.com'
  trailingSlash: 'always'
  build: { format: 'directory' }
  integrations: [sitemap()]
```

詳細は `pitfalls.md` の Astro セクションも参照。
