# wordpress-to-static-migration

WordPress サイトを Astro + Cloudflare Pages を中心とした静的サイトへ移行するための
チェックリスト・地雷集 Skill。

[Claude Code](https://docs.anthropic.com/claude/docs/claude-code) / GitHub Copilot /
Cursor / Codex / Gemini / Windsurf で動作。

## Installation

### Option A: APM (multi-harness 配布)

```bash
apm install kawadev-net/wordpress-to-static-migration
```

[Microsoft Agent Package Manager (APM)](https://github.com/microsoft/apm) を
インストール後、上記コマンドで Claude Code / Copilot / Cursor / Codex / Gemini /
Windsurf のうち `apm config` で指定した harness にデプロイされます。

### Option B: Claude Code Plugin

Claude Code から:

```
/plugin install kawadev-net/wordpress-to-static-migration
```

### Option C: Manual (git clone)

```bash
git clone https://github.com/kawadev-net/wordpress-to-static-migration.git
cp -r wordpress-to-static-migration/.apm/skills/wordpress-to-static-migration \
      ~/.claude/skills/
```

## Usage

このスキルは **自動トリガー** されます。WordPress の移行・脱却に関する話題
(「WordPress を移行したい」「WP やめたい」「Astro/Hugo に移したい」等) で
Claude (or 対応 harness) が自動的に参照します。

明示的に呼び出したい場合:
```
/skill wordpress-to-static-migration
```

## What's included

- **SKILL.md** — 推奨スタック、ブレスト用意思決定リスト、実装パイプライン、地雷集 (134 行)
- **references/** — 4 つの詳細参考資料
  - `pitfalls.md` — 既知の地雷集 (Astro slug 予約名、@astrojs/sitemap 互換 等)
  - `extraction-patterns.md` — WP REST API / wget / WXR 比較とコード雛形
  - `hosting-comparison.md` — Cloudflare Pages / GitHub Pages / Netlify / Vercel 比較
  - `ssg-comparison.md` — Astro / Hugo / 11ty 比較
- **assets/** — コピーして使えるテンプレート
  - `turndown-rules.template.mjs` — HTML→Markdown 変換ルール (Luxeritas 対応)
  - `fetch-posts.template.mjs` — WP REST API 呼び出し
  - `_redirects.template` — Cloudflare Pages 用リダイレクト

## Versioning

[SemVer](https://semver.org/) + Git tag (`v1.0.0` 形式)。

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE).

## Origin

このスキルは [kawadev.net](https://kawadev.net/) (Luxeritas テーマ、79 記事、
約 1,300 画像) の WordPress → Astro + Cloudflare Pages 移行プロジェクトで得られた
実証済みの知見をベースに作成しています。
