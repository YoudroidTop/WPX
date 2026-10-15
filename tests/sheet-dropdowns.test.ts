import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_COLOR_MATRIX, STANDARD_COLORS } from '../src/components/sheet/SheetColorPickerDropdown';
import { BORDER_OPTIONS } from '../src/components/sheet/SheetBorderDropdown';
import { SYSTEM_FONTS } from '../src/components/sheet/SheetFontDropdown';

test('SheetColorPickerDropdown has valid 6x10 theme color matrix and standard colors', () => {
  assert.equal(THEME_COLOR_MATRIX.length, 6, 'Theme palette must have 6 rows (base + 5 gradient rows)');
  for (const row of THEME_COLOR_MATRIX) {
    assert.equal(row.length, 10, 'Each row must have 10 columns');
    for (const color of row) {
      assert.match(color, /^#[0-9a-f]{6}$/i, `Color ${color} must be a 6-digit hex`);
    }
  }

  assert.equal(STANDARD_COLORS.length, 10, 'Standard colors must have 10 preset colors');
  for (const color of STANDARD_COLORS) {
    assert.match(color, /^#[0-9a-f]{6}$/i, `Standard color ${color} must be a 6-digit hex`);
  }
});

test('SheetBorderDropdown has full 9 border presets and line colors', () => {
  assert.equal(BORDER_OPTIONS.length, 9, 'Must have 9 core border presets');
  const ids = BORDER_OPTIONS.map((b) => b.id);
  assert.ok(ids.includes('none'));
  assert.ok(ids.includes('all'));
  assert.ok(ids.includes('outside'));
  assert.ok(ids.includes('thick-outside'));
  assert.ok(ids.includes('double-bottom'));
  assert.ok(ids.includes('bottom'));
  assert.ok(ids.includes('top'));
  assert.ok(ids.includes('left'));
  assert.ok(ids.includes('right'));
});

test('SheetFontDropdown provides curated font list with English and Chinese names', () => {
  assert.ok(SYSTEM_FONTS.length >= 8, 'Must have multiple common fonts');
  const yahei = SYSTEM_FONTS.find((f) => f.name.includes('微软雅黑'));
  assert.ok(yahei, 'Must include Microsoft YaHei');
  const song = SYSTEM_FONTS.find((f) => f.name.includes('宋体'));
  assert.ok(song, 'Must include SimSun/SongTi');
  const arial = SYSTEM_FONTS.find((f) => f.name.includes('Arial'));
  assert.ok(arial, 'Must include Arial');
});
