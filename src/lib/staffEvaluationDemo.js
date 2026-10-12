/**
 * ДЕМО-РЕЗУЛЬТАТЫ «Оценки сотрудников» для макета (пока нет настоящих опросов).
 * После первого настоящего опроса поставить DEMO_RESULTS = false — демо-оценки исчезнут, останутся только реальные.
 */
export const DEMO_RESULTS = true;

// имя (нижний регистр) → { общий балл, сколько человек оценило }.
const DEMO_SCORES = {
  'laylo qosimxonova': { overall: 4.9, people: 2 },
  'ms kristina': { overall: 8.4, people: 4 },
  'ms ziyoda': { overall: 9.1, people: 3 },
  'rushana karimxodjayeva': { overall: 7.3, people: 2 },
  'ms osuda': { overall: 6.7, people: 3 },
  'ms shaxzoda': { overall: 5.2, people: 4 },
};

const RATERS = [
  { name: 'Doniyor Shavkatov', raterRole: 'colleague' },
  { name: 'Zilola', raterRole: 'client' },
  { name: 'Humoyun', raterRole: 'client' },
  { name: 'Rushana Karimxodjayeva', raterRole: 'colleague' },
];
const DAYS_AGO = [1, 3, 6, 9];
const COMMENTS = ['', "Juda yaxshi o'qituvchi", '', 'Hurmatli va tushunarli'];
const QUESTION_COUNT = 6;

/** Сумма баллов по 6 вопросам → шесть оценок из шкалы 0–10 без 7, дающие эту сумму. */
export function spreadTotal(total) {
  const base = Math.floor(total / QUESTION_COUNT);
  const rest = total - base * QUESTION_COUNT;
  const vals = Array.from({ length: QUESTION_COUNT }, (_, i) => base + (i < rest ? 1 : 0));
  // 7 в шкале нет: пары 7 → 6 и 8 (сумма не меняется), одиночную 7 меняем вместе с соседним значением.
  for (let i = 0; i < vals.length; i += 1) {
    if (vals[i] !== 7) continue;
    const j = vals.findIndex((v, k) => k !== i && v === 7);
    if (j !== -1) {
      vals[i] = 8;
      vals[j] = 6;
    } else {
      const k = vals.findIndex((v, idx) => idx !== i && v >= 9);
      if (k !== -1) {
        vals[i] = 8;
        vals[k] -= 1;
      } else {
        const m = vals.findIndex((v, idx) => idx !== i && v <= 6);
        vals[i] = 8;
        if (m !== -1) vals[m] -= 1;
      }
    }
  }
  return vals;
}

/**
 * Демо-оценки для сотрудников из списка (по имени); у остальных — ничего.
 * @param {{id: string, fullName: string}[]} members
 * @returns {Object[]} документы в формате staffEvaluations (+ demo: true)
 */
export function buildDemoEvaluations(members) {
  if (!DEMO_RESULTS) return [];
  const out = [];
  for (const m of members) {
    const spec = DEMO_SCORES[(m.fullName ?? '').trim().toLowerCase()];
    if (!spec) continue;
    const total = Math.round(spec.overall * QUESTION_COUNT * spec.people);
    for (let k = 0; k < spec.people; k += 1) {
      // суммы оценивающих — ровно в среднем total / people, разбег ±1
      const share = Math.floor(total / spec.people) + (k < total % spec.people ? 1 : 0);
      const vals = spreadTotal(share);
      const rater = RATERS[k % RATERS.length];
      out.push({
        id: `demo-${m.id}-${k}`,
        demo: true,
        staffId: m.id,
        staffName: m.fullName,
        raterRole: rater.raterRole,
        ratings: Object.fromEntries(vals.map((v, i) => [i, v])),
        comment: COMMENTS[k % COMMENTS.length],
        createdBy: `demo-rater-${k}`,
        demoEvaluator: rater.name,
        createdAt: { toDate: () => new Date(Date.now() - DAYS_AGO[k % DAYS_AGO.length] * 86400000) },
      });
    }
  }
  return out;
}

/**
 * Оценки для экрана: настоящие + демо. У сотрудников из демо-набора настоящие оценки на время макета скрываются
 * (иначе они сложились бы с демо), у остальных остаются как есть.
 */
export function withDemoEvaluations(evaluations, members) {
  if (!DEMO_RESULTS) return evaluations;
  const demo = buildDemoEvaluations(members);
  const demoStaff = new Set(demo.map((e) => e.staffId));
  return [...evaluations.filter((e) => !demoStaff.has(e.staffId)), ...demo];
}
