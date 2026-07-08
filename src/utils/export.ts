import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import type { Athlete, Competition, CompetitionRound, Judge, Language, ScoreSubmission, FaultSubmission } from '../initialData';
import { localizedName } from '../initialData';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => void;
    lastAutoTable?: { finalY: number };
  }
}

interface RankingRow {
  athlete: Athlete;
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

export function exportRankingToExcel(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  faults: FaultSubmission[],
  language: Language
) {
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const workbook = XLSX.utils.book_new();
  const scoringJudges = judges.filter(j => j.role === 'Scoring');

  // Sheet 1: 排名总表 (Summary Rankings) - 按照你的示例格式
  const summaryData = [
    // Header section with competition info
    [L('盃賽名稱:', 'Event Name:'), competition.name, '', '', '', '', L('請填入紅色框框內，', 'Please fill in red boxes,')],
    [L('比賽項目:', 'Competition:'), localizedName(competition, language), '', '', '', '', L('其它部分請勿更動。', 'Do not modify other parts.')],
    [L('比賽組別:', 'Division:'), competition.division],
    [L('比賽時間:', 'Start Time:'), round.startTime || L('請填寫', 'Please fill')],
    [L('公告時間:', 'Announcement Time:'), round.announcementTime || L('請填寫', 'Please fill')],
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
  
  XLSX.utils.book_append_sheet(workbook, summarySheet, L('排名總表', 'Rankings'));

  // Sheet 2: 席次法详细 (Place Method Details) - 按照你的第二个示例
  const placeMethodData = [
    [],
    ['', '', competition.name],
    [],
    ['', L('比賽項目', 'Competition'), localizedName(competition, language), '', round.startTime || ''],
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
  placeMethodData[1][15] = round.announcementTime || '';
  
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
  const fileName = `${localizedName(competition, language)}_${localizedName(round, language)}_${L('排名', 'Rankings')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

export function exportRankingToPDF(
  competition: Competition,
  round: CompetitionRound,
  rankings: RankingRow[],
  judges: Judge[],
  scores: ScoreSubmission[],
  language: Language
) {
  const L = (zh: string, en: string) => language === 'zh' ? zh : en;
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
  const scoringJudges = judges.filter(j => j.role === 'Scoring');

  // Add Chinese font support (using default for now - you may need to add custom font)
  doc.setFont('helvetica');
  
  // Title
  doc.setFontSize(18);
  const title = `${competition.name} ${L('裁判評分表', 'Judge Score Sheet')}`;
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

  // Competition Info - Left side
  doc.setFontSize(10);
  doc.text(`${L('比賽項目：', 'Competition:')} ${localizedName(competition, language)}`, 20, 28);
  doc.text(`${L('比賽組別：', 'Division:')} ${competition.division}`, 20, 35);

  // Competition Info - Right side
  doc.text(`${L('比賽時間：', 'Start Time:')} ${round.startTime || L('__________', '__________')}`, 160, 28);
  doc.text(`${L('公告時間：', 'Announce:')} ${round.announcementTime || L('__________', '__________')}`, 160, 35);

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

  doc.autoTable({
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
      fontSize: 9, 
      cellPadding: 2,
      halign: 'center'
    },
    headStyles: { 
      fillColor: [255, 140, 100], 
      textColor: 20,
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
  const fileName = `${localizedName(competition, language)}_${localizedName(round, language)}_${L('排名', 'Rankings')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
