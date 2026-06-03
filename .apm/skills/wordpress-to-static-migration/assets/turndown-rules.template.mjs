// turndown-rules.template.mjs
// WordPress (Luxeritas / 一般テーマ) の HTML を Markdown に変換するカスタム turndown ルール雛形。
//
// 使い方:
// 1. このファイルを scripts/lib/turndown-rules.mjs にコピー
// 2. SITE_HOST を移行元サイトに書き換え（画像URLの書き換えで使用）
// 3. テーマ固有のクラス名（例: Luxeritas の wp-block-luxe-blocks-syntaxhighlighter）を実サイトに合わせて調整
// 4. import { convertHtml } from './lib/turndown-rules.mjs' で使う
//
// 重要: shortcode を含む古い記事への対処として preprocessShortcodes() を必ず適用する

import TurndownService from 'turndown';

// 移行元サイトに合わせて書き換え
const SITE_HOST = 'yoursite.com';
// 正規表現メタ文字を全てエスケープ（ドットだけでなく、手書きのホスト名に
// 紛れ込みうる + ? ( ) 等が正規表現として解釈されないようにする）
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WP_UPLOADS_HOST_RE = new RegExp(`^https?://${escapeRegExp(SITE_HOST)}/wp-content/uploads/`);

function rewriteImageSrc(src) {
  if (!src) return src;
  return src.replace(WP_UPLOADS_HOST_RE, '/images/');
}

// --- Markdown エスケープヘルパ ---
// 移行元 WP 本文は半信頼（コメント焼き込み・過去の改ざん投稿の可能性）なため、
// 値を Markdown へ埋め込む前にエスケープして注入・構造破壊を防ぐ。

// 画像 alt / リンクテキスト用: [ ] \ を退避し、改行は空白へ畳む
function escapeMdText(s) {
  return (s || '').replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]+/g, ' ');
}

// リンク/画像の URL 用: 空白・括弧を含む場合は <...> 形式で包む（山括弧自体は除去）
function escapeMdUrl(src) {
  if (!src) return src;
  const cleaned = src.replace(/[<>]/g, '');
  return /[\s()]/.test(cleaned) ? `<${cleaned}>` : cleaned;
}

// GFM テーブルセル用: 区切りと衝突する | をエスケープ（textContent は既に空白圧縮済み）
function escapeTableCell(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

// <pre><code> へ文字列を注入する際のエスケープ: & < > を実体参照化して
// </code></pre> によるタグ脱出を防ぐ。turndown が textContent で復号するため原文は保たれる。
function escapeHtmlForCode(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// fenced code block を生成する。コード本文に含まれる ``` でフェンスが途中で
// 閉じて本文が漏れる（構造破壊）のを防ぐため、本文中の最長バッククォート連長 +1
// （最低 3）のフェンスを使う（CommonMark 準拠）。
function toFencedCodeBlock(code, lang = '') {
  const runs = code.match(/`+/g) || [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `\n\n${fence}${lang}\n${code}\n${fence}\n\n`;
}

/**
 * Crayon / 古い Luxeritas の [highlight_LANG]...[/highlight_LANG] shortcode を
 * <pre class="language-LANG"><code>...</code></pre> に変換する preprocessor。
 *
 * REST API は shortcode を expand しないため、Turndown で処理する前にこれを通す。
 */
export function preprocessShortcodes(html) {
  if (!html) return html;
  return html.replace(
    /\[highlight_(\w+)\]([\s\S]*?)\[\/highlight_\1\]/g,
    (_m, lang, code) =>
      `<pre class="language-${lang}"><code>${escapeHtmlForCode(code.trim())}</code></pre>`
  );
}

export function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  // 1a. Luxeritas シンタックスハイライト
  td.addRule('luxeritasSyntaxHighlighter', {
    filter: (node) =>
      node.nodeName === 'PRE' &&
      node.classList?.contains('wp-block-luxe-blocks-syntaxhighlighter'),
    replacement: (_content, node) => {
      const lang = node.getAttribute('data-language') || '';
      const code = node.textContent.replace(/\n+$/, '');
      return toFencedCodeBlock(code, lang);
    },
  });

  // 1b. Prism 風の language-X クラス pre（preprocessShortcodes 後に作られる）
  td.addRule('prismLanguageBlock', {
    filter: (node) => {
      if (node.nodeName !== 'PRE') return false;
      const cls = node.className || '';
      return /\blanguage-\w+/.test(cls);
    },
    replacement: (_content, node) => {
      const cls = node.className || '';
      const m = cls.match(/\blanguage-(\w+)/);
      const lang = m ? m[1] : '';
      const code = node.textContent.replace(/\n+$/, '').replace(/<br\s*\/?>/gi, '\n');
      return toFencedCodeBlock(code, lang);
    },
  });

  // 2. wp-block-image figure を Markdown 画像へ集約
  td.addRule('wpBlockImage', {
    filter: (node) =>
      node.nodeName === 'FIGURE' && node.classList?.contains('wp-block-image'),
    replacement: (_content, node) => {
      const img = node.querySelector('img');
      if (!img) return '';
      const src = escapeMdUrl(rewriteImageSrc(img.getAttribute('src')));
      const alt = escapeMdText(img.getAttribute('alt'));
      return `\n\n![${alt}](${src})\n\n`;
    },
  });

  // 3. 残った <img> の src を書き換え
  td.addRule('rewriteImg', {
    filter: 'img',
    replacement: (_content, node) => {
      const rawSrc = rewriteImageSrc(node.getAttribute('src'));
      if (!rawSrc) return '';
      const src = escapeMdUrl(rawSrc);
      const alt = escapeMdText(node.getAttribute('alt'));
      return `![${alt}](${src})`;
    },
  });

  // 4. AdSense / 関連記事ウィジェット / シェアボタンの除去
  // 不要な div クラス名は実サイトに合わせて追加すること
  td.addRule('removeAds', {
    filter: (node) => {
      if (node.nodeName === 'INS' && node.classList?.contains('adsbygoogle')) return true;
      if (node.classList?.contains('thk_ps_widget')) return true;     // Luxeritas 関連記事
      if (node.classList?.contains('related-under')) return true;     // Luxeritas 記事下関連
      if (node.classList?.contains('sns-share')) return true;         // 一般的なシェアボタン
      // 追加: 他のテーマ固有クラス名
      return false;
    },
    replacement: () => '',
  });

  // 5. GFM table
  td.addRule('gfmTable', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return '';
      const cellsOf = (row) =>
        Array.from(row.querySelectorAll('th,td')).map((c) =>
          escapeTableCell(c.textContent.replace(/\s+/g, ' ').trim())
        );
      const headerCells = cellsOf(rows[0]);
      const bodyRows = rows.slice(1).map(cellsOf);
      const header = `| ${headerCells.join(' | ')} |`;
      const sep = `| ${headerCells.map(() => '---').join(' | ')} |`;
      const body = bodyRows.map((r) => `| ${r.join(' | ')} |`).join('\n');
      return `\n\n${header}\n${sep}\n${body}\n\n`;
    },
  });

  return td;
}

// 便利関数: 共有 turndown インスタンスを保持しつつ preprocess + turndown を一発で
let _sharedTd = null;
export function convertHtml(html) {
  if (!_sharedTd) _sharedTd = createTurndown();
  return _sharedTd.turndown(preprocessShortcodes(html));
}

export { rewriteImageSrc };
