import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseExcel } from '../src/excel/excel-parser';
import { mapFields } from '../src/anonymization/field-mapper';
import { rawStore } from '../src/anonymization/raw-store';
import { anonymize } from '../src/anonymization/anonymizer';

describe('probe', () => {
  it('reviewStatus extraction', () => {
    const parsed = parseExcel(readFileSync('examples/珍珠生信息20260908135204995.xlsx') as unknown as ArrayBuffer);
    rawStore.setRecords(parsed.rows.map((values, i) => ({ sourceRow: parsed.rowNumbers[i], values })));
    const mapping = mapFields(parsed.headers);
    const out = anonymize(rawStore.snapshot(), mapping.mappedColumns, new Set());
    const statuses = new Set(out.students.map((s) => s.reviewStatus ?? '(空)'));
    console.log('statuses:', [...statuses].join(', '), '| n:', out.students.length);
    console.log('sample:', out.students[0].anonymousId, out.students[0].reviewStatus);
    expect(true).toBe(true);
  });
});
