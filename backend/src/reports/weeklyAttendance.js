// reports/weeklyAttendance.js
import fs from 'fs';
import path from 'path';
import PdfPrinter from 'pdfmake';
import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import db from '../models/index.js';
const { Attendance } = db;
import { fileURLToPath } from 'node:url';

import week from '../utils/attendance/week.js';

const {
  ZONE, getLastWeekMonSatRange, ymd, parseDateTimeFlexible, isLate
} = week;



// ====== CONFIG ======
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

// If you have a canonical employee list, use that (recommended).
// Otherwise we'll derive from attendance rows for the period.
// Example to use canonical list:
// const EMPLOYEES = require('../config/employees'); // ['ALICE', 'BOB', ...]
import EMPLOYEES from "../config/attendance/employees.js";

// LATE cutoff shown on PDF
const LATE_LABEL = 'after 10:15 AM';

function dateListMonToSat(start) {
  // start is Monday; return 6 dates (Mon..Sat) as 'yyyy-LL-dd'
  return Array.from({ length: 6 }).map((_, i) => ymd(start.plus({ days: i })));
}

// Score: +10 on-time present, +5 late present, -5 absent
function scoreForDay({ present, late }) {
  if (!present) return -5;
  return late ? 5 : 10;
}

function avgFirstInStr(times) {
  if (!times.length) return '-';
  // compute average seconds since midnight
  const seconds = times
    .map(t => t.hour * 3600 + t.minute * 60 + t.second);
  const avg = Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length);
  const hh = Math.floor(avg / 3600);
  const mm = Math.floor((avg % 3600) / 60);
  const ss = avg % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

async function fetchRows(startStr, endStr) {
  return Attendance.findAll({
    where: { date: { [Op.between]: [startStr, endStr] } },
    raw: true,
  });
}

function buildAggregates(rows, weekDates) {
  // Group by name -> date -> first_in
  const byName = new Map();

  for (const r of rows) {
    const name = r.name?.trim();
    const d = r.date; // 'yyyy-LL-dd' expected
    if (!name || !weekDates.includes(d)) continue;

    const checkInDT = parseDateTimeFlexible(r.check_in_time);
    // We only care about the first IN per day
    const rec = byName.get(name) || {};
    const day = rec[d] || { firstIn: null, status: r.status || null, raw: [] };
    day.raw.push(r);

    if (!day.firstIn || (checkInDT && checkInDT < day.firstIn)) {
      day.firstIn = checkInDT || day.firstIn;
    }
    // Prefer explicit status if set; else keep existing
    day.status = r.status || day.status;

    rec[d] = day;
    byName.set(name, rec);
  }

  // If no EMPLOYEES provided, derive names from rows
  const names = EMPLOYEES || Array.from(byName.keys()).sort((a, b) => a.localeCompare(b));

  // Fill missing days for each employee
  const result = [];
  for (const name of names) {
    const rec = byName.get(name) || {};
    let present = 0, absent = 0, lateCount = 0, score = 0;
    const firstInTimes = [];

    const dayRows = weekDates.map(dateStr => {
      const d = rec[dateStr];
      let firstIn = d?.firstIn || null;
      let presentDay = !!d; // missing row => absent
      let late = false;

      if (presentDay) {
        // If status is explicitly ABSENT, treat as absent even if row exists
        if (d.status === 'ABSENT') presentDay = false;
      }
      if (presentDay && firstIn) {
        if (isLate(firstIn)) late = true;
        firstInTimes.push(firstIn);
      }

      // score & counters
      if (presentDay) {
        present++;
        if (late) lateCount++;
      } else {
        absent++;
      }
      score += scoreForDay({ present: presentDay, late });

      return {
        date: dateStr,
        firstInStr: firstIn ? firstIn.toFormat('HH:mm:ss') : '-',
        status: presentDay ? (late ? 'LATE' : 'PRESENT') : 'ABSENT',
      };
    });

    // 👉 Convert raw score (-30..60) to 0..100%
    const daysCount = weekDates.length;         // 6 (Mon–Sat)
    const maxScore = daysCount * 10;           // 60
    const minScore = -daysCount * 5;           // -30
    let scorePct = Math.round(((score - minScore) / (maxScore - minScore)) * 100);
    scorePct = Math.max(0, Math.min(100, scorePct)); // clamp

    result.push({
      name,
      present,
      absent,
      lateCount,
      score,
      scorePct,
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

  const late3plus = agg.filter(a => a.lateCount >= 3);
  const perfectAttendance = agg.filter(a => a.absent === 0 && a.lateCount === 0);

  return { mostPunctual, mostAbsent, mostLate, late3plus, perfectAttendance };
}


// reports/weeklyAttendance.js (replace buildDocDefinition with this)
function buildDocDefinition({ title, subtitle, agg, performers, lateLabel }) {
  const THEME = {
    primary: '#0ea5e9',   // sky-500
    dark: '#0b5d79',
    success: '#16a34a',   // green-600
    warning: '#f59e0b',   // amber-500
    danger: '#ef4444',   // red-500
    gray700: '#374151',
    gray600: '#4b5563',
    gray200: '#e5e7eb',
    gray100: '#f3f4f6',
    chipBg: '#e0f2fe',   // light sky
    chipTxt: '#075985',
  };

  // KPIs
  const totalEmps = agg.length;
  const perfect = performers.perfectAttendance.length;
  const late3 = performers.late3plus.length;
  // const avgInAll = (() => {
  //   const times = agg.flatMap(a => a.days
  //     .map(d => d.firstInStr)
  //     .filter(t => t && t !== '-'));
  //   if (!times.length) return '-';
  //   // quick numeric average on HH:mm:ss
  //   const toSec = t => {
  //     const [H, M, S] = t.split(':').map(Number);
  //     return (H || 0) * 3600 + (M || 0) * 60 + (S || 0);
  //   };
  //   const sec = Math.round(times.reduce((x, y) => x + toSec(y), 0) / times.length);
  //   const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
  //   const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  //   const ss = String(sec % 60).padStart(2, '0');
  //   return `${hh}:${mm}:${ss}`;
  // })();

  const medianInAll = (() => {
    const times = agg.flatMap(a => a.days.map(d => d.firstInStr).filter(t => t && t !== '-'));
    if (!times.length) return '-';
    const toSec = t => { const [H, M, S] = t.split(':').map(Number); return (H || 0) * 3600 + (M || 0) * 60 + (S || 0); };
    const secs = times.map(toSec).sort((a, b) => a - b);
    const mid = Math.floor(secs.length / 2);
    const val = secs.length % 2 ? secs[mid] : Math.round((secs[mid - 1] + secs[mid]) / 2);
    const hh = String(Math.floor(val / 3600)).padStart(2, '0');
    const mm = String(Math.floor((val % 3600) / 60)).padStart(2, '0');
    const ss = String(val % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  })();



  const avgScorePct = Math.round(
    agg.reduce((s, a) => s + (a.scorePct ?? 0), 0) / Math.max(1, totalEmps)
  );


  // Helpers
  const chip = (text) => ({
    text,
    color: THEME.chipTxt,
    fillColor: THEME.chipBg,
    margin: [0, 2, 0, 0],
    fontSize: 9,
    alignment: 'center',
    border: [false, false, false, false],
  });

  const statusChip = (status) => {
    const map = {
      PRESENT: { bg: '#dcfce7', fg: THEME.success }, // green-100
      LATE: { bg: '#fef3c7', fg: THEME.warning }, // amber-100
      ABSENT: { bg: '#fee2e2', fg: THEME.danger }, // red-100
    };
    const c = map[status] || { bg: THEME.gray100, fg: THEME.gray700 };
    return {
      text: status,
      color: c.fg,
      fillColor: c.bg,
      margin: [0, 2, 0, 2],
      fontSize: 9,
      alignment: 'center',
      border: [false, false, false, false],
    };
  };

  // Summary table
  const summaryHeader = [
    { text: 'Employee', style: 'thLeft' },
    { text: 'Present', style: 'thNum' },
    { text: 'Absent', style: 'thNum' },
    { text: 'Late', style: 'thNum' },
    { text: 'Avg First IN', style: 'thCenter' },
    { text: 'Score %', style: 'thNum' },
  ];

  const barColorFor = (pct) => pct < 50 ? THEME.danger : (pct < 75 ? THEME.warning : THEME.success);

  const summaryRows = agg.map(a => {
    const pct = a.scorePct ?? 0;                 // 0–100
    const barWidth = Math.max(2, Math.min(80, pct * 0.8)); // 0–80px
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
          { text: String(pct) + '%', fontSize: 8, color: THEME.gray700, alignment: 'right', margin: [0, 2, 0, 0] },
        ]
      }
    ];
  });


  // Detail sections
  // Detail sections (keep each employee together; no row splits)
  const detailSections = agg.map(a => ({
    unbreakable: true,                 // 👈 apply here
    stack: [
      { text: a.name, style: 'empName' },
      {
        table: {
          headerRows: 1,
          widths: [90, 80, '*'],
          body: [
            [
              { text: 'Date', style: 'thLeft' },
              { text: 'First IN', style: 'thCenter' },
              { text: 'Status', style: 'thCenter' },
            ],
            ...a.days.map(d => ([
              { text: d.date, margin: [6, 2, 2, 2] },
              { text: d.firstInStr, alignment: 'center' },
              statusChip(d.status)
            ])),
          ],
        },
        layout: {
          fillColor: (row) => (row % 2 === 0 ? null : THEME.gray100),
          hLineColor: () => THEME.gray200,
          vLineColor: () => THEME.gray200,
        },
        fontSize: 9,
        dontBreakRows: true,        // prevent splitting table rows
        keepWithHeaderRows: 1,      // keep first data row with header
        margin: [0, 0, 0, 20],
      },
    ],
  }));


  // Top performers lists
  const listOrDash = arr => arr.length ? arr.map(p => `${p.name}`) : ['— none —'];
  const performerCols = {
    columns: [
      {
        width: '33%',
        stack: [
          { text: 'Most Punctual (100% present, least late)', style: 'listTitle' },
          {
            ul: performers.mostPunctual.length
              ? performers.mostPunctual.map(p => ({ text: p.name, style: 'listItem' }))
              : [{ text: '— none —', style: 'listItemMuted' }],
            style: 'list'
          }
        ],
        margin: [0, 0, 0, 8]
      },
      {
        width: '33%',
        stack: [
          { text: 'Most Absent', style: 'listTitle' },
          {
            ul: performers.mostAbsent.length
              ? performers.mostAbsent.map(p => ({ text: p.name, style: 'listItem' }))
              : [{ text: '— none —', style: 'listItemMuted' }],
            style: 'list'
          }
        ],
        margin: [0, 0, 0, 8]
      },
      {
        width: '33%',
        stack: [
          { text: 'Most Late', style: 'listTitle' },
          {
            ul: performers.mostLate.length
              ? performers.mostLate.map(p => ({ text: p.name, style: 'listItem' }))
              : [{ text: '— none —', style: 'listItemMuted' }],
            style: 'list'
          }
        ],
        margin: [0, 0, 0, 8]
      }
    ],
    columnGap: 24,         // wider gap between the three lists
    margin: [0, 0, 0, 6]
  };


  return {
    pageMargins: [28, 52, 28, 40],
    header: {
      columns: [
        { text: title, color: 'white', margin: [16, 10, 0, 10], fontSize: 14, bold: true },
        { width: '*', text: '' },
        {
          width: 180, stack: [
            chip(subtitle),
            { text: `Late if ${lateLabel}`, alignment: 'right', fontSize: 8, color: '#e5f7ff' }
          ], margin: [0, 6, 16, 6]
        }
      ],
      margin: [0, 0, 0, 10],
      fillColor: THEME.primary
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, color: THEME.gray600, fontSize: 8, margin: [28, 10, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', color: THEME.gray600, fontSize: 8, margin: [0, 10, 28, 0] },
      ]
    }),

    content: [
      // KPI Cards
      {
        columns: [
          {
            width: '25%',
            table: { widths: ['*'], body: [[{ text: 'Total Employees', style: 'kpiTitle' }], [{ text: String(totalEmps), style: 'kpiValue' }]] },
            layout: 'noBorders',
            margin: [0, 0, 6, 10],
          },
          {
            width: '25%',
            table: { widths: ['*'], body: [[{ text: 'Perfect Attendance', style: 'kpiTitle', color: THEME.success }], [{ text: String(perfect), style: 'kpiValue' }]] },
            layout: 'noBorders',
            margin: [6, 0, 6, 10],
          },
          {
            width: '25%',
            table: { widths: ['*'], body: [[{ text: 'Late for more than 3 Days', style: 'kpiTitle', color: THEME.warning }], [{ text: String(late3), style: 'kpiValue' }]] },
            layout: 'noBorders',
            margin: [6, 0, 6, 10],
          },
          {
            width: '25%',
            table: { widths: ['*'], body: [[{ text: 'Median First IN', style: 'kpiTitle' }], [{ text: medianInAll, style: 'kpiValue' }]] },
            layout: 'noBorders',
            margin: [6, 0, 0, 10],
          },
        ],
        columnGap: 6,
      },
      {
        columns: [
          { width: '50%', table: { widths: ['*'], body: [[{ text: 'Avg Score %', style: 'kpiTitle' }], [{ text: `${String(avgScorePct)}%`, style: 'kpiValue' }]] }, layout: 'noBorders' },
          { width: '*', text: '' }
        ],
        margin: [0, -6, 0, 6],
      },

      // Summary table
      { text: 'Employee-wise Summary', style: 'h2', margin: [0, 4, 0, 12] },
      {
        table: { headerRows: 1, widths: ['*', 40, 40, 40, 70, 90], body: [summaryHeader, ...summaryRows] },
        layout: {
          fillColor: (row) => row === 0 ? THEME.gray100 : (row % 2 === 0 ? null : '#fafafa'),
          paddingTop: (i, node) => i === 0 ? 6 : 3,
          paddingBottom: (i, node) => 3,
          hLineColor: () => THEME.gray200,
          vLineColor: () => THEME.gray200,
        },
        // optional: small bottom gap before legend
        dontBreakRows: true,       // 👈 prevent splitting a table row across pages
        keepWithHeaderRows: 1,     // 👈 keep row #1 with header when page breaks
        heights: (row) => row === 0 ? 20 : 16, // header taller than body
        margin: [0, 0, 0, 10],
      },

      // ✅ INSERT THE LEGEND BLOCK HERE:
      {
        columns: [
          { width: '*', text: '' },

          // < 50%
          {
            width: 'auto',
            table: {
              widths: [12, 'auto'],
              body: [[
                { canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, color: THEME.danger }] },
                { text: 'less than 50%', fontSize: 8, margin: [2, 2, 0, 0] }
              ]]
            },
            layout: 'noBorders',
            heights: 12,
            margin: [0, 0, 12, 0]
          },

          // 50–74%
          {
            width: 'auto',
            table: {
              widths: [12, 'auto'],
              body: [[
                { canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, color: THEME.warning }] },
                { text: '50 - 74%', fontSize: 8, margin: [2, 2, 0, 0] }
              ]]
            },
            layout: 'noBorders',
            heights: 12,
            margin: [0, 0, 12, 0]
          },

          // ≥ 75%
          {
            width: 'auto',
            table: {
              widths: [12, 'auto'],
              body: [[
                { canvas: [{ type: 'rect', x: 1, y: 1, w: 10, h: 10, color: THEME.success }] },
                { text: '>= 75%', fontSize: 8, margin: [2, 2, 0, 0] }
              ]]
            },
            layout: 'noBorders',
            heights: 12
          }
        ],
        columnGap: 12,
        margin: [0, 6, 0, 0]
      },


      // Top performers
      { text: 'Top Insights', style: 'h2', margin: [0, 12, 0, 6], pageBreak: 'before' },
      performerCols,

      // Flags
      { text: 'Flags', style: 'h2', margin: [0, 12, 0, 6] },
      { text: 'Late for more than 3 Days', style: 'h3' },
      { ul: performers.late3plus.length ? performers.late3plus.map(p => `${p.name} — ${p.lateCount} late`) : ['— none —'] },
      { text: 'Perfect Attendance', style: 'h3', margin: [0, 6, 0, 2] },
      { ul: performers.perfectAttendance.length ? performers.perfectAttendance.map(p => p.name) : ['— none —'] },

      // Details
      { text: 'Details by Employee', style: 'h2', pageBreak: 'before', margin: [0, 6, 0, 6] },
      ...detailSections,
    ],

    styles: {
      h2: { fontSize: 13, bold: true, color: THEME.gray700 },
      h3: { fontSize: 11, bold: true, color: THEME.gray700 },
      thLeft: { bold: true, color: THEME.gray700 },
      thCenter: { bold: true, color: THEME.gray700, alignment: 'center' },
      thNum: { bold: true, color: THEME.gray700, alignment: 'right' },
      empName: { fontSize: 11, bold: true, color: THEME.dark, margin: [0, 8, 0, 4] },

      kpiTitle: { fontSize: 9, color: THEME.gray600, margin: [0, 2, 0, 0] },
      kpiValue: { fontSize: 18, bold: true, color: THEME.gray700 },
      listTitle: { fontSize: 11, bold: true, color: THEME.gray700, margin: [0, 0, 0, 6], lineHeight: 1.2 },
      list: { fontSize: 10, margin: [6, 0, 0, 12], lineHeight: 1.35 },   // left indent + extra bottom
      listItem: { margin: [0, 2, 0, 6] },                                     // space between bullets
      listItemMuted: { margin: [0, 2, 0, 6], color: THEME.gray600, italics: true },
    },

    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.5 },
  };
}


export async function generateWeeklyAttendancePDF({ when = DateTime.now().setZone(ZONE) } = {}) {
  console.log("generating Weekly Attendance PDF.......");
  const { start, end } = getLastWeekMonSatRange(when);
  const weekDates = dateListMonToSat(start);
  const startStr = ymd(start), endStr = ymd(end);

  const rows = await fetchRows(startStr, endStr);
  console.log("generating Weekly Attendance step 2.......");
  

  // If you have a canonical employee list, include those with zero rows:
  if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
    const presentNames = new Set(rows.map(r => r.name));
    for (const name of EMPLOYEES) {
      if (!presentNames.has(name)) {
        // inject a dummy to ensure they appear with 0 rows (absent)
        rows.push({ name, date: null, check_in_time: null, status: null });
      }
    }
  }

  console.log("generating Weekly Attendance step 3.......");

  const agg = buildAggregates(rows, weekDates);
  console.log("generating Weekly Attendance step 4.......");
  const performers = pickTopPerformers(agg);
  console.log("generating Weekly Attendance step 5.......");

  const title = 'Weekly Attendance Report';
  const subtitle = `Week: ${startStr} (Mon) -> ${ymd(end)} (Sat) — Zone: ${ZONE}`;

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const filename = `weekly_attendance_${startStr}_to_${ymd(end)}.pdf`;
  const outPath = path.join(REPORT_DIR, filename);

  console.log("generating Weekly Attendance step 6.......");

  const printer = new PdfPrinter(FONTS);
  const docDefinition = buildDocDefinition({
    title, subtitle, agg, performers, lateLabel: LATE_LABEL
  });

  console.log("generating Weekly Attendance step 7.......");

  await new Promise((resolve, reject) => {
    console.log("generating Weekly Attendance step 8.......");
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const stream = fs.createWriteStream(outPath);
    pdfDoc.pipe(stream);
    pdfDoc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
    console.log("generating Weekly Attendance step 9.......");
  });

  console.log("generating Weekly Attendance step 10.......");
  return { outPath, startStr, endStr, filename, agg, performers };
}
