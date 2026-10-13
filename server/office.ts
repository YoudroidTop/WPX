import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import { XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'node:crypto';
import {
  contentSchema,
  MAX_COLUMNS,
  MAX_ROWS,
  type DocumentContent,
  type RichNode,
} from '../shared/documents';
import { createCalculator } from '../shared/formulas';
import { ApiError } from './errors';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: true,
});
function parseXml(source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new ApiError(400, '不支持包含实体声明的 XML 文件');
  return parser.parse(source);
}
const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const stringText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value)
          .filter(([key]) => !key.startsWith('@_'))
          .map(([, entry]) => stringText(entry))
          .join('')
      : '';
const textOf = (node: RichNode): string =>
  node.text ?? (node.content ?? []).map(textOf).join(node.type === 'paragraph' ? '' : '\n');

function wordBlocks(nodes: RichNode[]): (Paragraph | Table)[] {
  return nodes.flatMap((node): (Paragraph | Table)[] => {
    if (node.type === 'table')
      return [
        new Table({
          rows: (node.content ?? []).map(
            (row) =>
              new TableRow({
                children: (row.content ?? []).map(
                  (cell) => new TableCell({ children: wordBlocks(cell.content ?? []) }),
                ),
              }),
          ),
        }),
      ];
    if (['bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type))
      return wordBlocks(node.content ?? []);
    const runs = (node.content ?? []).map(
      (child) =>
        new TextRun({
          text: child.type === 'hardBreak' ? '' : textOf(child),
          break: child.type === 'hardBreak' ? 1 : undefined,
          bold: child.marks?.some((m) => m.type === 'bold'),
          italics: child.marks?.some((m) => m.type === 'italic'),
          strike: child.marks?.some((m) => m.type === 'strike'),
          underline: child.marks?.some((m) => m.type === 'underline') ? {} : undefined,
        }),
    );
    const headings = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    return [
      new Paragraph({
        children: runs,
        heading: node.type === 'heading' ? headings[Number(node.attrs?.level ?? 1) - 1] : undefined,
        alignment: (
          {
            left: AlignmentType.LEFT,
            center: AlignmentType.CENTER,
            right: AlignmentType.RIGHT,
            justify: AlignmentType.JUSTIFIED,
          } as Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]>
        )[String(node.attrs?.textAlign ?? 'left')],
      }),
    ];
  });
}
export async function exportOffice(content: DocumentContent): Promise<Buffer> {
  let buffer: Buffer;
  if (content.type === 'word') {
    buffer = await Packer.toBuffer(
      new Document({ sections: [{ children: wordBlocks(content.doc.content ?? []) }] }),
    );
  } else if (content.type === 'sheet') {
    const workbook = new ExcelJS.Workbook();
    for (const sheet of content.sheets) {
      const ws = workbook.addWorksheet(sheet.name.replace(/[\\/*?:\[\]]/g, '_'));
      const calculate = createCalculator(sheet.cells);
      for (const [address, raw] of Object.entries(sheet.cells)) {
        if (raw.startsWith('=')) {
          const result = calculate(address);
          ws.getCell(address).value = {
            formula: raw.slice(1),
            result: typeof result === 'number' ? result : undefined,
          };
        } else
          ws.getCell(address).value =
            raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      }
      ws.columns?.forEach((column) => {
        column.width = 18;
      });
    }
    workbook.calcProperties.fullCalcOnLoad = true;
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  } else {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = '卓乐云文档';
    pptx.subject = 'Presentation';
    for (const data of content.slides) {
      const slide = pptx.addSlide();
      const colors =
        data.theme === 'forest'
          ? ['EAF1E9', '174C3B']
          : data.theme === 'midnight'
            ? ['172A33', 'F3F1E9']
            : ['FAF8F3', '2B342D'];
      slide.background = { color: colors[0] };
      slide.addText(data.title, {
        x: 0.85,
        y: 1.1,
        w: 11.6,
        h: 1.6,
        fontSize: 34,
        color: colors[1],
        bold: true,
        breakLine: false,
        fontFace: 'Microsoft YaHei',
      });
      slide.addText(data.body, {
        x: 0.9,
        y: 3.0,
        w: 11.4,
        h: 3.5,
        fontSize: 22,
        color: colors[1],
        fontFace: 'Microsoft YaHei',
        valign: 'top',
      });
      slide.addNotes(data.notes);
    }
    buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  }
  return buffer;
}

// Validate declared and actual expansion sizes before any Office parser consumes a ZIP.
async function boundedZip(bytes: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > 3000) throw new ApiError(400, '文件结构过于复杂');
  let total = 0;
  for (const entry of entries) {
    const declared = (entry as unknown as { _data: { uncompressedSize: number } })._data
      .uncompressedSize;
    if (!Number.isFinite(declared) || declared > 20_000_000 || (total += declared) > 40_000_000)
      throw new ApiError(400, '文件解压后过大');
  }
  for (const entry of entries) {
    await new Promise<void>((resolve, reject) => {
      const stream = (
        entry as JSZip.JSZipObject & {
          internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
        }
      ).internalStream('uint8array');
      const declared = (entry as unknown as { _data: { uncompressedSize: number } })._data
        .uncompressedSize;
      let size = 0;
      stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > declared || size > 20_000_000) {
          stream.pause();
          reject(new ApiError(400, '文件解压后过大'));
        }
      });
      stream.on('error', reject);
      stream.on('end', () =>
        size === declared ? resolve() : reject(new ApiError(400, '文件结构无效')),
      );
      stream.resume();
    });
  }
  return zip;
}
export async function importOffice(filename: string, bytes: Buffer): Promise<DocumentContent> {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'zdoc') return contentSchema.parse(JSON.parse(bytes.toString('utf8')));
  if (!['docx', 'xlsx', 'pptx'].includes(extension ?? ''))
    throw new ApiError(400, '支持 DOCX、XLSX、PPTX 和 ZDOC 文件');
  const zip = await boundedZip(bytes);
  if (extension === 'docx') {
    const source = await zip.file('word/document.xml')?.async('string');
    if (!source) throw new ApiError(400, '不是有效的 Word 文件');
    const xml = parseXml(source);
    const paragraphs: RichNode[] = array<any>(xml['w:document']?.['w:body']?.['w:p']).map((p) => {
      const style = p['w:pPr']?.['w:pStyle']?.['@_w:val'];
      const heading = /Heading([1-6])/i.exec(String(style));
      return {
        type: heading ? 'heading' : 'paragraph',
        ...(heading ? { attrs: { level: Number(heading[1]) } } : {}),
        content: array<any>(p['w:r']).flatMap((r) => {
          const text = stringText(r['w:t']);
          return text
            ? [
                {
                  type: 'text',
                  text,
                  marks: [
                    ...(r['w:rPr']?.['w:b'] !== undefined ? [{ type: 'bold' }] : []),
                    ...(r['w:rPr']?.['w:i'] !== undefined ? [{ type: 'italic' }] : []),
                  ],
                },
              ]
            : [];
        }),
      };
    });
    return contentSchema.parse({
      type: 'word',
      doc: { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] },
    });
  }
  if (extension === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    if (workbook.worksheets.length > 20) throw new ApiError(400, '最多支持 20 个工作表');
    const sheets = workbook.worksheets.map((ws) => {
      if (ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLUMNS)
        throw new ApiError(400, '基础版每张工作表最多支持 500 行、52 列');
      const cells: Record<string, string> = {};
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          cells[cell.address] = cell.formula ? `=${cell.formula}` : cell.text;
        }),
      );
      return { id: randomUUID(), name: ws.name, cells };
    });
    return contentSchema.parse({ type: 'sheet', sheets });
  }
  const presentationSource = await zip.file('ppt/presentation.xml')?.async('string');
  const relationshipsSource = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
  if (!presentationSource || !relationshipsSource) throw new ApiError(400, '不是有效的 PPT 文件');
  const relationships = array<any>(parseXml(relationshipsSource).Relationships?.Relationship);
  const ids = array<any>(
    parseXml(presentationSource)['p:presentation']?.['p:sldIdLst']?.['p:sldId'],
  );
  if (ids.length > 100) throw new ApiError(400, '最多支持 100 页幻灯片');
  const slides = [];
  for (const id of ids) {
    const target = relationships.find((r) => r['@_Id'] === id['@_r:id'])?.['@_Target'];
    const path =
      typeof target === 'string'
        ? target.startsWith('/')
          ? target.slice(1)
          : `ppt/${target}`
        : '';
    const source = await zip.file(path)?.async('string');
    if (!source) throw new ApiError(400, '幻灯片内容缺失');
    const xml = parseXml(source);
    const shapes = array<any>(xml['p:sld']?.['p:cSld']?.['p:spTree']?.['p:sp']);
    const blocks = shapes
      .map((shape) =>
        array<any>(shape['p:txBody']?.['a:p'])
          .map((p) =>
            array<any>(p['a:r'])
              .map((r) => stringText(r['a:t']))
              .join(''),
          )
          .join('\n'),
      )
      .filter(Boolean);
    slides.push({
      id: randomUUID(),
      title: blocks[0] || '未命名幻灯片',
      body: blocks.slice(1).join('\n'),
      notes: '',
      theme: 'paper' as const,
    });
  }
  return contentSchema.parse({ type: 'slide', slides });
}
