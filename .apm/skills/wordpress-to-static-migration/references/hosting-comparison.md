# ホスティング比較 — 静的サイト無料枠（2026年5月時点）

WordPress 移行後の静的サイトを「アクセスが伸びても課金しにくい」「日本から速い」「カスタムドメイン対応」「商用OK」で評価。

## 結論

**推奨: Cloudflare Pages**。次点 GitHub Pages（極シンプルさ優先）。Vercel は商用利用禁止のため AdSense あり/アフィリエイトあり/有料コンテンツありのブログには不可。Netlify は新規アカウントのクレジット制でアクセス急増時に止まるリスクあり。

## 比較表

| 項目 | Cloudflare Pages | GitHub Pages | Netlify | Vercel | Cloudflare R2 + Workers |
|--|--|--|--|--|--|
| **無料枠 帯域** | 無制限 | 100GB/月 (ソフトリミット) | 100GB/月 or クレジット制 | 100GB/月 | 無制限 (R2 egress 無料) |
| **無料枠 リクエスト** | 静的アセット無制限 | 無制限 | 無制限 | 100万/月 | 100万/月 (Class A) |
| **無料枠 ビルド** | 無制限 | 10回/時間 | 300分/月 | 制限なし | N/A |
| **単一ファイル上限** | 25MB | 100MB推奨 | 無制限 | 無制限 | 無制限 |
| **ファイル数上限** | 20,000 | 1GB site | 無制限 | 16,000 | 無制限 |
| **301 リダイレクト** | `_redirects` 2,100ルール | `_redirects` (meta refresh fallback) | `_redirects`/`netlify.toml` | `vercel.json` | Workers Script |
| **画像最適化** | なし | なし | あり (内蔵) | あり (5,000変換/月) | なし |
| **DDoS対策** | 業界最高水準・無料 | GitHub基盤 | あり | あり | Cloudflare基盤 |
| **商用利用** | OK | OK | OK | **不可** (Pro plan必須) | OK |
| **日本レイテンシ** | ~45ms (4都市) | 不詳 | ~90ms | ~70ms | ~45ms |
| **デプロイ方式** | Git連携 / CLI / 直 | Git連携のみ | Git連携 / CLI | Git連携 / CLI | CLI / API |

## 各サービスの詳細

### Cloudflare Pages（推奨）

- 静的アセットは帯域・リクエスト無制限。アクセスが伸びても課金ゼロ
- Cloudflare の 300+ POP ネットワークで日本最速
- `_redirects` で本物の 301 を打てる（最大 2,100 ルール）
- Workers Functions 使うと 100k/日制限あるが、純粋な静的サイトなら無関係
- DDoS 対策が無料で付属
- 商用利用 OK（AdSense・アフィリエイト・有料コンテンツ全部 OK）
- 単一ファイル 25MB / ファイル数 20,000 制限は普通のブログなら問題なし

### GitHub Pages（次点）

- 完全無料・シンプル極まる
- Git push 一発でデプロイ
- パブリックリポジトリ必須（ソース公開を許容できる場合のみ）
- `_redirects` 形式に対応するが、CNAME を超える複雑なリダイレクトは meta refresh ベース
- ビルド 10回/時間制限は GitHub Actions で回避可
- 100GB/月のソフトリミット（事前連絡後対応のため即停止ではない）

### Netlify（条件付き）

- 新規アカウントは**クレジット制**（300クレジット/月）になり、アクセス急増時に予測困難に止まる
- レガシーアカウント or Pro plan ($19/月) なら従来通り使える
- 画像最適化が内蔵されている強み
- `_redirects` / `netlify.toml` で柔軟なリダイレクト
- Netlify Forms が無料枠 100件/月であるので Formspree 不要にできる

### Vercel（**非推奨**）

- Hobby plan は**商用利用禁止**（AdSense・アフィリエイト・有料コンテンツ全部不可）
- ビルド出力 16,000 ファイル制限が大規模ブログでひっかかる
- 100GB/月超過時にハードリミットで停止
- レイテンシは速い、Image Optimization 5,000変換/月は便利、だが商用禁止が致命的

### Cloudflare R2 + Workers（上級者向け）

- R2: 10GB 無料、超過 $0.015/GB/月、**egress 無料**（AWS S3 との最大差）
- 大量画像・動画を持つサイトに向く
- セットアップが複雑（Workers Script + R2 + ルーティング）
- 「将来 Cloudflare Pages の制限に当たったら R2 へオフロード」という移行パスとして有用

## 選択フローチャート

```
1. ソース公開 OK か？
   YES → 2へ
   NO  → Cloudflare Pages (private repo + Git連携可)

2. AdSense や有料コンテンツ等の商用利用予定があるか？
   YES → Cloudflare Pages or Netlify or GitHub Pages
   NO  → 上記 + Vercel も候補

3. SEO 301 リダイレクトが必須か？
   YES → Cloudflare Pages or Netlify (本物の 301)
   NO  → GitHub Pages も OK

4. 月間 PV が伸びそうか？(10万+)
   YES → Cloudflare Pages (帯域無制限)
   NO  → どれでも OK
```

## カスタムドメイン設定の難易度

| サービス | 難易度 | 補足 |
|--|--|--|
| Cloudflare Pages | ★☆☆ | ネームサーバーごと Cloudflare に移管すれば CNAME 自動設定 |
| GitHub Pages | ★★☆ | レジストラで CNAME 設定、SSL は Let's Encrypt 自動発行 |
| Netlify | ★☆☆ | 自動 SSL + Netlify DNS で簡単 |
| Vercel | ★☆☆ | 自動 SSL + Vercel DNS |

## DNS 切替 / カットオーバー

どのホスティングを選んでも、本番カットオーバーは以下の手順で行う:

1. 事前に既存 DNS の TTL を 300 秒に短縮（カットオーバー 24-48 時間前）
2. プレビュー URL（`*.pages.dev` 等）で全URLが正常に返ることを確認
3. DNS の A/CNAME レコード or ネームサーバーを新ホスティングへ切替
4. SSL 証明書の自動発行を待つ（数分〜1時間）
5. 旧 WP を**読み取り専用で 24時間並走**（DNSキャッシュ残存対応）
6. Google Search Console で新サイトのクロール開始を確認
7. 24時間後、旧 WP を停止（バックアップは別途保存）

## 補足: なぜ Cloudflare R2 を最初から使わないか

R2 + Workers は最も安く・最もスケールするが、セットアップが複雑（Workers Script の書き方、route 設定、ビルドパイプライン etc）。普通のブログ（数百ページ・数千画像）なら Cloudflare Pages で十分カバーできるので、まず Pages で始めて、後で必要になったら R2 にオフロードする増分パスが現実的。
