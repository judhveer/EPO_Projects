// reports/accountantMonthly.js
import fs from 'fs';
import path from 'path';
import PdfPrinter from 'pdfmake';
import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import { fileURLToPath } from 'node:url';

import db from '../models/index.js';
const { Attendance } = db;

import week from '../utils/attendance/week.js';
const  {
  ZONE, ymd, parseDateTimeFlexible
} = week;


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
};

const SHOW_TOTAL_ROW = false;   // set to false to hide the TOTAL row
const SHOW_KPIS = true;   // small summary tiles above the table


// ===== helpers =====
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
function parseOnDate(dateStr, timeStr) {
  if (!timeStr) return null;
  // try your existing flexible parser first
  const dt = parseDateTimeFlexible(timeStr);
  if (dt) return dt;
  // fallback if stored as 'HH:mm' or 'HH:mm:ss'
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
  if (!m) return null;
  const hh = String(+m[1]).padStart(2, '0');
  const mm = String(+m[2]).padStart(2, '0');
  const ss = String(+(m[3] || 0)).padStart(2, '0');
  return DateTime.fromISO(`${dateStr}T${hh}:${mm}:${ss}`, { zone: ZONE });
}
function fmtHM(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.abs(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function dayName(dateStr) {
  return DateTime.fromISO(dateStr, { zone: ZONE }).toFormat('ccc'); // Mon,Tue,...
}

function fmtHMVerbose(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.abs(mins % 60);
  return `${String(h).padStart(2, '0')} hours : ${String(m).padStart(2, '0')} minutes`;
}



// ===== data =====
async function fetchRows(startStr, endStr) {
  return Attendance.findAll({
    where: { date: { [Op.between]: [startStr, endStr] } },
    raw: true,
  });
}

function buildAggregates(rows, dates) {
  // group by name -> date -> push rows
  const byName = new Map();
  for (const r of rows) {
    const name = r.name?.trim();
    const d = r.date;
    if (!name || !dates.includes(d)) continue;
    const rec = byName.get(name) || {};
    (rec[d] ||= []).push(r);
    byName.set(name, rec);
  }

  const names = Array.from(byName.keys()).sort((a, b) => a.localeCompare(b));
  const result = [];

  for (const name of names) {
    const daymap = byName.get(name) || {};
    let present = 0, absent = 0, otDays = 0, otMinutes = 0;
    const daysDetail = [];

    for (const dateStr of dates) {
      const dayRows = daymap[dateStr] || [];
      const explicitAbsent = dayRows.some(r => r.status === 'ABSENT');
      const presentDay = dayRows.length > 0 && !explicitAbsent;

      // find last OUT on that day (prefer check_out_time, fallback to check_in_time)
      let lastOut = null;
      for (const r of dayRows) {
        const outDT = parseOnDate(dateStr, r.check_out_time);
        if (outDT && (!lastOut || outDT > lastOut)) lastOut = outDT;

        const inDT = parseOnDate(dateStr, r.check_in_time);
        if (inDT && (!lastOut || inDT > lastOut)) lastOut = inDT;
      }

      let dayOT = 0;
      if (presentDay && lastOut) {
        const cutoff = DateTime.fromISO(`${dateStr}T18:00:00`, { zone: ZONE });
        const diffMin = Math.floor(lastOut.diff(cutoff, 'minutes').minutes);
        dayOT = Math.max(0, diffMin);
      }

      if (presentDay) {
        present++;
        if (dayOT > 0) { otDays++; otMinutes += dayOT; }
      } else {
        absent++;
      }

      daysDetail.push({
        date: dateStr,
        day: dayName(dateStr),
        otMinutes: dayOT,
        otHM: fmtHM(dayOT),
        status: presentDay ? 'PRESENT' : 'ABSENT',
      });
    }

    result.push({
      name,
      workingDays: dates.length,
      present,
      absent,
      otDays,
      otMinutes,
      days: daysDetail, // <-- NEW
    });
  }

  return result;
}

// ===== PDF =====
function buildDocDefinition({ title, subtitle, agg, monthName }) {
  const THEME = {
    primary: '#0ea5e9',
    gray700: '#374151',
    gray600: '#4b5563',
    gray200: '#e5e7eb',
    gray100: '#f3f4f6',
    success: '#16a34a',
  };

  const totalEmps = agg.length;
  const sums = agg.reduce((s, a) => {
    s.present += a.present;
    s.absent += a.absent;
    s.otDays += a.otDays;
    s.otMin += a.otMinutes;
    return s;
  }, { present: 0, absent: 0, otDays: 0, otMin: 0 });

  const totalCells = agg.length * (agg[0]?.workingDays || 0);
  const presentRate = totalCells ? Math.round((sums.present / totalCells) * 100) : 0;
  const avgOTPerEmpMin = agg.length ? Math.round(sums.otMin / agg.length) : 0;
  const avgOTPerEmpHM = fmtHM(avgOTPerEmpMin);


  // ensure this exists inside buildDocDefinition
  const workingDays = agg[0]?.workingDays ?? 0; // or pass it in as an arg

  const kpiCard = (title, value, margin = [0, 0, 0, 10], color) => ({
    width: '25%',
    table: {
      widths: ['*'],
      body: [
        [{ text: title, style: 'kpiTitle', ...(color ? { color } : {}) }],
        [{ text: String(value), style: 'kpiValue' }],
      ]
    },
    layout: 'noBorders',
    margin,
  });


  const summaryHeader = [
    { text: 'Employee', style: 'thLeft' },
    { text: 'Working Days', style: 'thNum' },
    { text: 'Present', style: 'thNum' },
    { text: 'Absent', style: 'thNum' },
    { text: 'OT Days (> 6 PM)', style: 'thNum' },
    { text: 'OT Minutes', style: 'thNum' },
    { text: 'OT Hours', style: 'thNum' },   // NEW
  ];

  const summaryRows = agg.map(a => ([
    { text: a.name, margin: [6, 2, 2, 2] },
    { text: String(a.workingDays), alignment: 'right' },
    { text: String(a.present), alignment: 'right' },
    { text: String(a.absent), alignment: 'right' },
    { text: String(a.otDays), alignment: 'right' },
    { text: `${a.otMinutes} Minutes`, alignment: 'right' },
    { text: `${fmtHM(a.otMinutes)} Hours`, alignment: 'right' },
  ]));

  // Totals row
  if (SHOW_TOTAL_ROW) {
    summaryRows.push([
      { text: 'TOTAL', bold: true },
      { text: agg[0]?.workingDays ?? '-', alignment: 'right', bold: true },
      { text: String(sums.present), alignment: 'right', bold: true },
      { text: String(sums.absent), alignment: 'right', bold: true },
      { text: String(sums.otDays), alignment: 'right', bold: true },
      { text: `${sums.otMin} Minutes`, alignment: 'right', bold: true },
      { text: `${fmtHM(sums.otMin)} Hours`, alignment: 'right', bold: true },
    ]);
  }


  const kpiBlock = SHOW_KPIS ? {
    columns: [
      kpiCard('Total Employees', totalEmps, [0, 0, 6, 10], THEME.gray700),
      kpiCard('Working Days (Mon–Sat)', workingDays, [6, 0, 6, 10], THEME.gray700),
      kpiCard('Present Rate', `${presentRate}%`, [6, 0, 6, 10], THEME.success),
      kpiCard('Avg OT / Employee', `${avgOTPerEmpHM} Hours (${avgOTPerEmpMin}Min)`, [6, 0, 0, 10], THEME.gray600),
    ],
    columnGap: 6,
  } : null;


  // inside buildDocDefinition
  const statusChip = (status) => {
    const map = {
      PRESENT: { bg: '#dcfce7', fg: THEME.success },   // green-100
      ABSENT: { bg: '#fee2e2', fg: '#ef4444' },       // red-100
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

  // detail sections (unbreakable)
  const detailSections = agg.map(a => {
    // per-employee totals for the footer row
    const presentDays = a.days.filter(d => d.status === 'PRESENT').length;
    const absentDays = a.days.length - presentDays;   // since every working day is either present or absent here
    const otMinSum = a.days.reduce((s, d) => s + (d.otMinutes || 0), 0);

    // build body rows (header + daily rows)
    const body = [
      [
        { text: 'Date', style: 'thLeft' },
        { text: 'Day', style: 'thCenter' },
        { text: 'OT (H:MM)', style: 'thCenter' },
        { text: 'Status', style: 'thCenter' },
      ],
      ...a.days.map(d => ([
        { text: d.date, margin: [6, 2, 2, 2] },
        { text: d.day, alignment: 'center' },
        { text: d.otMinutes > 0 ? fmtHM(d.otMinutes) : '-', alignment: 'center' },
        statusChip(d.status),
      ])),
    ];

    // append the footer/totals row (one cell per column)
    body.push([
      { text: `Working Days: ${a.workingDays}`, bold: true, alignment: 'left', margin: [6, 3, 2, 3] },
      { text: `Present: ${presentDays}`, bold: true, alignment: 'center', margin: [6, 3, 2, 3] },
      { text: `Total OT: \n ${fmtHMVerbose(otMinSum)}`, bold: true, alignment: 'center' },
      { text: `Absent: ${absentDays}`, bold: true, alignment: 'center', margin: [6, 3, 2, 3] },
    ]);

    return {
      unbreakable: true,
      stack: [
        { text: a.name, style: 'empName' },
        {
          table: {
            headerRows: 1,
            widths: [90, 60, 100, '*'], // Date, Day, OT, Status
            body,
          },
          layout: {
            // Header, zebra rows, and highlighted totals row
            fillColor: (row, node) => {
              if (row === 0) return THEME.gray100; // header
              if (row === node.table.body.length - 1) return '#eef2ff'; // totals row highlight
              return row % 2 === 0 ? null : '#fafafa';
            },
            hLineColor: () => THEME.gray200,
            vLineColor: () => THEME.gray200,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
          fontSize: 9,
          dontBreakRows: true,
          keepWithHeaderRows: 1,
          margin: [0, 0, 0, 20],
        },
      ],
    };
  });



  return {
    pageMargins: [28, 52, 28, 40],
    header: {
      columns: [
        { text: title, color: 'white', margin: [16, 10, 0, 10], fontSize: 14, bold: true },
        { width: '*', text: '' },
        { width: 220, text: subtitle, color: '#32bfff', fontSize: 9, alignment: 'right', margin: [0, 10, 16, 10] }
      ],
      fillColor: THEME.primary
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Generated: ${new Date().toLocaleString('en-IN', { timeZone: ZONE })}`, color: THEME.gray600, fontSize: 8, margin: [28, 10, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', color: THEME.gray600, fontSize: 8, margin: [0, 10, 28, 0] },
      ]
    }),
    content: [
      { text: `Accountant Monthly Summary - ${monthName}`, style: 'h2', margin: [0, 8, 0, 12] },
      ...(SHOW_KPIS ? [kpiBlock] : []),
      {
        table: {
          headerRows: 1,
          widths: ['*', 50, 50, 50, 50, 70, 70],
          body: [summaryHeader, ...summaryRows],
        },
        layout: {
          fillColor: (row) => row === 0 ? THEME.gray100 : (row % 2 === 0 ? null : '#fafafa'),
          hLineColor: () => THEME.gray200,
          vLineColor: () => THEME.gray200,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
        dontBreakRows: true,
        keepWithHeaderRows: 1,
        margin: [0, 0, 0, 8],
      },
      { text: `Employees: ${totalEmps}`, color: THEME.gray600, fontSize: 9 },
      // Details (on a fresh page with a hero heading if you like)
      { text: 'Details by Employee', fontSize: 24, bold: true, alignment: 'center', pageBreak: 'before', margin: [0, 20, 0, 10] },
      ...detailSections,
    ],
    styles: {
      h2: { fontSize: 13, bold: true, color: THEME.gray700 },
      thLeft: { bold: true, color: THEME.gray700 },
      thCenter: { bold: true, color: THEME.gray700, alignment: 'center' },
      thNum: { bold: true, color: THEME.gray700, alignment: 'right' },
      empName: { fontSize: 11, bold: true, color: THEME.gray700, margin: [0, 8, 0, 4] },
      kpiTitle: { fontSize: 9, color: THEME.gray600, margin: [0, 2, 0, 0] },
      kpiValue: { fontSize: 18, bold: true, color: THEME.gray700 },
    },
    defaultStyle: { font: 'Helvetica', fontSize: 10 },
  };
}

// ===== main =====
export async function generateAccountantMonthlyPDF({ when = DateTime.now().setZone(ZONE) } = {}) {
  const { start, end } = getPreviousMonthRange(when);
  const dates = monthWorkingDates(start, end);
  const startStr = ymd(start), endStr = ymd(end);

  const rows = await fetchRows(startStr, endStr);

  if (!rows.length) {
    if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
    const emptyPath = path.join(REPORT_DIR, `accountant_monthly_${start.toFormat('yyyy-LL')}_EMPTY.pdf`);
    fs.writeFileSync(emptyPath, 'No data');
    return { outPath: emptyPath, startStr, endStr, filename: path.basename(emptyPath), agg: [] };
  }

  const agg = buildAggregates(rows, dates);

  const monthName = start.toFormat('LLLL yyyy');
  const title = `Monthly Attendance (Accountant) - ${monthName}`;
  const subtitle = `Month: ${monthName} • Working days (Mon-Sat): ${dates.length}`;

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const filename = `accountant_monthly_${start.toFormat('yyyy-LL')}.pdf`;
  const outPath = path.join(REPORT_DIR, filename);

  const printer = new PdfPrinter(FONTS);
  const docDefinition = buildDocDefinition({ title, subtitle, agg, monthName });

  await new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const stream = fs.createWriteStream(outPath);
    pdfDoc.pipe(stream);
    pdfDoc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { outPath, startStr, endStr, filename, agg, workingDays: dates.length, monthName };
}
