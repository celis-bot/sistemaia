import env from '../config/env.js';

const wTasks = env.WEIGHT_TASKS;
const wAtt = env.WEIGHT_ATTENDANCE;
const wPunct = env.WEIGHT_PUNCTUALITY;
const total = wTasks + wAtt + wPunct || 1;

// Normaliza un valor a 0..1
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

// tasksScore: 0..1 (entregas completadas / total)
// attendanceScore: 0..1 (asistencias / clases)
// punctualityScore: 0..1 (entregas a tiempo / total entregas) - opcional
export function computePerformance({ tasksScore, attendanceScore, punctualityScore = 0 }) {
  const score =
    (clamp01(tasksScore) * wTasks +
      clamp01(attendanceScore) * wAtt +
      clamp01(punctualityScore) * wPunct) / total;

  const grade = score >= 0.9 ? 'A' : score >= 0.8 ? 'B' : score >= 0.7 ? 'C' : score >= 0.6 ? 'D' : 'F';
  return { score: Number(score.toFixed(4)), grade };
}

// Agrega filas de entregas por alumno
export function aggregateDeliveries(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.student_name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        student_name: r.student_name.trim(),
        total: 0,
        delivered: 0,
        on_time: 0,
        grades: [],
      });
    }
    const agg = map.get(key);
    agg.total += 1;
    const status = (r.status || '').toLowerCase();
    if (status.includes('entreg') || status.includes('complet') || status === 'si' || status === 'ok') {
      agg.delivered += 1;
      const late = status.includes('tarde') || status.includes('atras');
      if (!late) agg.on_time += 1;
    }
    if (r.grade != null && !Number.isNaN(r.grade)) agg.grades.push(r.grade);
  }

  return [...map.values()].map((a) => ({
    student_name: a.student_name,
    total_tasks: a.total,
    delivered_tasks: a.delivered,
    on_time_tasks: a.on_time,
    avg_grade: a.grades.length ? a.grades.reduce((s, g) => s + g, 0) / a.grades.length : null,
    tasks_score: a.total ? a.delivered / a.total : 0,
    punctuality_score: a.delivered ? a.on_time / a.delivered : 0,
  }));
}
