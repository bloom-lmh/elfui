export const longestIncreasingSubsequence = (values: readonly number[]): number[] => {
  const predecessors = values.slice();
  const result: number[] = [];

  for (let index = 0; index < values.length; index++) {
    const value = values[index] as number;
    if (value === 0) continue;

    const lastResultIndex = result[result.length - 1];
    if (lastResultIndex === undefined || (values[lastResultIndex] as number) < value) {
      predecessors[index] = lastResultIndex ?? -1;
      result.push(index);
      continue;
    }

    let start = 0;
    let end = result.length - 1;
    while (start < end) {
      const middle = (start + end) >> 1;
      if ((values[result[middle] as number] as number) < value) start = middle + 1;
      else end = middle;
    }

    if (value < (values[result[start] as number] as number)) {
      predecessors[index] = start > 0 ? (result[start - 1] as number) : -1;
      result[start] = index;
    }
  }

  let cursor = result.length;
  let index = result[cursor - 1] as number | undefined;
  const sequence = new Array<number>(cursor);
  while (cursor-- > 0 && index !== undefined) {
    sequence[cursor] = index;
    index = predecessors[index] === -1 ? undefined : predecessors[index];
  }
  return sequence;
};
