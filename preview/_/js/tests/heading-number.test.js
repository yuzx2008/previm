'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('../lib/markdown-it.min.js');
const headingNumber = require('../lib/markdown-it-heading-number.js');

function render(mdText, options) {
  const md = new MarkdownIt();
  md.use(headingNumber, options);
  return md.render(mdText);
}

test('一级标题使用中文编号', () => {
  const html = render('# 第一章\n');
  assert.match(html, /<span class="heading-number">一、<\/span>/);
});

test('子级标题使用数字编号', () => {
  const html = render('# 第一章\n\n## 第一节\n');
  assert.match(html, /<span class="heading-number">一、<\/span>/);
  assert.match(html, /<span class="heading-number">1\.1<\/span>/);
});

test('目录与编号同步', () => {
  const html = render('[[toc]]\n\n# 第一章\n\n## 概述\n');
  assert.match(html, /<nav class="previm-toc">/);
  assert.match(html, /<span class="heading-number">一、<\/span> 第一章/);
  assert.match(html, /<span class="heading-number">1\.1<\/span> 概述/);
});

test('重复标题编号递增且 slug 唯一', () => {
  const html = render('# 第一章\n\n# 第一章\n');
  const matches = Array.from(html.matchAll(/<h1 data-heading-number="([^"]+)" id="([^"]+)">/g));
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map(m => m[1]), ['1', '2']);
  assert.deepEqual(matches.map(m => m[2]), ['1-第一章', '2-第一章']);
});

test('跳级标题保持正确编号', () => {
  const html = render('# 顶部\n\n### 跳级小节\n');
  assert.match(html, /<h3 data-heading-number="1\.1" id="11-跳级小节">/);
});

test('自定义级别仅编号指定层级', () => {
  const html = render('# 顶部\n\n## 子节\n', { level: [2, 3, 4, 5, 6] });
  assert.doesNotMatch(html, /<span class="heading-number">一、<\/span>/);
  assert.match(html, /<span class="heading-number">1<\/span> 子节/);
});
