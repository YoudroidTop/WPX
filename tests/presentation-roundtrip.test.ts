import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportOffice, importOffice } from '../server/office';
import type { SlideContent } from '../shared/documents';
import JSZip from 'jszip';

const fixture: SlideContent = {
  type: 'slide',
  slides: [
    {
      id: 'first',
      title: '',
      body: ' First\n\nSecond ',
      notes: ' Note one\nNote two ',
      theme: 'forest',
    },
    { id: 'second', title: ' Title & <text> ', body: '', notes: '', theme: 'midnight' },
    { id: 'third', title: 'Final', body: 'Body', notes: 'Final notes', theme: 'paper' },
  ],
};

test('PPTX round trip preserves blank titles, whitespace, notes, themes and slide order', async () => {
  const restored = await importOffice('slides.pptx', await exportOffice(fixture));
  assert.equal(restored.type, 'slide');
  if (restored.type === 'slide')
    assert.deepEqual(
      restored.slides.map(({ id, ...slide }) => slide),
      fixture.slides.map(({ id, ...slide }) => slide),
    );
});

test('PPTX declared notes cannot silently disappear or reference external content', async () => {
  for (const external of [false, true]) {
    const zip = await JSZip.loadAsync(await exportOffice(fixture));
    if (external) {
      const path = 'ppt/slides/_rels/slide1.xml.rels';
      const source = await zip.file(path)!.async('string');
      zip.file(
        path,
        source.replace(
          'Target="../notesSlides/notesSlide1.xml"',
          'Target="https://example.com/notes.xml" TargetMode="External"',
        ),
      );
    } else zip.remove('ppt/notesSlides/notesSlide1.xml');
    await assert.rejects(
      importOffice('broken.pptx', await zip.generateAsync({ type: 'nodebuffer' })),
      /备注|外部/,
    );
  }
});
