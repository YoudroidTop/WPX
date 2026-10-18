import {
  readCellNote,
  readAutoFilterRange,
  readCellStyle,
  readValidations,
  writeCellStyle,
  writeValidations,
} from './sheet-style';
import type { SheetCellStyle, SheetComment } from '../shared/documents';
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
import { randomUUID } from 'node:crypto';
import { filterBounds, filteredRows } from '../shared/sheet-filter';
import { boundsLabel } from '../shared/sheet-validation';
import {
  contentSchema,
  MAX_COLUMNS,
  MAX_ROWS,
  MAX_SHEET_COMMENTS,
  type DocumentContent,
  type RichNode,
} from '../shared/documents';
import { createCalculator } from '../shared/formulas';
import { ApiError } from './errors';
import { importWordXml } from './word-import';
import { importPresentation } from './presentation-import';

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
// Preserve identifiers and spelling that a numeric XLSX cell cannot round-trip.
// Excel stores at most 15 significant decimal digits.
function spreadsheetValue(raw: string): string | number {
  const value = Number(raw);
  const digits = raw.replace(/[-.]/g, '').replace(/^0+/, '');
  return /^-?\d+(?:\.\d+)?$/.test(raw) &&
    Number.isFinite(value) &&
    String(value) === raw &&
    digits.length <= 15
    ? value
    : raw;
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
      if (sheet.frozenRows || sheet.frozenColumns)
        ws.views = [
          {
            state: 'frozen',
            xSplit: sheet.frozenColumns ?? 0,
            ySplit: sheet.frozenRows ?? 0,
          },
        ];
      const calculate = createCalculator(sheet.cells);
      for (const [address, raw] of Object.entries(sheet.cells)) {
        if (raw.startsWith('=')) {
          const result = calculate(address);
          ws.getCell(address).value = {
            formula: raw.slice(1),
            result: typeof result === 'number' ? result : undefined,
          };
        } else ws.getCell(address).value = spreadsheetValue(raw);
      }
      for (const [address, style] of Object.entries(sheet.styles ?? {}))
        writeCellStyle(ws.getCell(address), style);
      for (const [address, comment] of Object.entries(sheet.comments ?? {})) {
        const cell = ws.getCell(address);
        // ExcelJS drops notes on cells without a value, so give empty cells an empty string.
        if (cell.value === null) cell.value = '';
        cell.note = comment.text;
      }
      writeValidations(ws, sheet.validations ?? []);
      const filter = filterBounds(sheet);
      if (filter) {
        // Only the range and the resulting hidden rows round-trip; criteria stay app-side.
        ws.autoFilter = boundsLabel(filter);
        for (const row of filteredRows(sheet, calculate)) ws.getRow(row).hidden = true;
      }
      ws.columns?.forEach((column) => {
        column.width = 18;
      });
      for (const [index, width] of Object.entries(sheet.columnWidths ?? {}))
        ws.getColumn(Number(index) + 1).width = (width - 5) / 7;
      for (const [index, height] of Object.entries(sheet.rowHeights ?? {}))
        ws.getRow(Number(index)).height = height * 0.75;
    }
    workbook.calcProperties.fullCalcOnLoad = true;
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  } else {
    const pptx = new PptxGenJS();
    pptx.layout = content.ratio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE';
    pptx.author = '卓乐云文档';
    pptx.subject = 'Presentation';
    const themeColors: Record<string, [string, string]> = {
      forest: ['EAF1E9', '174C3B'],
      paper: ['FAF8F3', '2B342D'],
      midnight: ['172A33', 'F3F1E9'],
      ocean: ['0F172A', 'F8FAFC'],
      crimson: ['FFF1F2', '881337'],
      amber: ['FFFBEB', '78350F'],
      lavender: ['F5F3FF', '4C1D95'],
      slate: ['F1F5F9', '334155'],
    };
    for (const data of content.slides) {
      const slide = pptx.addSlide();
      const colors =
        themeColors[data.theme] ??
        (data.theme === 'midnight' ? ['172A33', 'F3F1E9'] : ['FAF8F3', '2B342D']);
      const bgHex = data.background?.color
        ? data.background.color.replace('#', '').toUpperCase()
        : colors[0];
      slide.background = { color: bgHex };
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
    return contentSchema.parse({ type: 'word', doc: importWordXml(source) });
  }
  if (extension === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    if (workbook.worksheets.length > 20) throw new ApiError(400, '最多支持 20 个工作表');
    const sheets = workbook.worksheets.map((ws) => {
      if (ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLUMNS)
        throw new ApiError(400, '基础版每张工作表最多支持 500 行、52 列');
      const cells: Record<string, string> = {};
      const styles: Record<string, SheetCellStyle> = {};
      const comments: Record<string, SheetComment> = {};
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          const raw = cell.formula ? `=${cell.formula}` : cell.text;
          if (raw) cells[cell.address] = raw;
        }),
      );
      const columnWidths: Record<string, number> = {},
        rowHeights: Record<string, number> = {};
      ws.columns?.forEach((column, index) => {
        if (column.width)
          columnWidths[index] = Math.max(48, Math.min(600, Math.round(column.width * 7 + 5)));
      });
      ws.eachRow({ includeEmpty: true }, (row) => {
        row.eachCell({ includeEmpty: true }, (cell) => {
          const style = readCellStyle(cell);
          if (Object.keys(style).length) styles[cell.address] = style;
          const note = readCellNote(cell);
          if (note && Object.keys(comments).length < MAX_SHEET_COMMENTS)
            comments[cell.address] = { text: note };
        });
        if (row.height)
          rowHeights[row.number] = Math.max(24, Math.min(300, Math.round(row.height / 0.75)));
      });
      const validations = readValidations(ws);
      const autoFilter = readAutoFilterRange(ws.autoFilter);
      const frozen = ws.views?.find((view) => view.state === 'frozen');
      return {
        id: randomUUID(),
        name: ws.name,
        ...(frozen?.state === 'frozen'
          ? {
              frozenRows: Math.max(0, Math.min(MAX_ROWS - 1, Math.floor(frozen.ySplit ?? 0))),
              frozenColumns: Math.max(0, Math.min(MAX_COLUMNS - 1, Math.floor(frozen.xSplit ?? 0))),
            }
          : {}),
        cells,
        ...(Object.keys(styles).length ? { styles } : {}),
        ...(Object.keys(comments).length ? { comments } : {}),
        ...(validations.length ? { validations } : {}),
        ...(autoFilter ? { autoFilter: { range: autoFilter, columns: {} } } : {}),
        ...(Object.keys(columnWidths).length ? { columnWidths } : {}),
        ...(Object.keys(rowHeights).length ? { rowHeights } : {}),
      };
    });
    return contentSchema.parse({ type: 'sheet', sheets });
  }
  return contentSchema.parse(await importPresentation(zip));
}
