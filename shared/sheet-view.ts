// Coordinates are zero-based; a boundary is the count of frozen items.
export function shiftFrozenBoundary(
  boundary: number,
  start: number,
  count: number,
  operation: 'insert' | 'delete',
  maximum: number,
) {
  if (start >= boundary) return boundary;
  return operation === 'insert'
    ? Math.min(maximum, boundary + count)
    : Math.max(0, boundary - Math.min(count, boundary - start));
}

export function frozenOffsets(
  count: number,
  headingSize: number,
  sizeAt: (index: number) => number,
) {
  const offsets: number[] = [];
  let size = headingSize;
  for (let index = 0; index < count; index++) {
    offsets.push(size);
    size += sizeAt(index);
  }
  return { offsets, size };
}
