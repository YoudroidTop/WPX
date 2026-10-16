import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWordStats } from '../src/components/word/WordCountModal';
import { CHINESE_FONT_SIZES, STEP_FONT_SIZES } from '../src/components/word/WordFontDropdown';

test('computeWordStats correctly calculates chinese, english, spaces, and paragraphs', () => {
  const sampleText = '你好，世界！ Hello world. 123';
  const rawDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '你好，世界！' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world. 123' }] },
    ],
  };

  const stats = computeWordStats(sampleText, rawDoc);
  // Chinese chars: 你, 好, 世, 界 (4)
  assert.equal(stats.chineseChars, 4);
  // Words: chineseChars (4) + englishWords ('Hello', 'world', '123' = 3) -> 7
  assert.equal(stats.words, 7);
  // Total characters without spaces
  assert.equal(stats.charsNoSpaces, sampleText.replace(/\s/g, '').length);
  // Paragraphs
  assert.equal(stats.paragraphs, 2);
});

test('Word font size presets and stepping are well-defined', () => {
  const a4Pt = CHINESE_FONT_SIZES.find((s) => s.label === '小四');
  assert.equal(a4Pt?.pt, '12');

  const chuHao = CHINESE_FONT_SIZES.find((s) => s.label === '初号');
  assert.equal(chuHao?.pt, '42');

  // Verify step font sizes are strictly ascending
  for (let i = 1; i < STEP_FONT_SIZES.length; i++) {
    assert.ok(STEP_FONT_SIZES[i] > STEP_FONT_SIZES[i - 1]);
  }
});
