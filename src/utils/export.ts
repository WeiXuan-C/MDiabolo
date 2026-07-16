import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { autoTable } from 'jspdf-autotable';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { Athlete, Competition, CompetitionRound, Judge, Language, ScoreSubmission, FaultSubmission } from '../initialData';
import { localizedName } from '../initialData';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: { finalY: number };
  }
}

interface RankingRow {
  athlete: Athlete;
  scoresByJudge?: Record<string, { score: number; rank: number }>;
  finalRank: number;
  pairwisePoints: number;
  wins: number;
  ties: number;
  losses: number;
  deduction: number;
  complete: boolean;
  completedJudges: number;
  requiredJudges: number;
  averageScore: number;
  judgeScores: { judgeName: string; score: number }[];
}

const PDF_FONT_NAME = 'helvetica';

async function installPdfFont(doc: jsPDF): Promise<void> {
  doc.setFont(PDF_FONT_NAME, 'normal');
}

export interface ExportedFile {
  fileName: string;
  url: string;
  mimeType: string;
  blob: Blob;
  nativeUri?: string;
}

function triggerWebDownload(file: ExportedFile): void {
  const link = document.createElement('a');
  link.href = file.url;
  link.download = file.fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read export file.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function shareNativeFile(file: ExportedFile): Promise<void> {
  const path = `exports/${file.fileName}`;
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Cache });
  } catch {
    // The first export normally has nothing to delete.
  }
  const writtenFile = await Filesystem.writeFile({
    path,
    data: await blobToBase64(file.blob),
    directory: Directory.Cache,
    recursive: true
  });
  file.nativeUri = writtenFile.uri;
  const canShare = await Share.canShare();
  if (canShare.value) {
    await Share.share({
      title: file.fileName,
      text: file.fileName,
      files: [writtenFile.uri],
      dialogTitle: file.fileName
    });
  }
}

export async function openExportedFile(file: ExportedFile): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (!file.nativeUri) {
      await shareNativeFile(file);
      return;
    }
    await Share.share({
      title: file.fileName,
      text: file.fileName,
      files: [file.nativeUri],
      dialogTitle: file.fileName
    });
    return;
  }
  if (file.mimeType === 'application/pdf') {
    const opened = window.open(file.url, '_blank', 'noopener');
    if (opened) return;
  }
  triggerWebDownload(file);
}

async function createDownload(fileName: string, blob: Blob): Promise<ExportedFile> {
  const url = URL.createObjectURL(blob);
  const file = { fileName, url, mimeType: blob.type, blob };
  if (Capacitor.isNativePlatform()) {
    await shareNativeFile(file);
  } else {
    triggerWebDownload(file);
  }
  return file;
}

function safeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function exportBaseFileName(competition: Competition, language: Language): string {
  return safeFileName(`${localizedName(competition, language)}_${new Date().toISOString().split('T')[0]}`);
}

function formatRoundDateTime(value: string | undefined, language: Language): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function rankLabel(rank: number | undefined, language: Language): string {
  if (!rank || rank < 1) return '-';
  return language === 'zh' ? `第${rank}名` : `Rank ${rank}`;
}

function buildRankMap(
  rankings: RankingRow[],
  compare: (a: RankingRow, b: RankingRow) => number
): Map<string, number> {
  const sorted = [...rankings].sort(compare);
  const result = new Map<string, number>();
  sorted.forEach((row, index) => result.set(row.athlete.id, index + 1));
  return result;
}

function officialScoreInputSheet(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  scoringJudges: Judge[],
  scores: ScoreSubmission[],
  language: Language
): XLSX.WorkSheet {
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const judgeLabels = language === 'zh'
    ? ['一', '二', '三', '四', '五', '六', '七']
    : ['1', '2', '3', '4', '5', '6', '7'];
  const pairwiseRanks = buildRankMap(rankings, (a, b) =>
    b.pairwisePoints - a.pairwisePoints ||
    b.wins - a.wins ||
    a.losses - b.losses ||
    a.finalRank - b.finalRank
  );
  const averageRanks = buildRankMap(rankings, (a, b) =>
    b.averageScore - a.averageScore ||
    a.finalRank - b.finalRank
  );
  const scoreRows = rankings.map((row, index) => {
    const athleteScores = scoringJudges.slice(0, 7).map(judge => {
      const score = scores.find(s => s.athleteId === row.athlete.id && s.judgeId === judge.id && s.roundId === round.id);
      return score ? Number(score.totalScore.toFixed(2)) : '';
    });
    while (athleteScores.length < 7) athleteScores.push('');
    return [
      row.athlete.order || index + 1,
      row.athlete.school || row.athlete.teamName || row.athlete.country || '',
      localizedName(row.athlete, language),
      ...athleteScores,
      row.complete ? rankLabel(row.finalRank, language) : '',
      '',
      '',
      pairwiseRanks.get(row.athlete.id) || '',
      averageRanks.get(row.athlete.id) || '',
      '',
      ''
    ];
  });
  const emptyRows = Array.from({ length: Math.max(0, 10 - rankings.length) }, (_, index) => [
    rankings.length + index + 1,
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
  ]);
  const rows = [
    ['', L('盃賽名稱：', 'Event:'), competition.name, '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', L('比賽項目：', 'Competition:'), localizedName(competition, language), '', '', '', '', '', '', '', '', '', '', L('請填入紅色框框內，\n其它部分請勿更動。', 'Fill editable cells only.\nDo not modify other areas.'), '', '', ''],
    ['', L('比賽組別：', 'Division:'), competition.division || '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', L('比賽時間：', 'Start time:'), formatRoundDateTime(round.startTime, language) || L('請填寫', 'Please fill'), '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', L('公告時間：', 'Announcement:'), formatRoundDateTime(round.announcementTime, language) || L('請填寫', 'Please fill'), '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [
      'no.',
      L('選手', 'Athlete'),
      '',
      L('裁判評分', 'Judge scores'),
      '', '', '', '', '', '',
      L('手動輸入最終名次', 'Manual final rank'),
      '', '',
      L('第一輪', 'Round 1'),
      L('第二輪', 'Round 2'),
      L('裁判', 'Judges'),
      ''
    ],
    [
      '',
      L('學校/團隊', 'School / team'),
      L('姓名', 'Name'),
      '', '', '', '', '', '', '',
      '',
      '', '',
      L('席次法名次', 'Pairwise rank'),
      L('總平均分名次', 'Average rank'),
      '',
      ''
    ],
    ['', 'Team', 'name', ...judgeLabels, '', '', '', '', '', '', '', ''],
    ...scoreRows,
    ...emptyRows
  ];
  const judgeStartRow = 10;
  scoringJudges.slice(0, 7).forEach((judge, index) => {
    const rowIndex = judgeStartRow + index;
    while (rows.length <= rowIndex) rows.push(Array.from({ length: 17 }, () => ''));
    rows[rowIndex][15] = `${L('裁判', 'Judge')}${judgeLabels[index]}:`;
    rows[rowIndex][16] = localizedName(judge, language);
  });
  const recorderRow = judgeStartRow + Math.max(scoringJudges.length, 7) + 1;
  while (rows.length <= recorderRow + 1) rows.push(Array.from({ length: 17 }, () => ''));
  rows[recorderRow][15] = L('記錄員:', 'Recorder:');
  rows[recorderRow][16] = competition.recorder || '';
  rows[recorderRow + 1][15] = L('裁判長:', 'Chief judge:');
  rows[recorderRow + 1][16] = competition.chiefJudge || '';

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = [
    XLSX.utils.decode_range('C1:G1'),
    XLSX.utils.decode_range('C2:G2'),
    XLSX.utils.decode_range('C3:G3'),
    XLSX.utils.decode_range('C4:G4'),
    XLSX.utils.decode_range('C5:G5'),
    XLSX.utils.decode_range('N2:Q4'),
    XLSX.utils.decode_range('A7:A9'),
    XLSX.utils.decode_range('B7:C7'),
    XLSX.utils.decode_range('D7:J7'),
    XLSX.utils.decode_range('K7:M9'),
    XLSX.utils.decode_range('N7:N8'),
    XLSX.utils.decode_range('O7:O8'),
    XLSX.utils.decode_range('P7:Q8')
  ];
  sheet['!cols'] = [
    { wch: 5 },
    { wch: 18 },
    { wch: 18 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 16 },
    { wch: 3 },
    { wch: 3 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 }
  ];
  sheet['!rows'] = [
    { hpt: 20 },
    { hpt: 34 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 20 },
    { hpt: 8 },
    { hpt: 22 },
    { hpt: 22 },
    { hpt: 22 }
  ];
  return sheet;
}

const OFFICIAL_PLACE_METHOD_TEMPLATE = `${import.meta.env.BASE_URL}templates/place-method-five-person-template.xlsx`;
const XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XLSX_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_SPACE_NS = 'http://www.w3.org/XML/1998/namespace';
const MAX_OFFICIAL_TEMPLATE_ROWS = 80;
const TEMPLATE_INTERNAL_SHEET_NAMES = ['注意事項', '席次法運算(勿動)'];
const SCORE_INPUT_SHEET_NAME = '(1) 成績輸入';
const PRINT_SUMMARY_SHEET_NAME = '(2) 印出成績總表 ';
const JUDGE_SCORE_SHEET_NAME = '(3) 裁判評分表';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const JUDGE_SCORE_COLUMNS = ['D', 'E', 'F', 'G', 'H', 'I', 'J'];
const PRINT_RANK_COLUMNS = ['D', 'E', 'F', 'G', 'H', 'I', 'J'];
const PRINT_SCORE_COLUMNS = ['M', 'N', 'O', 'P', 'Q', 'R', 'S'];
const PRINT_CLEAR_COLUMNS = ['B', 'C', ...PRINT_RANK_COLUMNS, 'K', 'L', ...PRINT_SCORE_COLUMNS, 'T', 'W'];
const JUDGE_SCORE_TABLE_ROWS = [
  ...Array.from({ length: 15 }, (_, index) => 7 + index),
  ...Array.from({ length: 15 }, (_, index) => 25 + index),
  ...Array.from({ length: 15 }, (_, index) => 43 + index),
  ...Array.from({ length: 15 }, (_, index) => 61 + index),
  ...Array.from({ length: 20 }, (_, index) => 78 + index)
];
const JUDGE_LABELS_ZH = ['一', '二', '三', '四', '五', '六', '七'];

function parseXml(text: string): XMLDocument {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function serializeXml(doc: XMLDocument): string {
  return new XMLSerializer().serializeToString(doc);
}

function columnToIndex(column: string): number {
  return column.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function splitCellAddress(address: string): { column: string; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) throw new Error(`Invalid cell address: ${address}`);
  return { column: match[1], row: Number(match[2]) };
}

function getDirectChildren(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter(child => child.localName === tagName);
}

function ensureRow(doc: XMLDocument, sheetData: Element, rowNumber: number): Element {
  const existing = getDirectChildren(sheetData, 'row').find(row => Number(row.getAttribute('r')) === rowNumber);
  if (existing) return existing;
  const row = doc.createElementNS(XLSX_NS, 'row');
  row.setAttribute('r', String(rowNumber));
  const rows = getDirectChildren(sheetData, 'row');
  const next = rows.find(item => Number(item.getAttribute('r')) > rowNumber);
  sheetData.insertBefore(row, next ?? null);
  return row;
}

function ensureCell(doc: XMLDocument, sheetData: Element, address: string): Element {
  const { column, row: rowNumber } = splitCellAddress(address);
  const row = ensureRow(doc, sheetData, rowNumber);
  const existing = getDirectChildren(row, 'c').find(cell => cell.getAttribute('r') === address);
  if (existing) return existing;

  const cell = doc.createElementNS(XLSX_NS, 'c');
  cell.setAttribute('r', address);
  const targetColumn = columnToIndex(column);
  const next = getDirectChildren(row, 'c').find(item => {
    const ref = item.getAttribute('r');
    return ref ? columnToIndex(splitCellAddress(ref).column) > targetColumn : false;
  });
  row.insertBefore(cell, next ?? null);
  return cell;
}

function clearCell(cell: Element): void {
  cell.removeAttribute('t');
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const localName = (child as Element).localName;
      if (localName === 'v' || localName === 'is') cell.removeChild(child);
    }
  }
}

function setBlankCell(cell: Element): void {
  clearCell(cell);
  cell.removeAttribute('t');
}

function setCellValue(doc: XMLDocument, sheetData: Element, address: string, value: string | number | null | undefined): void {
  const cell = ensureCell(doc, sheetData, address);
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const localName = (child as Element).localName;
      if (localName === 'v' || localName === 'is' || localName === 'f') cell.removeChild(child);
    }
  }

  if (value === null || value === undefined || value === '') {
    setBlankCell(cell);
    return;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    cell.removeAttribute('t');
    const v = doc.createElementNS(XLSX_NS, 'v');
    v.textContent = String(value);
    cell.appendChild(v);
    return;
  }

  cell.setAttribute('t', 'inlineStr');
  const inline = doc.createElementNS(XLSX_NS, 'is');
  const text = doc.createElementNS(XLSX_NS, 't');
  text.setAttributeNS(XML_SPACE_NS, 'xml:space', 'preserve');
  text.textContent = String(value);
  inline.appendChild(text);
  cell.appendChild(inline);
}

function fillStyledBlankCells(doc: XMLDocument): void {
  for (const cell of Array.from(doc.getElementsByTagNameNS(XLSX_NS, 'c'))) {
    const hasFormula = getDirectChildren(cell, 'f').length > 0;
    const hasValue = getDirectChildren(cell, 'v').length > 0;
    const hasInlineString = getDirectChildren(cell, 'is').length > 0;
    if (!hasFormula && !hasValue && !hasInlineString) {
      setBlankCell(cell);
    }
  }
}

function excelTimeValue(value: string | undefined): number | string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const simpleTime = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (simpleTime) {
    const hours = Number(simpleTime[1]);
    const minutes = Number(simpleTime[2]);
    const seconds = Number(simpleTime[3] ?? 0);
    if (hours < 24 && minutes < 60 && seconds < 60) return (hours * 3600 + minutes * 60 + seconds) / 86400;
  }
  const date = new Date(trimmed);
  if (!Number.isNaN(date.getTime())) {
    return (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) / 86400;
  }
  return trimmed;
}

function chineseOrdinal(value: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (value <= 10) return value === 10 ? '十' : digits[value];
  if (value < 20) return `十${digits[value - 10]}`;
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${digits[tens]}十${digits[ones]}`;
}

function officialRankLabel(rank: number | undefined, complete: boolean): string {
  if (!complete || !rank || rank < 1) return '';
  return `第${chineseOrdinal(rank)}名`;
}

async function findWorksheetPath(zip: JSZip, sheetName: string): Promise<string> {
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('Excel template is missing workbook metadata.');

  const workbook = parseXml(await workbookFile.async('text'));
  const rels = parseXml(await relsFile.async('text'));
  const sheet = Array.from(workbook.getElementsByTagNameNS(XLSX_NS, 'sheet'))
    .find(item => item.getAttribute('name') === sheetName);
  const relationshipId = sheet?.getAttributeNS(XLSX_REL_NS, 'id') || sheet?.getAttribute('r:id');
  if (!relationshipId) throw new Error(`Excel template is missing sheet: ${sheetName}`);

  const relationship = Array.from(rels.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship'))
    .find(item => item.getAttribute('Id') === relationshipId);
  const target = relationship?.getAttribute('Target');
  if (!target) throw new Error(`Excel template cannot resolve sheet: ${sheetName}`);
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

function normalizeWorkbookRelationshipTarget(target: string | null): string {
  if (!target) return '';
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

async function removeWorksheets(zip: JSZip, sheetNames: string[]): Promise<void> {
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('Excel template is missing workbook metadata.');

  const workbook = parseXml(await workbookFile.async('text'));
  const rels = parseXml(await relsFile.async('text'));
  const targetsToRemove = new Set<string>();
  const relationshipIdsToRemove = new Set<string>();

  for (const sheet of Array.from(workbook.getElementsByTagNameNS(XLSX_NS, 'sheet'))) {
    if (!sheetNames.includes(sheet.getAttribute('name') ?? '')) continue;
    const relationshipId = sheet.getAttributeNS(XLSX_REL_NS, 'id') || sheet.getAttribute('r:id');
    if (relationshipId) relationshipIdsToRemove.add(relationshipId);
    sheet.parentNode?.removeChild(sheet);
  }

  for (const relationship of Array.from(rels.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship'))) {
    if (!relationshipIdsToRemove.has(relationship.getAttribute('Id') ?? '')) continue;
    const targetPath = normalizeWorkbookRelationshipTarget(relationship.getAttribute('Target'));
    if (targetPath) targetsToRemove.add(targetPath);
    relationship.parentNode?.removeChild(relationship);
  }

  const bookViews = Array.from(workbook.getElementsByTagNameNS(XLSX_NS, 'workbookView'));
  for (const view of bookViews) {
    view.removeAttribute('activeTab');
    view.removeAttribute('firstSheet');
  }

  zip.file('xl/workbook.xml', serializeXml(workbook));
  zip.file('xl/_rels/workbook.xml.rels', serializeXml(rels));

  for (const target of targetsToRemove) {
    zip.remove(target);
    zip.remove(target.replace('xl/worksheets/', 'xl/worksheets/_rels/') + '.rels');
  }

  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const contentTypes = parseXml(await contentTypesFile.async('text'));
    for (const override of Array.from(contentTypes.getElementsByTagName('Override'))) {
      const partName = override.getAttribute('PartName')?.replace(/^\//, '');
      if (partName && targetsToRemove.has(partName)) override.parentNode?.removeChild(override);
    }
    zip.file('[Content_Types].xml', serializeXml(contentTypes));
  }
}

function removeCachedFormulaValues(doc: XMLDocument): void {
  for (const cell of Array.from(doc.getElementsByTagNameNS(XLSX_NS, 'c'))) {
    if (!getDirectChildren(cell, 'f').length) continue;
    for (const value of getDirectChildren(cell, 'v')) cell.removeChild(value);
  }
}

async function markWorkbookForRecalculation(zip: JSZip): Promise<void> {
  const workbookFile = zip.file('xl/workbook.xml');
  if (workbookFile) {
    const workbook = parseXml(await workbookFile.async('text'));
    const root = workbook.documentElement;
    let calcPr = Array.from(root.children).find(child => child.localName === 'calcPr');
    if (!calcPr) {
      calcPr = workbook.createElementNS(XLSX_NS, 'calcPr');
      root.appendChild(calcPr);
    }
    calcPr.setAttribute('calcMode', 'auto');
    calcPr.setAttribute('fullCalcOnLoad', '1');
    calcPr.setAttribute('forceFullCalc', '1');
    zip.file('xl/workbook.xml', serializeXml(workbook));
  }

  zip.remove('xl/calcChain.xml');
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    const contentTypes = parseXml(await contentTypesFile.async('text'));
    for (const override of Array.from(contentTypes.getElementsByTagName('Override'))) {
      if (override.getAttribute('PartName') === '/xl/calcChain.xml') override.parentNode?.removeChild(override);
    }
    zip.file('[Content_Types].xml', serializeXml(contentTypes));
  }
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (relsFile) {
    const rels = parseXml(await relsFile.async('text'));
    for (const relationship of Array.from(rels.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship'))) {
      if (relationship.getAttribute('Type')?.endsWith('/calcChain')) relationship.parentNode?.removeChild(relationship);
    }
    zip.file('xl/_rels/workbook.xml.rels', serializeXml(rels));
  }
}

async function clearAllFormulaCaches(zip: JSZip): Promise<void> {
  const worksheetPaths = Object.keys(zip.files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path));
  await Promise.all(worksheetPaths.map(async path => {
    const file = zip.file(path);
    if (!file) return;
    const doc = parseXml(await file.async('text'));
    removeCachedFormulaValues(doc);
    zip.file(path, serializeXml(doc));
  }));
}

async function normalizeStyledBlankCells(zip: JSZip): Promise<void> {
  const worksheetPaths = Object.keys(zip.files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/.test(path));
  await Promise.all(worksheetPaths.map(async path => {
    const file = zip.file(path);
    if (!file) return;
    const doc = parseXml(await file.async('text'));
    fillStyledBlankCells(doc);
    zip.file(path, serializeXml(doc));
  }));
}

async function updateOfficialPrintSummarySheet(
  zip: JSZip,
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  scoringJudges: Judge[],
  scores: ScoreSubmission[],
  language: Language
): Promise<void> {
  const printSheetPath = await findWorksheetPath(zip, PRINT_SUMMARY_SHEET_NAME);
  const printSheetFile = zip.file(printSheetPath);
  if (!printSheetFile) throw new Error('席次法 Excel 模板缺少印出成績總表工作表。');

  const printSheet = parseXml(await printSheetFile.async('text'));
  const printSheetData = printSheet.getElementsByTagNameNS(XLSX_NS, 'sheetData')[0];
  if (!printSheetData) throw new Error('席次法 Excel 模板的印出成績總表格式不完整。');

  const scoreIndex = new Map(
    scores
      .filter(score => score.competitionId === competition.id && score.roundId === round.id)
      .map(score => [`${score.athleteId}:${score.judgeId}`, score.totalScore])
  );

  setCellValue(printSheet, printSheetData, 'B1', competition.name);
  setCellValue(printSheet, printSheetData, 'C4', localizedName(competition, language));
  setCellValue(printSheet, printSheetData, 'E4', excelTimeValue(round.startTime));
  setCellValue(printSheet, printSheetData, 'C5', competition.division || competition.region || '');
  setCellValue(printSheet, printSheetData, 'W3', excelTimeValue(round.announcementTime));
  setCellValue(printSheet, printSheetData, 'U2', competition.recorder || '');

  for (let index = 0; index < JUDGE_LABELS_ZH.length; index++) {
    setCellValue(printSheet, printSheetData, `P${2 + index}`, scoringJudges[index] ? localizedName(scoringJudges[index], language) : '');
  }

  for (let index = 0; index < MAX_OFFICIAL_TEMPLATE_ROWS; index++) {
    const rowNumber = 14 + index;
    for (const column of PRINT_CLEAR_COLUMNS) {
      setCellValue(printSheet, printSheetData, `${column}${rowNumber}`, '');
    }
  }

  rankings.slice(0, MAX_OFFICIAL_TEMPLATE_ROWS).forEach((row, index) => {
    const rowNumber = 14 + index;
    setCellValue(printSheet, printSheetData, `B${rowNumber}`, row.athlete.school || row.athlete.teamName || row.athlete.country || '');
    setCellValue(printSheet, printSheetData, `C${rowNumber}`, localizedName(row.athlete, language));
    setCellValue(printSheet, printSheetData, `K${rowNumber}`, row.complete ? row.pairwisePoints : '');
    setCellValue(printSheet, printSheetData, `L${rowNumber}`, row.complete ? row.finalRank : '');
    setCellValue(printSheet, printSheetData, `T${rowNumber}`, row.completedJudges ? Number(row.averageScore.toFixed(2)) : '');
    setCellValue(printSheet, printSheetData, `W${rowNumber}`, officialRankLabel(row.finalRank, row.complete));

    scoringJudges.forEach((judge, judgeIndex) => {
      const score = row.scoresByJudge?.[judge.id]?.score ?? scoreIndex.get(`${row.athlete.id}:${judge.id}`);
      const rank = row.scoresByJudge?.[judge.id]?.rank;
      setCellValue(printSheet, printSheetData, `${PRINT_RANK_COLUMNS[judgeIndex]}${rowNumber}`, rank ?? '');
      setCellValue(printSheet, printSheetData, `${PRINT_SCORE_COLUMNS[judgeIndex]}${rowNumber}`, score === undefined ? '' : Number(score.toFixed(2)));
    });
  });

  zip.file(printSheetPath, serializeXml(printSheet));
}

async function updateOfficialJudgeScoreSheet(
  zip: JSZip,
  competition: Competition,
  rankings: RankingRow[],
  language: Language
): Promise<void> {
  const judgeScoreSheetPath = await findWorksheetPath(zip, JUDGE_SCORE_SHEET_NAME);
  const judgeScoreSheetFile = zip.file(judgeScoreSheetPath);
  if (!judgeScoreSheetFile) throw new Error('席次法 Excel 模板缺少裁判評分表工作表。');

  const judgeScoreSheet = parseXml(await judgeScoreSheetFile.async('text'));
  const judgeScoreSheetData = judgeScoreSheet.getElementsByTagNameNS(XLSX_NS, 'sheetData')[0];
  if (!judgeScoreSheetData) throw new Error('席次法 Excel 模板的裁判評分表格式不完整。');

  setCellValue(judgeScoreSheet, judgeScoreSheetData, 'B1', competition.name);
  setCellValue(judgeScoreSheet, judgeScoreSheetData, 'C3', localizedName(competition, language));
  setCellValue(judgeScoreSheet, judgeScoreSheetData, 'H3', competition.division || competition.region || '');

  for (const pageDivisionCell of ['B23', 'B41', 'B59', 'B77']) {
    setCellValue(judgeScoreSheet, judgeScoreSheetData, pageDivisionCell, competition.division || competition.region || '');
  }

  JUDGE_SCORE_TABLE_ROWS.forEach((rowNumber, index) => {
    const row = rankings[index];
    setCellValue(judgeScoreSheet, judgeScoreSheetData, `B${rowNumber}`, row ? row.athlete.school || row.athlete.teamName || row.athlete.country || '' : '');
    setCellValue(judgeScoreSheet, judgeScoreSheetData, `C${rowNumber}`, row ? localizedName(row.athlete, language) : '');
    setCellValue(judgeScoreSheet, judgeScoreSheetData, `D${rowNumber}`, '');
    setCellValue(judgeScoreSheet, judgeScoreSheetData, `F${rowNumber}`, '');
    setCellValue(judgeScoreSheet, judgeScoreSheetData, `K${rowNumber}`, '');
  });

  zip.file(judgeScoreSheetPath, serializeXml(judgeScoreSheet));
}

async function exportRankingToOfficialTemplate(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  language: Language
): Promise<ExportedFile> {
  const response = await fetch(OFFICIAL_PLACE_METHOD_TEMPLATE);
  if (!response.ok) throw new Error('找不到席次法 Excel 模板，无法导出。');

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  await clearAllFormulaCaches(zip);
  const inputSheetPath = await findWorksheetPath(zip, SCORE_INPUT_SHEET_NAME);
  const sheetFile = zip.file(inputSheetPath);
  if (!sheetFile) throw new Error('席次法 Excel 模板缺少成績輸入工作表。');

  const sheet = parseXml(await sheetFile.async('text'));
  const sheetData = sheet.getElementsByTagNameNS(XLSX_NS, 'sheetData')[0];
  if (!sheetData) throw new Error('席次法 Excel 模板格式不完整。');

  const scoringJudges = judges.filter(judge => judge.role === 'Scoring').slice(0, JUDGE_SCORE_COLUMNS.length);
  const scoreIndex = new Map(
    scores
      .filter(score => score.competitionId === competition.id && score.roundId === round.id)
      .map(score => [`${score.athleteId}:${score.judgeId}`, score.totalScore])
  );
  const pairwiseRanks = buildRankMap(rankings, (a, b) =>
    b.pairwisePoints - a.pairwisePoints ||
    b.wins - a.wins ||
    a.losses - b.losses ||
    a.finalRank - b.finalRank
  );
  const averageRanks = buildRankMap(rankings, (a, b) =>
    b.averageScore - a.averageScore ||
    a.finalRank - b.finalRank
  );

  setCellValue(sheet, sheetData, 'C1', competition.name);
  setCellValue(sheet, sheetData, 'C2', localizedName(competition, language));
  setCellValue(sheet, sheetData, 'C3', competition.division || competition.region || '');
  setCellValue(sheet, sheetData, 'C4', excelTimeValue(round.startTime));
  setCellValue(sheet, sheetData, 'C5', excelTimeValue(round.announcementTime));

  for (let index = 0; index < JUDGE_LABELS_ZH.length; index++) {
    setCellValue(sheet, sheetData, `S${7 + index}`, `裁判${JUDGE_LABELS_ZH[index]}：`);
    setCellValue(sheet, sheetData, `T${7 + index}`, scoringJudges[index] ? localizedName(scoringJudges[index], language) : '');
  }
  setCellValue(sheet, sheetData, 'S14', '記錄員：');
  setCellValue(sheet, sheetData, 'T14', competition.recorder || '');

  for (let index = 0; index < MAX_OFFICIAL_TEMPLATE_ROWS; index++) {
    const rowNumber = 10 + index;
    setCellValue(sheet, sheetData, `B${rowNumber}`, '');
    setCellValue(sheet, sheetData, `C${rowNumber}`, '');
    for (const column of JUDGE_SCORE_COLUMNS) setCellValue(sheet, sheetData, `${column}${rowNumber}`, '');
    setCellValue(sheet, sheetData, `K${rowNumber}`, '');
    setCellValue(sheet, sheetData, `N${rowNumber}`, '');
    setCellValue(sheet, sheetData, `O${rowNumber}`, '');
  }

  rankings.slice(0, MAX_OFFICIAL_TEMPLATE_ROWS).forEach((row, index) => {
    const rowNumber = 10 + index;
    setCellValue(sheet, sheetData, `B${rowNumber}`, row.athlete.school || row.athlete.teamName || row.athlete.country || '');
    setCellValue(sheet, sheetData, `C${rowNumber}`, localizedName(row.athlete, language));
    scoringJudges.forEach((judge, judgeIndex) => {
      const score = row.scoresByJudge?.[judge.id]?.score ?? scoreIndex.get(`${row.athlete.id}:${judge.id}`);
      setCellValue(sheet, sheetData, `${JUDGE_SCORE_COLUMNS[judgeIndex]}${rowNumber}`, score === undefined ? '' : Number(score.toFixed(2)));
    });
    setCellValue(sheet, sheetData, `K${rowNumber}`, officialRankLabel(row.finalRank, row.complete));
    setCellValue(sheet, sheetData, `N${rowNumber}`, row.complete ? pairwiseRanks.get(row.athlete.id) : '');
    setCellValue(sheet, sheetData, `O${rowNumber}`, row.complete ? averageRanks.get(row.athlete.id) : '');
  });

  zip.file(inputSheetPath, serializeXml(sheet));
  await updateOfficialPrintSummarySheet(zip, competition, round, rankings, scoringJudges, scores, language);
  await updateOfficialJudgeScoreSheet(zip, competition, rankings, language);
  await markWorkbookForRecalculation(zip);
  await normalizeStyledBlankCells(zip);
  await removeWorksheets(zip, TEMPLATE_INTERNAL_SHEET_NAMES);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME });
  const fileName = `${exportBaseFileName(competition, language)}_席次法官方表.xlsx`;
  return createDownload(fileName, blob);
}

export async function exportRankingToExcel(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  faults: FaultSubmission[],
  language: Language
): Promise<ExportedFile> {
  void faults;
  return exportRankingToOfficialTemplate(competition, round, rankings, judges, scores, language);
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const workbook = XLSX.utils.book_new();
  const scoringJudges = judges.filter(j => j.role === 'Scoring');
  void faults;

  const scoreInputSheet = officialScoreInputSheet(competition, round, rankings, scoringJudges, scores, language);
  XLSX.utils.book_append_sheet(workbook, scoreInputSheet, L('成績輸入', 'Score Input'));

  // Sheet 1: 排名总表 (Summary Rankings) - 按照你的示例格式
  const summaryData = [
    // Header section with competition info
    [L('盃賽名稱:', 'Event Name:'), competition.name, '', '', '', '', L('請填入紅色框框內，', 'Please fill in red boxes,')],
    [L('比賽項目:', 'Competition:'), localizedName(competition, language), '', '', '', '', L('其它部分請勿更動。', 'Do not modify other parts.')],
    [L('比賽組別:', 'Division:'), competition.division],
    [L('比賽時間:', 'Start Time:'), formatRoundDateTime(round.startTime, language) || L('請填寫', 'Please fill')],
    [L('公告時間:', 'Announcement Time:'), formatRoundDateTime(round.announcementTime, language) || L('請填寫', 'Please fill')],
    [],
    // Athletes and scores table header
    [
      '',
      L('選手', 'Athlete'),
      '',
      L('裁判評分', 'Judge Scores'),
      '',
      '',
      '',
      L('手動輸入最', 'Manual Input'),
      L('第一輪', 'Round 1'),
      L('第二輪', 'Round 2'),
      '',
      L('裁判一:', `Judge 1:`),
      L('排序', 'Rank Order')
    ],
    [
      'no.',
      L('學校/團隊', 'Team'),
      L('姓名', 'Name'),
      L('一', '1'),
      L('二', '2'),
      L('三', '3'),
      L('四', '4'),
      L('五', '5'),
      L('終各名次', 'Final Rank'),
      L('席次法各名次', 'Pairwise Rank'),
      L('席次均分各名', 'Avg Rank'),
      '',
      L('裁判二:', `Judge 2:`),
      L('裁判三:', `Judge 3:`)
    ],
    // Athletes data rows
    ...rankings.map((row, index) => {
      const athleteScores = scoringJudges.map(judge => {
        const score = scores.find(s => s.athleteId === row.athlete.id && s.judgeId === judge.id && s.roundId === round.id);
        return score ? score.totalScore.toFixed(2) : '-';
      });
      
      // Pad scores array to 5 judges
      while (athleteScores.length < 5) {
        athleteScores.push('-');
      }

      return [
        index + 1,
        row.athlete.school || row.athlete.teamName || '-',
        localizedName(row.athlete, language),
        ...athleteScores.slice(0, 5),
        row.complete ? `${L('第', '')}${row.finalRank}${L('名', '')}` : '-',
        index + 1, // 第一轮排名
        index + 1, // 第二轮排名
        '',
        scoringJudges[0] ? localizedName(scoringJudges[0], language) : '',
        scoringJudges[1] ? localizedName(scoringJudges[1], language) : ''
      ];
    }),
    // Additional empty rows for manual entry
    ...Array.from({ length: Math.max(0, 10 - rankings.length) }, (_, i) => [
      rankings.length + i + 1,
      '', '', '', '', '', '', '', '', '', '', '', '', ''
    ])
  ];

  // Add judge names in the right column
  for (let i = 0; i < Math.min(scoringJudges.length, 7); i++) {
    const rowIndex = 7 + i;
    if (summaryData[rowIndex]) {
      summaryData[rowIndex][11] = `${L('裁判', 'Judge')}${['一', '二', '三', '四', '五', '六', '七'][i]}:`;
      summaryData[rowIndex][12] = localizedName(scoringJudges[i], language);
    }
  }
  
  // Add recorder at the bottom
  const recorderRowIndex = 7 + Math.max(scoringJudges.length, 7);
  if (summaryData[recorderRowIndex]) {
    summaryData[recorderRowIndex][11] = L('記錄員:', 'Recorder:');
    summaryData[recorderRowIndex][12] = competition.recorder || L('單卡鍋', 'Please fill');
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Set column widths
  summarySheet['!cols'] = [
    { wch: 5 },  // no.
    { wch: 18 }, // Team
    { wch: 12 }, // Name
    { wch: 8 },  // Judge 1
    { wch: 8 },  // Judge 2
    { wch: 8 },  // Judge 3
    { wch: 8 },  // Judge 4
    { wch: 8 },  // Judge 5
    { wch: 10 }, // Final Rank
    { wch: 10 }, // Round 1
    { wch: 10 }, // Round 2
    { wch: 12 }, // Label column
    { wch: 12 }  // Value column
  ];
  
  void summarySheet;

  // Sheet 2: 席次法详细 (Place Method Details) - 按照你的第二个示例
  const placeMethodData = [
    [],
    ['', '', competition.name],
    [],
    ['', L('比賽項目', 'Competition'), localizedName(competition, language), '', formatRoundDateTime(round.startTime, language) || ''],
    ['', L('比賽組別', 'Division'), competition.division],
    [],
    [],
    [],
    [],
    [],
    [
      'no.',
      L('學校名稱', 'Team'),
      L('姓名', 'Name'),
      '',
      `${L('裁判名次(第一輪)', 'Judge Rank (Round 1)')}`,
      '',
      '',
      '',
      '',
      L('席次法', 'Pairwise'),
      '',
      `${L('裁判評分(第二輪)', 'Judge Score (Round 2)')}`,
      '',
      '',
      '',
      '',
      L('總平均', 'Average'),
      L('最終名次', 'Final Rank')
    ],
    [
      '',
      '',
      '',
      L('一', '1'),
      L('二', '2'),
      L('三', '3'),
      L('四', '4'),
      L('五', '5'),
      L('積分', 'Points'),
      L('排序', 'Order'),
      L('一', '1'),
      L('二', '2'),
      L('三', '3'),
      L('四', '4'),
      L('五', '5'),
      L('均分', 'Avg')
    ],
    ...rankings.map((row, index) => {
      const athleteScores = scoringJudges.map(judge => {
        const score = scores.find(s => s.athleteId === row.athlete.id && s.judgeId === judge.id && s.roundId === round.id);
        return score ? score.totalScore.toFixed(2) : '-';
      });
      
      // Calculate individual judge ranks (simplified - showing rank position)
      const judgeRanks = scoringJudges.map(() => (index + 1).toString());
      
      // Pad arrays to 5 judges
      while (athleteScores.length < 5) athleteScores.push('-');
      while (judgeRanks.length < 5) judgeRanks.push('-');

      return [
        index + 1,
        row.athlete.school || row.athlete.teamName || '-',
        localizedName(row.athlete, language),
        ...judgeRanks.slice(0, 5),
        row.pairwisePoints.toFixed(1),
        `${row.wins}/${row.ties}/${row.losses}`,
        ...athleteScores.slice(0, 5),
        row.averageScore.toFixed(2),
        row.complete ? `${L('第', '')}${row.finalRank}${L('名', '')}` : '-'
      ];
    }),
    // Additional empty rows
    ...Array.from({ length: Math.max(0, 10 - rankings.length) }, (_, i) => [
      rankings.length + i + 1,
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
    ])
  ];

  // Add judges info in top right corner
  placeMethodData[0] = ['', '', '', '', '', '', '', '', '', '', '', '', L('裁判一：', 'Judge 1:'), scoringJudges[0] ? localizedName(scoringJudges[0], language) : '', L('記錄員', 'Recorder'), competition.recorder || ''];
  placeMethodData[1][12] = L('裁判二：', 'Judge 2:');
  placeMethodData[1][13] = scoringJudges[1] ? localizedName(scoringJudges[1], language) : '';
  placeMethodData[1][14] = L('公告：', 'Announce:');
  placeMethodData[1][15] = formatRoundDateTime(round.announcementTime, language) || '';
  
  placeMethodData[2][12] = L('裁判三：', 'Judge 3:');
  placeMethodData[2][13] = scoringJudges[2] ? localizedName(scoringJudges[2], language) : '';
  placeMethodData[2][14] = L('裁判長簽名：', 'Chief Judge:');
  placeMethodData[2][15] = competition.chiefJudge || '';

  placeMethodData[3][12] = L('裁判四：', 'Judge 4:');
  placeMethodData[3][13] = scoringJudges[3] ? localizedName(scoringJudges[3], language) : '';

  placeMethodData[4][12] = L('裁判五：', 'Judge 5:');
  placeMethodData[4][13] = scoringJudges[4] ? localizedName(scoringJudges[4], language) : '';

  const placeMethodSheet = XLSX.utils.aoa_to_sheet(placeMethodData);
  
  // Set column widths
  placeMethodSheet['!cols'] = [
    { wch: 5 },  // no.
    { wch: 16 }, // Team
    { wch: 12 }, // Name
    { wch: 6 },  // Rank 1-5
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 6 },
    { wch: 8 },  // Points
    { wch: 8 },  // Order
    { wch: 8 },  // Score 1-5
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 }, // Average
    { wch: 10 }  // Final Rank
  ];

  XLSX.utils.book_append_sheet(workbook, placeMethodSheet, L('席次法詳細', 'Place Method'));

  // Sheet 3: 裁判评分表 (Judge Score Sheet) - 空白表格供打印，按照你的第三个示例
  const judgeScoreData = [
    [],
    ['', '', '', '', '', '', competition.name + ' ' + L('裁判評分表', 'Judge Score Sheet')],
    [],
    [L('比賽項目：', 'Competition:'), '', localizedName(competition, language), '', '', L('比賽組別：', 'Division:'), '', competition.division],
    [],
    [],
    [
      'no.',
      '',
      L('學校名稱', 'Team'),
      '',
      L('姓名', 'Name'),
      '',
      L('總分', 'Total Score'),
      '',
      L('註記', 'Notes'),
      '',
      L('實施扣分', 'Fault Deduction')
    ],
    ...rankings.map((row, index) => [
      index + 1,
      '',
      row.athlete.school || row.athlete.teamName || '',
      '',
      localizedName(row.athlete, language),
      '',
      '',
      '',
      '',
      '',
      ''
    ]),
    // Additional empty rows for manual entry
    ...Array.from({ length: Math.max(0, 10 - rankings.length) }, (_, i) => [
      rankings.length + i + 1,
      '', '', '', '', '', '', '', '', '', ''
    ])
  ];

  const judgeScoreSheet = XLSX.utils.aoa_to_sheet(judgeScoreData);
  
  // Set column widths for judge score sheet
  judgeScoreSheet['!cols'] = [
    { wch: 5 },  // no.
    { wch: 2 },  // spacing
    { wch: 18 }, // Team
    { wch: 2 },  // spacing
    { wch: 12 }, // Name
    { wch: 2 },  // spacing
    { wch: 10 }, // Total
    { wch: 2 },  // spacing
    { wch: 15 }, // Notes
    { wch: 2 },  // spacing
    { wch: 12 }  // Fault
  ];

  XLSX.utils.book_append_sheet(workbook, judgeScoreSheet, L('裁判評分表', 'Judge Sheet'));

  // Save file
  const fileName = `${exportBaseFileName(competition, language)}_${L('排名', 'Rankings')}.xlsx`;
  const workbookData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([workbookData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return createDownload(fileName, blob);
}

async function exportRankingToPDFLegacy(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  language: Language
): Promise<ExportedFile> {
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
  const scoringJudges = judges.filter(j => j.role === 'Scoring');

  await installPdfFont(doc);
  
  // Title
  doc.setFontSize(18);
  const title = `${competition.name} ${L('裁判評分表', 'Judge Score Sheet')}`;
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

  // Competition Info - Left side
  doc.setFontSize(10);
  doc.text(`${L('比賽項目：', 'Competition:')} ${localizedName(competition, language)}`, 20, 28);
  doc.text(`${L('比賽組別：', 'Division:')} ${competition.division}`, 20, 35);

  // Competition Info - Right side
  doc.text(`${L('比賽時間：', 'Start Time:')} ${formatRoundDateTime(round.startTime, language) || L('__________', '__________')}`, 160, 28);
  doc.text(`${L('公告時間：', 'Announce:')} ${formatRoundDateTime(round.announcementTime, language) || L('__________', '__________')}`, 160, 35);

  // Judge Names - Right side
  let judgeY = 42;
  scoringJudges.slice(0, 5).forEach((judge, index) => {
    doc.text(`${L('裁判', 'Judge')}${['一', '二', '三', '四', '五'][index]}： ${localizedName(judge, language)}`, 160, judgeY);
    judgeY += 7;
  });

  // Rankings Table
  const tableData = rankings.map((row, index) => {
    const athleteScores = scoringJudges.map(judge => {
      const score = scores.find(s => s.athleteId === row.athlete.id && s.judgeId === judge.id && s.roundId === round.id);
      return score ? score.totalScore.toFixed(2) : '-';
    });
    
    // Pad scores to 5 judges
    while (athleteScores.length < 5) {
      athleteScores.push('-');
    }
    
    return [
      index + 1,
      row.athlete.school || row.athlete.teamName || '-',
      localizedName(row.athlete, language),
      ...athleteScores.slice(0, 5),
      row.averageScore.toFixed(2),
      `-${row.deduction.toFixed(1)}`,
      row.complete ? `${row.finalRank}` : '-'
    ];
  });

  // Add empty rows up to 10 athletes
  while (tableData.length < 10) {
    tableData.push([
      tableData.length + 1,
      '', '', '-', '-', '-', '-', '-', '', '', ''
    ]);
  }

  autoTable(doc, {
    head: [[
      'No.',
      L('學校/團隊', 'Team'),
      L('姓名', 'Name'),
      L('裁判一', 'Judge 1'),
      L('裁判二', 'Judge 2'),
      L('裁判三', 'Judge 3'),
      L('裁判四', 'Judge 4'),
      L('裁判五', 'Judge 5'),
      L('平均', 'Avg'),
      L('失誤', 'Fault'),
      L('名次', 'Rank')
    ]],
    body: tableData,
    startY: 50,
    styles: { 
      font: PDF_FONT_NAME,
      fontStyle: 'normal',
      fontSize: 9, 
      cellPadding: 2,
      halign: 'center'
    },
    headStyles: { 
      fillColor: [255, 140, 100], 
      textColor: 20,
      font: PDF_FONT_NAME,
      fontStyle: 'bold'
    },
    alternateRowStyles: { fillColor: [255, 240, 235] },
    columnStyles: {
      0: { cellWidth: 10 },  // No.
      1: { cellWidth: 35, halign: 'left' },  // Team
      2: { cellWidth: 25, halign: 'left' },  // Name
      3: { cellWidth: 18 },  // Judge scores
      4: { cellWidth: 18 },
      5: { cellWidth: 18 },
      6: { cellWidth: 18 },
      7: { cellWidth: 18 },
      8: { cellWidth: 18 },  // Average
      9: { cellWidth: 18 },  // Fault
      10: { cellWidth: 15 }  // Rank
    }
  });

  // Footer with signatures
  const finalY = doc.lastAutoTable?.finalY || 150;
  doc.setFont(PDF_FONT_NAME, 'normal');
  doc.setFontSize(10);
  const footerY = finalY + 12;
  
  doc.text(`${L('裁判長：', 'Chief Judge:')} ${competition.chiefJudge || '__________'}`, 20, footerY);
  doc.text(`${L('記錄員：', 'Recorder:')} ${competition.recorder || '__________'}`, 110, footerY);
  doc.text(`${L('日期：', 'Date:')} ${new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}`, 200, footerY);

  // Footer note
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(L('此表格由 MDiabolo 離線計分系統自動生成', 'Generated by MDiabolo Offline Scoring System'), doc.internal.pageSize.getWidth() / 2, footerY + 8, { align: 'center' });

  // Save PDF
  const fileName = `${exportBaseFileName(competition, language)}_${L('排名', 'Rankings')}.pdf`;
  const blob = doc.output('blob');
  return createDownload(fileName, blob);
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPdfSheetElement(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  language: Language
): HTMLElement {
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const scoringJudges = judges.filter(judge => judge.role === 'Scoring');
  const scoreLabel = (index: number) => language === 'zh'
    ? ['裁判一', '裁判二', '裁判三', '裁判四', '裁判五'][index]
    : `Judge ${index + 1}`;
  const rows = rankings.map((row, index) => {
    const athleteScores = scoringJudges.slice(0, 5).map(judge => {
      const score = scores.find(item => item.athleteId === row.athlete.id && item.judgeId === judge.id && item.roundId === round.id);
      return score ? score.totalScore.toFixed(2) : '-';
    });
    while (athleteScores.length < 5) athleteScores.push('-');
    return [
      index + 1,
      row.athlete.school || row.athlete.teamName || row.athlete.country || '-',
      localizedName(row.athlete, language),
      ...athleteScores,
      row.averageScore.toFixed(2),
      `-${row.deduction.toFixed(1)}`,
      row.complete ? row.finalRank : '-'
    ];
  });
  while (rows.length < 10) rows.push([rows.length + 1, '', '', '-', '-', '-', '-', '-', '', '', '']);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1500px';
  container.style.background = '#ffffff';
  container.style.color = '#151515';
  container.style.padding = '42px';
  container.style.fontFamily = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", Arial, sans-serif';
  container.style.fontSize = '22px';
  container.style.lineHeight = '1.35';

  const judgeLines = scoringJudges.slice(0, 5).map((judge, index) => `
    <div><strong>${escapeHtml(scoreLabel(index))}:</strong> ${escapeHtml(localizedName(judge, language))}</div>
  `).join('');
  const tableRows = rows.map((row, rowIndex) => `
    <tr class="${rowIndex % 2 ? 'alt' : ''}">
      ${row.map((cell, cellIndex) => `<td class="${cellIndex === 1 || cellIndex === 2 ? 'left' : ''}">${escapeHtml(cell)}</td>`).join('')}
    </tr>
  `).join('');

  container.innerHTML = `
    <style>
      .pdf-title { text-align: center; font-size: 34px; font-weight: 800; margin-bottom: 24px; }
      .pdf-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 40px; margin-bottom: 24px; }
      .pdf-meta div { border-bottom: 2px solid #e3e3e3; padding-bottom: 8px; }
      .pdf-judges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 28px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 2px solid #333; padding: 10px 8px; text-align: center; vertical-align: middle; word-break: break-word; }
      th { background: #ffb088; color: #111; font-weight: 800; }
      tr.alt td { background: #fff3ee; }
      td.left { text-align: left; }
      .pdf-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 28px; }
      .pdf-signatures div { border-top: 2px solid #333; padding-top: 10px; min-height: 42px; }
      .pdf-footer { text-align: center; color: #777; font-size: 18px; margin-top: 26px; }
    </style>
    <div class="pdf-title">${escapeHtml(competition.name)} ${escapeHtml(L('裁判评分表', 'Judge Score Sheet'))}</div>
    <div class="pdf-meta">
      <div><strong>${escapeHtml(L('比赛项目:', 'Competition:'))}</strong> ${escapeHtml(localizedName(competition, language))}</div>
      <div><strong>${escapeHtml(L('比赛组别:', 'Division:'))}</strong> ${escapeHtml(competition.division || '-')}</div>
      <div><strong>${escapeHtml(L('比赛时间:', 'Start Time:'))}</strong> ${escapeHtml(formatRoundDateTime(round.startTime, language) || '__________')}</div>
      <div><strong>${escapeHtml(L('公告时间:', 'Announce:'))}</strong> ${escapeHtml(formatRoundDateTime(round.announcementTime, language) || '__________')}</div>
    </div>
    <div class="pdf-judges">${judgeLines}</div>
    <table>
      <thead>
        <tr>
          <th style="width: 5%">No.</th>
          <th style="width: 17%">${escapeHtml(L('学校/团队', 'Team'))}</th>
          <th style="width: 14%">${escapeHtml(L('姓名', 'Name'))}</th>
          <th>${escapeHtml(scoreLabel(0))}</th>
          <th>${escapeHtml(scoreLabel(1))}</th>
          <th>${escapeHtml(scoreLabel(2))}</th>
          <th>${escapeHtml(scoreLabel(3))}</th>
          <th>${escapeHtml(scoreLabel(4))}</th>
          <th>${escapeHtml(L('平均', 'Avg'))}</th>
          <th>${escapeHtml(L('失误', 'Fault'))}</th>
          <th>${escapeHtml(L('名次', 'Rank'))}</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="pdf-signatures">
      <div><strong>${escapeHtml(L('裁判长:', 'Chief Judge:'))}</strong> ${escapeHtml(competition.chiefJudge || '')}</div>
      <div><strong>${escapeHtml(L('记录员:', 'Recorder:'))}</strong> ${escapeHtml(competition.recorder || '')}</div>
      <div><strong>${escapeHtml(L('日期:', 'Date:'))}</strong> ${escapeHtml(new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US'))}</div>
    </div>
    <div class="pdf-footer">${escapeHtml(L('此表格由 MDiabolo 离线计分系统自动生成', 'Generated by MDiabolo Offline Scoring System'))}</div>
  `;
  return container;
}

async function renderElementToPdfBlob(element: HTMLElement): Promise<Blob> {
  document.body.appendChild(element);
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      logging: false
    });
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const mmPerPixel = contentWidth / canvas.width;
    const pageCanvasHeight = Math.floor(contentHeight / mmPerPixel);
    let sourceY = 0;
    let pageIndex = 0;

    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext('2d');
      if (!context) throw new Error('Unable to render PDF page.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (pageIndex > 0) doc.addPage();
      doc.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, sliceHeight * mmPerPixel);
      sourceY += sliceHeight;
      pageIndex += 1;
    }
    return doc.output('blob');
  } finally {
    element.remove();
  }
}

export async function exportRankingToPDF(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  language: Language
): Promise<ExportedFile> {
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const element = createPdfSheetElement(competition, round, rankings, judges, scores, language);
  const blob = await renderElementToPdfBlob(element);
  const fileName = `${exportBaseFileName(competition, language)}_${L('排名', 'Rankings')}.pdf`;
  return createDownload(fileName, blob);
}
