import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import type JSZip from 'jszip';
import type { SlideContent } from '../shared/documents';
import { ApiError } from './errors';

type XmlNode = Record<string, unknown>;
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});
const children = (node: XmlNode, tag: string): XmlNode[] =>
  Array.isArray(node[tag]) ? (node[tag] as XmlNode[]) : [];
const attributes = (node: XmlNode): Record<string, string> =>
  (node[':@'] ?? {}) as Record<string, string>;
function descend(nodes: XmlNode[], ...tags: string[]): XmlNode[] {
  return tags.reduce((items, tag) => items.flatMap((item) => children(item, tag)), nodes);
}
function parse(source: string): XmlNode[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new ApiError(400, '不支持包含实体声明的 XML 文件');
  return parser.parse(source) as XmlNode[];
}
function textBody(shape: XmlNode[]): string {
  const body = descend(shape, 'p:txBody');
  return body
    .filter((node) => 'a:p' in node)
    .map((node) =>
      children(node, 'a:p')
        .map((part) => {
          if ('a:br' in part) return '\n';
          const runs = 'a:r' in part ? children(part, 'a:r') : children(part, 'a:fld');
          return descend(runs, 'a:t')
            .map((text) => String(text['#text'] ?? ''))
            .join('');
        })
        .join(''),
    )
    .join('\n')
    .replace(/\r\n?/g, '\n');
}
function partPath(owner: string, relationship: XmlNode): string {
  const attrs = attributes(relationship);
  const target = attrs['@_Target'];
  if (
    !target ||
    attrs['@_TargetMode'] === 'External' ||
    /^[a-z][a-z\d+.-]*:/i.test(target) ||
    target.includes('\\')
  )
    throw new ApiError(400, '不支持外部幻灯片或备注内容');
  const path = posix.normalize(
    target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(owner), target),
  );
  if (!path.startsWith('ppt/')) throw new ApiError(400, '幻灯片或备注路径无效');
  return path;
}
async function relationships(zip: JSZip, owner: string): Promise<XmlNode[]> {
  const path = posix.join(posix.dirname(owner), '_rels', `${posix.basename(owner)}.rels`);
  const source = await zip.file(path)?.async('string');
  return source
    ? descend(parse(source), 'Relationships').filter((node) => 'Relationship' in node)
    : [];
}

export async function importPresentation(zip: JSZip): Promise<SlideContent> {
  const source = await zip.file('ppt/presentation.xml')?.async('string');
  if (!source) throw new ApiError(400, '不是有效的 PPT 文件');
  const ids = descend(parse(source), 'p:presentation', 'p:sldIdLst').filter(
    (node) => 'p:sldId' in node,
  );
  if (ids.length > 100) throw new ApiError(400, '最多支持 100 页幻灯片');
  const links = await relationships(zip, 'ppt/presentation.xml');
  const slides: SlideContent['slides'] = [];
  for (const id of ids) {
    const link = links.find((node) => attributes(node)['@_Id'] === attributes(id)['@_r:id']);
    if (!link) throw new ApiError(400, '幻灯片内容缺失');
    const path = partPath('ppt/presentation.xml', link);
    const source = await zip.file(path)?.async('string');
    if (!source) throw new ApiError(400, '幻灯片内容缺失');
    const slide = descend(parse(source), 'p:sld', 'p:cSld');
    // Keep empty text boxes: the exported title is allowed to be blank.
    const textShapes = descend(slide, 'p:spTree')
      .filter((node) => 'p:sp' in node)
      .map((node) => children(node, 'p:sp'))
      .filter((shape) => shape.some((node) => 'p:txBody' in node));
    const texts = textShapes.map(textBody);
    const color = descend(slide, 'p:bg', 'p:bgPr', 'a:solidFill').find(
      (node) => 'a:srgbClr' in node,
    );
    const background = color ? attributes(color)['@_val']?.toUpperCase() : '';
    let notes = '';
    const noteLink = (await relationships(zip, path)).find((node) =>
      attributes(node)['@_Type']?.endsWith('/notesSlide'),
    );
    if (noteLink) {
      const noteSource = await zip.file(partPath(path, noteLink))?.async('string');
      if (!noteSource) throw new ApiError(400, '演讲者备注内容缺失');
      const noteShapes = descend(parse(noteSource), 'p:notes', 'p:cSld', 'p:spTree')
        .filter((node) => 'p:sp' in node)
        .map((node) => children(node, 'p:sp'));
      notes = noteShapes
        .filter((shape) =>
          descend(shape, 'p:nvSpPr', 'p:nvPr').some(
            (node) => 'p:ph' in node && attributes(node)['@_type'] === 'body',
          ),
        )
        .map(textBody)
        .join('\n');
    }
    slides.push({
      id: randomUUID(),
      title: texts[0] ?? '未命名幻灯片',
      body: texts.slice(1).join('\n'),
      notes,
      theme: background === 'EAF1E9' ? 'forest' : background === '172A33' ? 'midnight' : 'paper',
    });
  }
  return { type: 'slide', slides };
}
