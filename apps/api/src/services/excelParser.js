import ExcelJS from 'exceljs';
import { badRequest } from '../lib/errors.js';

// Parsea el Excel de entregas de tareas.
// Formato esperado: primera fila = encabezados; debe incluir columnas tipo
// "Alumno"/"Estudiante"/"Nombre" y "Entrega"/"Estado"/"Calificacion".
// Se detectan columnas por nombre de forma tolerante.
const NAME_KEYS = ['alumno', 'estudiante', 'nombre', 'alumno(a)', 'student'];
const STATUS_KEYS = ['estado', 'entrega', 'estatus', 'entregado', 'status'];
const DATE_KEYS = ['fecha', 'fecha entrega', 'fecha_entrega', 'due', 'entrega fecha'];
const GRADE_KEYS = ['calificacion', 'nota', 'puntuacion', 'score', 'puntos'];

function findCol(headers, keys) {
  return headers.findIndex((h) => keys.some((k) => String(h).toLowerCase().includes(k)));
}

export async function parseDeliveriesExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw badRequest('El archivo no es un Excel .xlsx valido');
  }

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) throw badRequest('El Excel esta vacio');

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });

  const nameIdx = findCol(headers, NAME_KEYS);
  const statusIdx = findCol(headers, STATUS_KEYS);
  const dateIdx = findCol(headers, DATE_KEYS);
  const gradeIdx = findCol(headers, GRADE_KEYS);

  if (nameIdx === -1) throw badRequest('No se encontro columna de alumno/estudiante en el Excel');
  if (statusIdx === -1 && gradeIdx === -1) {
    throw badRequest('No se encontro columna de entrega/estado/calificacion');
  }

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = String(row.getCell(nameIdx + 1).value ?? '').trim();
    if (!name) return;
    rows.push({
      student_name: name,
      status: statusIdx !== -1 ? String(row.getCell(statusIdx + 1).value ?? '').trim() : null,
      delivery_date: dateIdx !== -1 ? row.getCell(dateIdx + 1).value : null,
      grade: gradeIdx !== -1 ? Number(row.getCell(gradeIdx + 1).value) || null : null,
    });
  });

  return { headers, rows };
}
