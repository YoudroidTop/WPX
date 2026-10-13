import { columnName, MAX_COLUMNS, MAX_ROWS } from './documents';

// A bounded parser, never JavaScript evaluation. References are local to one sheet.
export function createCalculator(cells: Record<string, string>) {
  const cache = new Map<string, number | string>();
  const visiting = new Set<string>();
  function cell(address: string): number | string {
    if (cache.has(address)) return cache.get(address)!;
    if (visiting.has(address) || visiting.size > 100) throw new Error('#CYCLE!');
    const raw = cells[address] ?? '';
    if (!raw.startsWith('=')) return raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    visiting.add(address);
    let result: number | string;
    try {
      result = parse(raw.slice(1));
    } catch (error) {
      result = error instanceof Error ? error.message : '#ERROR!';
    }
    visiting.delete(address);
    cache.set(address, result);
    return result;
  }
  function numeric(value: string | number): number {
    if (typeof value === 'string' && value.startsWith('#')) throw new Error(value);
    if (value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('#VALUE!');
    return n;
  }
  function parse(source: string): number {
    if (source.length > 2000) throw new Error('#LIMIT!');
    const tokens =
      source
        .toUpperCase()
        .match(/(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?|[A-Z]+[0-9]*|[+\-*/^():,]|\S/g) ?? [];
    let cursor = 0;
    const take = () => tokens[cursor++];
    const require = (token: string) => {
      if (take() !== token) throw new Error('#ERROR!');
    };
    function reference(ref: string) {
      const match = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
      if (!match) throw new Error('#REF!');
      const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const row = Number(match[2]);
      if (col >= MAX_COLUMNS || row > MAX_ROWS) throw new Error('#REF!');
      return { col, row };
    }
    function atom(): number {
      const token = take();
      if (token === '+') return atom();
      if (token === '-') return -atom();
      if (token === '(') {
        const n = expression();
        require(')');
        return n;
      }
      if (/^(?:\d|\.)/.test(token ?? '')) return numeric(token);
      if (/^[A-Z]+[1-9]\d*$/.test(token ?? '')) {
        reference(token);
        return numeric(cell(token));
      }
      if (['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'].includes(token)) {
        require('(');
        const values: number[] = [];
        if (tokens[cursor] !== ')')
          do {
            if (tokens[cursor + 1] === ':') {
              const from = reference(take());
              take();
              const to = reference(take());
              for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++)
                for (
                  let col = Math.min(from.col, to.col);
                  col <= Math.max(from.col, to.col);
                  col++
                ) {
                  const value = cell(`${columnName(col)}${row}`);
                  if (typeof value === 'string' && value.startsWith('#')) throw new Error(value);
                  if (typeof value === 'number') values.push(value);
                }
            } else values.push(expression());
            if (tokens[cursor] !== ',') break;
            take();
          } while (cursor < tokens.length);
        require(')');
        if (token === 'COUNT') return values.length;
        if (token === 'SUM') return values.reduce((a, b) => a + b, 0);
        if (token === 'AVERAGE') {
          if (!values.length) throw new Error('#DIV/0!');
          return values.reduce((a, b) => a + b, 0) / values.length;
        }
        return values.length ? (token === 'MIN' ? Math.min(...values) : Math.max(...values)) : 0;
      }
      throw new Error('#NAME?');
    }
    function power(): number {
      const n = atom();
      return tokens[cursor] === '^' ? (take(), n ** power()) : n;
    }
    function product(): number {
      let n = power();
      while (tokens[cursor] === '*' || tokens[cursor] === '/') {
        const op = take(),
          right = power();
        if (op === '/' && right === 0) throw new Error('#DIV/0!');
        n = op === '*' ? n * right : n / right;
      }
      return n;
    }
    function expression(): number {
      let n = product();
      while (tokens[cursor] === '+' || tokens[cursor] === '-') {
        const op = take(),
          right = product();
        n = op === '+' ? n + right : n - right;
      }
      return n;
    }
    const result = expression();
    if (cursor !== tokens.length) throw new Error('#ERROR!');
    if (!Number.isFinite(result)) throw new Error('#NUM!');
    return result;
  }
  return (address: string): string | number => {
    try {
      return cell(address);
    } catch {
      return '#CYCLE!';
    }
  };
}
