import env from '../config/env.js';
import { logger } from '../lib/logger.js';
import { upstream, badRequest } from '../lib/errors.js';

// Cliente para Conecta UACJ (scraping con Playwright).
// Ajusta los selectores en .env segun el HTML real del portal.
export async function fetchAttendance({ studentId, period } = {}) {
  if (!env.CONECTA_USER || !env.CONECTA_PASS) {
    throw badRequest('Credenciales de Conecta UACJ no configuradas');
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw upstream('Playwright no instalado. Ejecuta: npx playwright install chromium');
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(env.CONECTA_UACJ_URL, { waitUntil: 'networkidle', timeout: 30000 });

    await page.fill(env.CONECTA_USER_SELECTOR, env.CONECTA_USER);
    await page.fill(env.CONECTA_PASS_SELECTOR, env.CONECTA_PASS);
    await page.click(env.CONECTA_SUBMIT_SELECTOR);
    await page.waitForLoadState('networkidle');

    // Consulta opcional por estudiante / periodo (URLs/parametros reales por definir)
    if (studentId) {
      const search = page.locator('input[name="buscar"], input[type="search"]').first();
      if (await search.count()) {
        await search.fill(String(studentId));
        await search.press('Enter');
        await page.waitForLoadState('networkidle');
      }
    }

    const rows = await page.$$eval(`${env.CONECTA_TABLE_SELECTOR} tbody tr`, (trs) =>
      trs.map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => td.innerText.trim()),
      ),
    );

    const attendance = rows
      .map((cols) => ({
        fecha: cols[0] || null,
        materia: cols[1] || null,
        estado: cols[2] || null,
        justificacion: cols[3] || null,
        raw: cols,
      }))
      .filter((r) => r.fecha);

    return { student_id: studentId ?? null, period: period ?? null, records: attendance, count: attendance.length };
  } catch (err) {
    logger.error({ err }, 'Error consultando Conecta UACJ');
    throw upstream('No se pudo consultar Conecta UACJ', { cause: err.message });
  } finally {
    await browser.close();
  }
}
