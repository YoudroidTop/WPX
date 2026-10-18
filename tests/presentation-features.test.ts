import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSchema } from '../shared/documents';
import type { SlideContent, Slide } from '../shared/documents';
import { exportOffice, importOffice } from '../server/office';
import { THEME_PRESETS, LAYOUT_PRESETS, TRANSITION_PRESETS } from '../src/components/slide/types';

test('SlideContent schema accepts all new WPS presentation layouts, themes, and elements', () => {
  const richPresentation: SlideContent = {
    type: 'slide',
    ratio: '16:9',
    slides: [
      {
        id: 'slide-title',
        title: '2026 年度产品发布会',
        body: '重塑云端办公新体验',
        notes: '开场致辞与嘉宾介绍',
        theme: 'ocean',
        layout: 'title',
        transition: 'fade',
      },
      {
        id: 'slide-two-col',
        title: '新旧方案全面对比',
        body: '传统办公软件：安装繁重，版本割裂，跨端体验差。',
        secondaryBody: '卓乐云文档：轻量快速，数据加密，多端原生体验。',
        notes: '对比要点详细说明',
        theme: 'forest',
        layout: 'two-column',
        transition: 'slide',
      },
      {
        id: 'slide-cards',
        title: '核心架构特性',
        body: '三大核心支柱',
        notes: '架构要点汇报',
        theme: 'lavender',
        layout: 'three-card',
        cardItems: [
          { title: '极速响应', desc: '毫秒级运算，流畅丝滑', icon: 'Zap' },
          { title: '多端协同', desc: '全格式 Office 无缝兼容', icon: 'Layers' },
          { title: '安全无忧', desc: '双重持久化与历史回溯', icon: 'Award' },
        ],
      },
      {
        id: 'slide-elements',
        title: '混合自由元素页',
        body: '包含图形、文本、表格与图表',
        notes: '详细数据展示',
        theme: 'midnight',
        layout: 'content',
        background: {
          type: 'gradient',
          color: '#172a33',
          gradientEnd: '#0d1b22',
          gradientAngle: 135,
        },
        elements: [
          {
            id: 'elem-shape-1',
            type: 'shape',
            kind: 'roundRect',
            x: 10,
            y: 20,
            width: 30,
            height: 25,
            fill: '#2f855a',
            text: '核心指标',
          },
          {
            id: 'elem-table-1',
            type: 'table',
            x: 45,
            y: 20,
            width: 50,
            height: 35,
            rows: 2,
            cols: 2,
            data: [
              ['季度', '增长率'],
              ['Q1', '+150%'],
            ],
            headerRow: true,
          },
          {
            id: 'elem-chart-1',
            type: 'chart',
            x: 20,
            y: 50,
            width: 60,
            height: 40,
            chartType: 'bar',
            title: '增长趋势',
            categories: ['Q1', 'Q2', 'Q3', 'Q4'],
            series: [{ name: '数值', values: [100, 200, 350, 500] }],
          },
        ],
      },
    ],
  };

  const parsed = contentSchema.parse(richPresentation);
  assert.equal(parsed.type, 'slide');
  if (parsed.type === 'slide') {
    assert.equal(parsed.slides.length, 4);
    assert.equal(parsed.slides[0].theme, 'ocean');
    assert.equal(parsed.slides[0].layout, 'title');
    assert.equal(parsed.slides[1].layout, 'two-column');
    assert.equal(parsed.slides[2].cardItems?.length, 3);
    assert.equal(parsed.slides[3].elements?.length, 3);
  }
});

test('SlideContent schema rejects invalid theme, duplicate IDs, and invalid layouts', () => {
  // Invalid layout
  assert.equal(
    contentSchema.safeParse({
      type: 'slide',
      slides: [
        {
          id: 's1',
          title: 'Title',
          body: 'Body',
          notes: '',
          theme: 'forest',
          layout: 'invalid-layout',
        },
      ],
    }).success,
    false,
  );

  // Invalid theme
  assert.equal(
    contentSchema.safeParse({
      type: 'slide',
      slides: [
        {
          id: 's1',
          title: 'Title',
          body: 'Body',
          notes: '',
          theme: 'neon-cyberpunk',
        },
      ],
    }).success,
    false,
  );

  // Duplicate slide IDs
  assert.equal(
    contentSchema.safeParse({
      type: 'slide',
      slides: [
        { id: 'dup', title: 'T1', body: 'B1', notes: '', theme: 'forest' },
        { id: 'dup', title: 'T2', body: 'B2', notes: '', theme: 'paper' },
      ],
    }).success,
    false,
  );
});

test('Extended themes and 4:3 ratio export cleanly to PPTX and roundtrip back', async () => {
  const customPresentation: SlideContent = {
    type: 'slide',
    ratio: '4:3',
    slides: [
      {
        id: 's1',
        title: '标屏 4:3 演示',
        body: '采用科技深蓝主题与经典画幅',
        notes: '演讲者备注测试',
        theme: 'ocean',
      },
      {
        id: 's2',
        title: '热忱朱红主题',
        body: '对比强烈，重点突出',
        notes: '第二页备注',
        theme: 'crimson',
        background: { type: 'color', color: '#FFF1F2' },
      },
    ],
  };

  const bytes = await exportOffice(customPresentation);
  assert.ok(bytes.length > 0);

  const imported = await importOffice('test-extended.pptx', bytes);
  assert.equal(imported.type, 'slide');
  if (imported.type === 'slide') {
    assert.equal(imported.slides.length, 2);
    assert.equal(imported.slides[0].title, '标屏 4:3 演示');
    assert.equal(imported.slides[1].title, '热忱朱红主题');
  }
});

test('All preset definitions in types.ts are valid and comprehensive', () => {
  assert.equal(THEME_PRESETS.length >= 8, true);
  for (const t of THEME_PRESETS) {
    assert.ok(t.id && t.name && t.bg && t.text && t.accent);
  }

  assert.equal(LAYOUT_PRESETS.length, 8);
  const layoutIds = LAYOUT_PRESETS.map((l) => l.id);
  assert.deepEqual(layoutIds, [
    'title',
    'content',
    'two-column',
    'three-card',
    'timeline',
    'big-image',
    'quote',
    'blank',
  ]);

  assert.equal(TRANSITION_PRESETS.length, 5);
});
