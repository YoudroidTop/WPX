import { XMLParser } from 'fast-xml-parser';
import type { RichNode } from '../shared/documents';
import { ApiError } from './errors';

type XmlNode = Record<string, unknown>;
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});
const children = (node: XmlNode | undefined, tag: string): XmlNode[] =>
  Array.isArray(node?.[tag]) ? (node[tag] as XmlNode[]) : [];
const property = (nodes: XmlNode[], tag: string) => nodes.find((node) => tag in node);
const value = (node: XmlNode | undefined): string | undefined =>
  (node?.[':@'] as Record<string, string> | undefined)?.['@_w:val'];

function paragraph(nodes: XmlNode[]): RichNode {
  const properties = children(property(nodes, 'w:pPr'), 'w:pPr');
  const heading = /^Heading([1-6])$/i.exec(value(property(properties, 'w:pStyle')) ?? '');
  const alignment = value(property(properties, 'w:jc'));
  const textAlign = alignment === 'both' ? 'justify' : alignment;
  const attrs = {
    ...(heading ? { level: Number(heading[1]) } : {}),
    ...(['center', 'right', 'justify'].includes(textAlign ?? '') ? { textAlign } : {}),
  };
  const content: RichNode[] = [];
  // Hyperlink text remains readable; relationship-based link targets are not imported.
  const runs = nodes.flatMap((node) =>
    'w:hyperlink' in node ? children(node, 'w:hyperlink') : [node],
  );
  for (const node of runs) {
    if (!('w:r' in node)) continue;
    const run = children(node, 'w:r');
    const formatting = children(property(run, 'w:rPr'), 'w:rPr');
    const marks = [
      ['w:b', 'bold'],
      ['w:i', 'italic'],
      ['w:strike', 'strike'],
      ['w:u', 'underline'],
    ].flatMap(([tag, type]) => {
      const setting = property(formatting, tag);
      return setting && !['0', 'false', 'off', 'none'].includes(value(setting)?.toLowerCase() ?? '')
        ? [{ type }]
        : [];
    });
    for (const part of run) {
      if ('w:br' in part || 'w:cr' in part) content.push({ type: 'hardBreak' });
      else {
        const text =
          'w:tab' in part
            ? '\t'
            : children(part, 'w:t')
                .map((item) => String(item['#text'] ?? ''))
                .join('');
        if (text) content.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
      }
    }
  }
  return {
    type: heading ? 'heading' : 'paragraph',
    ...(Object.keys(attrs).length ? { attrs } : {}),
    content,
  };
}

function blocks(nodes: XmlNode[], inCell = false): RichNode[] {
  return nodes.flatMap((node): RichNode[] => {
    if ('w:p' in node) return [paragraph(children(node, 'w:p'))];
    if (!('w:tbl' in node)) return [];
    // The native model does not support nested tables; reject instead of dropping their text.
    if (inCell) throw new ApiError(400, '暂不支持嵌套表格，请简化文档后导入');
    return [
      {
        type: 'table',
        content: children(node, 'w:tbl')
          .filter((row) => 'w:tr' in row)
          .map((row) => ({
            type: 'tableRow',
            content: children(row, 'w:tr')
              .filter((cell) => 'w:tc' in cell)
              .map((cell) => {
                const content = blocks(children(cell, 'w:tc'), true);
                return {
                  type: 'tableCell',
                  content: content.length ? content : [{ type: 'paragraph', content: [] }],
                };
              }),
          })),
      },
    ];
  });
}

export function importWordXml(source: string): RichNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new ApiError(400, '不支持包含实体声明的 XML 文件');
  const xml = parser.parse(source) as XmlNode[];
  const document = children(property(xml, 'w:document'), 'w:document');
  const body = property(document, 'w:body');
  if (!body) throw new ApiError(400, '不是有效的 Word 文件');
  const content = blocks(children(body, 'w:body'));
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
