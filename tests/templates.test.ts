import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import JSZip from 'jszip';

interface TemplateExpectation {
  file: string;
  keyInFormulaCount: number;
  keyInFormulaHash: string;
}

const templates: TemplateExpectation[] = [
  {
    file: 'public/templates/challenge-scoring-template.xlsx',
    keyInFormulaCount: 382,
    keyInFormulaHash: 'ef45417be63774b0d21181fa62165e84eafa3b950954d192f83763c631f14c83'
  },
  {
    file: 'public/templates/individual-stage-scoring-template.xlsx',
    keyInFormulaCount: 382,
    keyInFormulaHash: 'ef45417be63774b0d21181fa62165e84eafa3b950954d192f83763c631f14c83'
  },
  {
    file: 'public/templates/duo-team-stage-scoring-template.xlsx',
    keyInFormulaCount: 380,
    keyInFormulaHash: '2e7df19f7a738beace06ea38351e2fbe372fb12396b2acf9be37404f38b0fbf3'
  }
];

function extractFormulaTags(xml: string): string[] {
  const formulas: string[] = [];
  let position = 0;
  while (position < xml.length) {
    const match = /<f(?=[\s>])/.exec(xml.slice(position));
    if (!match) break;
    const start = position + match.index;
    const openEnd = xml.indexOf('>', start);
    assert.notEqual(openEnd, -1);
    const end = xml[openEnd - 1] === '/'
      ? openEnd + 1
      : xml.indexOf('</f>', openEnd) + 4;
    assert.ok(end > openEnd);
    formulas.push(xml.slice(start, end));
    position = end;
  }
  return formulas;
}

const formulaHash = (formulas: string[]): string =>
  createHash('sha256').update(formulas.join('\n')).digest('hex');

for (const expected of templates) {
  test(`${expected.file} preserves the approved client formula graph`, async () => {
    const zip = await JSZip.loadAsync(await readFile(expected.file));
    const workbook = await zip.file('xl/workbook.xml')?.async('text');
    const keyIn = await zip.file('xl/worksheets/sheet1.xml')?.async('text');
    const calculation = await zip.file('xl/worksheets/sheet2.xml')?.async('text');
    assert.ok(workbook?.includes('name="KeyIn"'));
    assert.ok(workbook?.includes('name="Calculation"'));
    assert.ok(keyIn);
    assert.ok(calculation);

    const keyInFormulas = extractFormulaTags(keyIn);
    const calculationFormulas = extractFormulaTags(calculation);
    assert.equal(keyInFormulas.length, expected.keyInFormulaCount);
    assert.equal(formulaHash(keyInFormulas), expected.keyInFormulaHash);
    assert.equal(calculationFormulas.length, 13_775);
    assert.equal(formulaHash(calculationFormulas), 'f355e2518610d0b3b488a8668152f23da3222891be44b122ef0e70bf80248afa');

    if (expected.file.includes('challenge')) {
      assert.match(keyIn, /<c\b[^>]*\br="B1"[^>]*t="inlineStr"[^>]*><is><t>挑战赛<\/t><\/is><\/c>/);
    }
    if (expected.file.includes('duo-team')) {
      assert.match(keyIn, /<c\b[^>]*\br="V5"[^>]*>.*?<v>0\.25<\/v>.*?<\/c>/);
    }
  });
}
