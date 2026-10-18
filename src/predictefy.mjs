// A small Predictefy client: reads the key from the environment or .env, paces requests, retries the ones worth
// retrying, and counts what every response says it cost.
import {existsSync, readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const project = fileURLToPath(new URL('../', import.meta.url));
export const BASE = 'https://data.predictefy.com';
export const UPGRADE_URL = 'https://predictefy.com/en/pricing?utm_source=youtube&utm_medium=video&utm_campaign=why-polymarket-traders-lose&utm_content=upgrade';
export const KEYS_URL = 'https://portal.predictefy.com/keys';

const envFile = resolve(project, '.env');
export const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const unset = value => !value || /your[_ ]key|paste|example/i.test(value);

export function loadKey() {
  const key = [process.env.PREDICTEFY_API_KEY, local.PREDICTEFY_API_KEY].find(value => !unset(value));
  if (!key) {
    console.error(`Set PREDICTEFY_API_KEY in .env before starting. Create a key at ${KEYS_URL}`);
    process.exit(1);
  }
  return key;
}

export class PlanError extends Error {}

const sleep = ms => new Promise(done => setTimeout(done, ms));

// requestsPerMinute keeps the whole run under the plan's limit (the free plan allows 60 a minute).
export function createClient({key, requestsPerMinute = 50, onRequest} = {}) {
  const gap = 60000 / requestsPerMinute;
  const usage = {requests: 0, credits: 0, byStep: {}};
  let nextSlot = 0;
  async function get(step, path, params = {}) {
    const url = new URL(path, BASE);
    for (const [name, value] of Object.entries(params)) if (value !== null && value !== undefined) url.searchParams.set(name, String(value));
    for (let attempt = 0; ; attempt++) {
      // Calls made at the same time each take the next free slot, so they leave one gap apart.
      const slot = Math.max(Date.now(), nextSlot); nextSlot = slot + gap;
      if (slot > Date.now()) await sleep(slot - Date.now());
      let response, body = {};
      try {
        response = await fetch(url, {headers: {authorization: `Bearer ${key}`, accept: 'application/json'}, signal: AbortSignal.timeout(45000), redirect: 'error'});
        body = await response.json().catch(() => ({}));
      } catch (error) {
        if (attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
        throw new Error(`No answer from Predictefy for ${path}: ${error.message}`);
      }
      const charged = Number(response.headers.get('x-credits-charged') || 0);
      const bucket = usage.byStep[step] ||= {requests: 0, credits: 0};
      usage.requests++; usage.credits += charged; bucket.requests++; bucket.credits += charged;
      onRequest?.({step, path, status: response.status, charged});
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        await sleep((Number(response.headers.get('retry-after')) || 5 * (attempt + 1)) * 1000);
        continue;
      }
      const code = body.error?.code || (response.ok ? null : 'API_ERROR');
      // Out of credits, or a feature the plan does not include: stop and say where to change it.
      if (response.status === 402 || (response.status === 403 && code === 'PLAN_REQUIRED')) {
        throw new PlanError(`${response.status === 402 ? 'This key is out of credits for the month.' : 'This plan does not include that request.'} Plans: ${UPGRADE_URL}`);
      }
      if (response.status === 401) throw new Error(`Predictefy rejected the key (401). Check PREDICTEFY_API_KEY in .env, or create a key at ${KEYS_URL}`);
      return {ok: response.ok && body.success !== false, status: response.status, code, data: body.data, nextCursor: body.nextCursor ?? body.page?.nextCursor ?? null, meta: body.meta};
    }
  }
  return {get, usage};
}

// Runs `work` over `items`, a few at a time.
export async function pool(items, size, work) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(size, items.length)}, async () => {
    while (next < items.length) { const index = next++; await work(items[index], index); }
  }));
}
