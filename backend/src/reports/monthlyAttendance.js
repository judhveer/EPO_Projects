import fs from 'fs';
import path from 'path';
import PdfPrinter from 'pdfmake';
import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import { fileURLToPath } from 'node:url';

import db from '../models/index.js';
const { Attendance } = db;
import EMPLOYEES from "../config/attendance/employees.js";

import week from '../utils/attendance/week.js';
const { ZONE, ymd, parseDateTimeFlexible, isLate } = week;


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPORT_DIR = path.join(__dirname, 'out');
const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
  Roboto: {
    normal: path.join(__dirname, 'fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, 'fonts/Roboto-Medium.ttf'),
    italics: path.join(__dirname, 'fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, 'fonts/Roboto-MediumItalic.ttf'),
  },
};

const LATE_LABEL = 'after 10:15 AM';
const LATE_FLAG_THRESHOLD = 10; // tweak if you prefer
const THEME = {
  primary: '#0ea5e9', dark: '#0b5d79', success: '#16a34a',
  warning: '#f59e0b', danger: '#ef4444', gray700: '#374151',
  gray600: '#4b5563', gray200: '#e5e7eb', gray100: '#f3f4f6',
  chipBg: '#e0f2fe', chipTxt: '#075985',
};

// ---------- date helpers ----------
function getPreviousMonthRange(when = DateTime.now().setZone(ZONE)) {
  const prev = when.minus({ months: 1 });
  return { start: prev.startOf('month'), end: prev.endOf('month') };
}
function monthWorkingDates(start, end) {
  const dates = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    if (d.weekday !== 7) dates.push(ymd(d)); // exclude Sundays
  }
  return dates;
}

// ---------- scoring ----------
function scoreForDay({ present, late }) { return !present ? -5 : (late ? 5 : 10); }
function avgFirstInStr(times) {
  if (!times.length) return '-';
  const secs = times.map(t => t.hour * 3600 + t.minute * 60 + t.second);
  const avg = Math.round(secs.reduce((a, b) => a + b, 0) / secs.length);
  const hh = String(Math.floor(avg / 3600)).padStart(2, '0');
  const mm = String(Math.floor((avg % 3600) / 60)).padStart(2, '0');
  const ss = String(avg % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ---------- data ----------
async function fetchRows(startStr, endStr) {
  return Attendance.findAll({ where: { date: { [Op.between]: [startStr, endStr] } }, raw: true });
}

function buildAggregates(rows, allDates) {
  const byName = new Map();
  for (const r of rows) {
    const name = r.name?.trim();
    const d = r.date;
    if (!name || !allDates.includes(d)) continue;
    const checkInDT = parseDateTimeFlexible(r.check_in_time);

    const rec = byName.get(name) || {};
    const day = rec[d] || { firstIn: null, status: r.status || null, raw: [] };
    day.raw.push(r);
    if (!day.firstIn || (checkInDT && checkInDT < day.firstIn)) day.firstIn = checkInDT || day.firstIn;
    day.status = r.status || day.status;
    rec[d] = day;
    byName.set(name, rec);
  }

  const names = Array.isArray(EMPLOYEES) && EMPLOYEES.length
    ? EMPLOYEES
    : Array.from(byName.keys()).sort((a, b) => a.localeCompare(b));

  const result = [];
  for (const name of names) {
    const rec = byName.get(name) || {};
    let present = 0, absent = 0, lateCount = 0, score = 0;
    const firstInTimes = [];

    const dayRows = allDates.map(dateStr => {
      const d = rec[dateStr];
      let firstIn = d?.firstIn || null;
      let presentDay = !!d;
      let late = false;

      if (presentDay && d.status === 'ABSENT') presentDay = false;
      if (presentDay && firstIn) {
        if (isLate(firstIn)) late = true;
        firstInTimes.push(firstIn);
      }

      if (presentDay) { present++; if (late) lateCount++; } else { absent++; }
      score += scoreForDay({ present: presentDay, late });

      return {
        date: dateStr,
        firstInStr: firstIn ? firstIn.toFormat('HH:mm:ss') : '-',
        status: presentDay ? (late ? 'LATE' : 'PRESENT') : 'ABSENT',
      };
    });

    // raw score (-5..+10 per working day) → 0..100%
    const daysCount = allDates.length;
    const maxScore = daysCount * 10;
    const minScore = -daysCount * 5;
    let scorePct = Math.round(((score - minScore) / (maxScore - minScore)) * 100);
    scorePct = Math.max(0, Math.min(100, scorePct));

    result.push({
      name, present, absent, lateCount, score, scorePct,
      avgFirstIn: avgFirstInStr(firstInTimes),
      days: dayRows,
    });
  }
  return result;
}

function pickTopPerformers(agg) {
  const fullPresent = agg.filter(a => a.absent === 0);
  let mostPunctual = [];
  if (fullPresent.length) {
    const minLate = Math.min(...fullPresent.map(a => a.lateCount));
    mostPunctual = fullPresent
      .filter(a => a.lateCount === minLate)
      .sort((a, b) => a.avgFirstIn.localeCompare(b.avgFirstIn));
  }

  const mostAbsentCount = Math.max(0, ...agg.map(a => a.absent));
  const mostAbsent = agg.filter(a => a.absent === mostAbsentCount);

  const mostLateCount = Math.max(0, ...agg.map(a => a.lateCount));
  const mostLate = agg.filter(a => a.lateCount === mostLateCount);

  const lateFlag = agg.filter(a => a.lateCount >= LATE_FLAG_THRESHOLD);
  const perfectAttendance = agg.filter(a => a.absent === 0 && a.lateCount === 0);

  return { mostPunctual, mostAbsent, mostLate, lateFlag, perfectAttendance };
}

// ---------- PDF ----------
function buildDocDefinition({ title, subtitle, workingDays, agg, performers, lateLabel }) {
  const chip = (text) => ({ text, color: THEME.chipTxt, fillColor: THEME.chipBg, margin: [0, 2, 0, 0], fontSize: 9, alignment: 'center', border: [false, false, false, false] });
  const statusChip = (status) => {
    const map = { PRESENT: { bg: '#dcfce7', fg: THEME.success }, LATE: { bg: '#fef3c7', fg: THEME.warning }, ABSENT: { bg: '#fee2e2', fg: THEME.danger } };
    const c = map[status] || { bg: THEME.gray100, fg: THEME.gray700 };
    return { text: status, color: c.fg, fillColor: c.bg, margin: [0, 2, 0, 2], fontSize: 9, alignment: 'center', border: [false, false, false, false] };
  };
  const barColorFor = (pct) => pct < 50 ? THEME.danger : (pct < 75 ? THEME.warning : THEME.success);

  const totalEmps = agg.length;
  const perfect = performers.perfectAttendance.length;
  const lateFlag = performers.lateFlag.length;
  const avgInAll = (() => {
    const times = agg.flatMap(a => a.days.map(d => d.firstInStr).filter(t => t && t !== '-'));
    if (!times.length) return '-';
    const toSec = t => { const [H, M, S] = t.split(':').map(Number); return (H || 0) * 3600 + (M || 0) * 60 + (S || 0); };
    const sec = Math.round(times.reduce((x, y) => x + toSec(y), 0) / times.length);
    const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  })();
  const avgScorePct = Math.round(agg.reduce((s, a) => s + (a.scorePct || 0), 0) / Math.max(1, totalEmps));

  const summaryHeader = [
    { text: 'Employee', style: 'thLeft' },
    { text: 'Present', style: 'thNum' },
    { text: 'Absent', style: 'thNum' },
    { text: 'Late', style: 'thNum' },
    { text: 'Avg First IN', style: 'thCenter' },
    { text: 'Score %', style: 'thNum' },
  ];
  const summaryRows = agg.map(a => {
    const pct = a.scorePct ?? 0;
    const barWidth = Math.max(2, Math.min(80, pct * 0.8));
    const barColor = barColorFor(pct);
    return [
      { text: a.name, margin: [6, 2, 2, 2] },
      { text: String(a.present), alignment: 'right' },
      { text: String(a.absent), alignment: 'right' },
      { text: String(a.lateCount), alignment: 'right' },
      { text: a.avgFirstIn || '-', alignment: 'center' },
      {
        stack: [
          {
            canvas: [
              { type: 'rect', x: 0, y: 0, w: 80, h: 6, color: THEME.gray200 },
              { type: 'rect', x: 0, y: 0, w: barWidth, h: 6, color: barColor }
            ]
          },
          { text: `${pct}%`, fontSize: 8, color: THEME.gray700, alignment: 'right', margin: [0, 2, 0, 0] }
        ]
      }
    ];
  });

  // performers + flags (spacious)
  const listOrDash = arr => arr.length ? arr.map(p => `${p.name}`) : ['— none —'];
  const performerCols = {
    columns: [
      { width: '33%', stack: [{ text: 'Most Punctual (100% present, least late)', style: 'listTitle' }, { ul: listOrDash(performers.mostPunctual), style: 'list' }], margin: [0, 0, 0, 8] },
      { width: '33%', stack: [{ text: 'Most Absent', style: 'listTitle' }, { ul: listOrDash(performers.mostAbsent), style: 'list' }], margin: [0, 0, 0, 8] },
      { width: '33%', stack: [{ text: 'Most Late', style: 'listTitle' }, { ul: listOrDash(performers.mostLate), style: 'list' }], margin: [0, 0, 0, 8] },
    ], columnGap: 24, margin: [0, 0, 0, 6]
  };

  // detail sections (unbreakable)
  const detailSections = agg.map(a => ({
    unbreakable: true,
    stack: [
      { text: a.name, style: 'empName' },
      {
        table: {
          headerRows: 1,
          widths: [90, 80, '*'],
          body: [
            [{ text: 'Date', style: 'thLeft' }, { text: 'First IN', style: 'thCenter' }, { text: 'Status', style: 'thCenter' }],
            ...a.days.map(d => ([{ text: d.date, margin: [6, 2, 2, 2] }, { text: d.firstInStr, alignment: 'center' }, statusChip(d.status)])),
          ],
        },
        layout: {
          fillColor: (row) => (row % 2 === 0 ? null : THEME.gray100),
          hLineColor: () => THEME.gray200,
          vLineColor: () => THEME.gray200,
        },
        fontSize: 9, dontBreakRows: true, keepWithHeaderRows: 1, margin: [0, 0, 0, 20],
      },
    ],
  }));

  return {
    pageMargins: [28, 52, 28, 40],
    header: {
      columns: [
        { text: title, color: 'white', margin: [16, 10, 0, 10], fontSize: 14, bold: true },
        { width: '*', text: '' },
        { width: 220, stack: [chip(subtitle), { text: `Working days: ${workingDays} • Late if ${lateLabel}`, alignment: 'right', fontSize: 8, color: '#e5f7ff' }], margin: [0, 6, 16, 6] }
      ],
      margin: [0, 0, 0, 10], fillColor: THEME.primary
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Generated: ${new Date().toLocaleString('en-IN', { timeZone: ZONE })}`, color: THEME.gray600, fontSize: 8, margin: [28, 0, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', color: THEME.gray600, fontSize: 8, margin: [0, 0, 28, 0] },
      ]
    }),
    content: [
      // KPI cards
      {
        columns: [
          { width: '25%', table: { widths: ['*'], body: [[{ text: 'Total Employees', style: 'kpiTitle' }], [{ text: String(totalEmps), style: 'kpiValue' }]] }, layout: 'noBorders', margin: [0, 0, 6, 10] },
          { width: '25%', table: { widths: ['*'], body: [[{ text: 'Working Days (Mon–Sat)', style: 'kpiTitle' }], [{ text: String(workingDays), style: 'kpiValue' }]] }, layout: 'noBorders', margin: [6, 0, 6, 10] },
          { width: '25%', table: { widths: ['*'], body: [[{ text: 'Perfect Attendance', style: 'kpiTitle', color: THEME.success }], [{ text: String(perfect), style: 'kpiValue' }]] }, layout: 'noBorders', margin: [6, 0, 6, 10] },
          { width: '25%', table: { widths: ['*'], body: [[{ text: `Late >= ${LATE_FLAG_THRESHOLD} Days`, style: 'kpiTitle', color: THEME.warning }], [{ text: String(lateFlag), style: 'kpiValue' }]] }, layout: 'noBorders', margin: [6, 0, 0, 10] },
        ],
        columnGap: 6,
      },
      { columns: [{ width: '50%', table: { widths: ['*'], body: [[{ text: 'Avg Score %', style: 'kpiTitle' }], [{ text: `${avgScorePct}%`, style: 'kpiValue' }]] }, layout: 'noBorders' }, { width: '*', text: '' }], margin: [0, -6, 0, 6] },

      // Summary table
      { text: 'Employee-wise Summary', style: 'h2', margin: [0, 4, 0, 12] },
      {
        table: { headerRows: 1, widths: ['*', 40, 40, 40, 70, 90], body: [summaryHeader, ...summaryRows] },
        layout: {
          paddingTop: (i, node) => i === 0 ? 6 : 3,
          paddingBottom: (i, node) => 3,
          fillColor: (row) => row === 0 ? THEME.gray100 : (row % 2 === 0 ? null : '#fafafa'),
          hLineColor: () => THEME.gray200, vLineColor: () => THEME.gray200
        },
        dontBreakRows: true, keepWithHeaderRows: 1, margin: [0, 0, 10, 20], heights: (row) => row === 0 ? 20 : 16, // header taller than body
      },

      // Legend
      {
        columns: [
          { width: '*', text: '' },
          { width: 'auto', table: { widths: [12, 'auto'], body: [[{ canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, color: THEME.danger }] }, { text: '< 50%', fontSize: 8, margin: [2, 2, 0, 0] }]] }, layout: 'noBorders', heights: 12, margin: [0, 0, 12, 0] },
          { width: 'auto', table: { widths: [12, 'auto'], body: [[{ canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, color: THEME.warning }] }, { text: '50–74%', fontSize: 8, margin: [2, 2, 0, 0] }]] }, layout: 'noBorders', heights: 12, margin: [0, 0, 12, 0] },
          { width: 'auto', table: { widths: [12, 'auto'], body: [[{ canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, color: THEME.success }] }, { text: '≥ 75%', fontSize: 8, margin: [2, 2, 0, 0] }]] }, layout: 'noBorders', heights: 12 },
        ],
        columnGap: 12, margin: [0, 6, 0, 0]
      },

      // Top insights (new page)
      { text: 'Top Insights', style: 'h2', margin: [0, 12, 0, 6], pageBreak: 'before' },
      performerCols,

      // Flags
      { text: 'Flags', style: 'h2', margin: [0, 12, 0, 6] },
      { text: `Late ≥ ${LATE_FLAG_THRESHOLD} Days`, style: 'h3' },
      { ul: performers.lateFlag.length ? performers.lateFlag.map(p => `${p.name} — ${p.lateCount} late`) : ['— none —'] },
      { text: 'Perfect Attendance', style: 'h3', margin: [0, 6, 0, 2] },
      { ul: performers.perfectAttendance.length ? performers.perfectAttendance.map(p => p.name) : ['— none —'] },

      // Details
      {
        text: 'Details by Employee', fontSize: 28,          // ← bigger title
        bold: true, alignment: 'center', pageBreak: 'before', margin: [0, 250, 0, 50]
      },
      { text: '', pageBreak: 'after' }, // immediately end this page
      ...detailSections,
    ],
    styles: {
      h2: { fontSize: 13, bold: true, color: THEME.gray700 }, h3: { fontSize: 11, bold: true, color: THEME.gray700 },
      thLeft: { bold: true, color: THEME.gray700 }, thCenter: { bold: true, color: THEME.gray700, alignment: 'center' },
      thNum: { bold: true, color: THEME.gray700, alignment: 'right' }, empName: { fontSize: 11, bold: true, color: THEME.dark, margin: [0, 8, 0, 4] },
      kpiTitle: { fontSize: 9, color: THEME.gray600, margin: [0, 2, 0, 0] }, kpiValue: { fontSize: 18, bold: true, color: THEME.gray700 },
      listTitle: { fontSize: 11, bold: true, color: THEME.gray700, margin: [0, 0, 0, 6], lineHeight: 1.2 },
      list: { fontSize: 10, margin: [6, 0, 0, 12], lineHeight: 1.35 }, listItem: { margin: [0, 2, 0, 6] }, listItemMuted: { margin: [0, 2, 0, 6], color: THEME.gray600, italics: true },
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.5 },
  };
}

async function generateMonthlyAttendancePDF({ when = DateTime.now().setZone(ZONE) } = {}) {
  const { start, end } = getPreviousMonthRange(when);
  const allDates = monthWorkingDates(start, end); // Mon–Sat
  const startStr = ymd(start), endStr = ymd(end);

  const rows = await fetchRows(startStr, endStr);

  if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
    const presentNames = new Set(rows.map(r => r.name));
    for (const name of EMPLOYEES) {
      if (!presentNames.has(name)) rows.push({ name, date: null, check_in_time: null, status: null });
    }
  }

  const agg = buildAggregates(rows, allDates);
  const performers = pickTopPerformers(agg);

  const monthName = start.toFormat('LLLL yyyy');
  const title = 'Monthly Attendance Report';
  const subtitle = `Month: ${monthName} — Zone: ${ZONE}`;

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const filename = `monthly_attendance_${start.toFormat('yyyy-LL')}.pdf`;
  const outPath = path.join(REPORT_DIR, filename);

  const printer = new PdfPrinter(FONTS);
  const docDefinition = buildDocDefinition({
    title, subtitle, workingDays: allDates.length, agg, performers, lateLabel: LATE_LABEL
  });

  await new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const stream = fs.createWriteStream(outPath);
    pdfDoc.pipe(stream);
    pdfDoc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { outPath, startStr, endStr, filename, agg, performers, workingDays: allDates.length, monthName };
}

export default { generateMonthlyAttendancePDF, LATE_FLAG_THRESHOLD };
