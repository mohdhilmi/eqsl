// Excel export helpers using ExcelJS.

const ExcelJS = require('exceljs');
const { formatMs } = require('./ranking');

async function buildResultsWorkbook({ title, categoryName, disciplineName, round, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'eQSL';
  const ws = wb.addWorksheet('Results');

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14 };

  ws.getCell('A2').value = 'Category:';
  ws.getCell('B2').value = categoryName;
  ws.getCell('A3').value = 'Discipline:';
  ws.getCell('B3').value = disciplineName;
  ws.getCell('A4').value = 'Round:';
  ws.getCell('B4').value = round;

  ws.addRow([]);
  const header = ['Rank', 'Bib', 'Name', 'Gender', 'School', 'Attempts (1/2/3)', 'Best Time'];
  const headerRow = ws.addRow(header);
  headerRow.font = { bold: true };

  for (const r of rows) {
    ws.addRow([
      r.rank ?? 'DNF',
      r.bib_no || '',
      r.full_name,
      r.gender || '',
      r.school || '',
      r.attempts.map((a) => formatMs(a)).join(' / '),
      formatMs(r.best_ms),
    ]);
  }

  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value ? String(cell.value) : '';
      if (v.length > max) max = v.length;
    });
    col.width = max + 2;
  });

  return wb;
}

module.exports = { buildResultsWorkbook };
