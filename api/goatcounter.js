// GoatCounter proxy with rate-limit handling (Vercel Function / Node.js 24)
const GOAT_API_KEY = "8cffk6qxqkaq1bf6zump5wj4p1mevmqnqwbdz41faqgjntinrus";
const BASE = "https://ottakubrasil.goatcounter.com/api/v0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);

async function fetchJson(path, attempt = 0) {
  const res = await fetch(BASE + path, {
    headers: {
      Authorization: "Bearer " + GOAT_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  const isRate = res.status === 429 || /rate\s*limit/i.test(text);

  if (isRate && attempt < 4) {
    const m = text.match(/try again in\s*([0-9.]+)ms/i);
    const wait = m ? Math.ceil(parseFloat(m[1]) + 120) : 350;
    await sleep(wait);
    return fetchJson(path, attempt + 1);
  }

  if (!res.ok) return { __error: true, status: res.status, body: text.slice(0, 300) };
  if (!ct.includes("application/json")) return { __error: true, status: 500, body: text.slice(0, 300) };

  try {
    return JSON.parse(text);
  } catch {
    return { __error: true, status: 500, body: text.slice(0, 300) };
  }
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const raw = url.searchParams.get("range") || "7";
      const range = Math.min(Math.max(parseInt(raw, 10) || 7, 1), 30);

      // GoatCounter uses end as EXCLUSIVE. So: [start, end)
      const todayD = new Date();
      const tomorrowD = new Date(todayD);
      tomorrowD.setDate(todayD.getDate() + 1);

      const startD = new Date(todayD);
      startD.setDate(todayD.getDate() - (range - 1));

      const start = iso(startD);
      const endExclusive = iso(tomorrowD);

      const today = iso(todayD);
      const yesterdayD = new Date(todayD);
      yesterdayD.setDate(todayD.getDate() - 1);
      const yesterday = iso(yesterdayD);

      // Períodos:
      // - Range: start .. tomorrow
      // - Today: today .. tomorrow
      // - Yesterday: yesterday .. today
      const totals = await fetchJson(`/stats/total?start=${start}&end=${endExclusive}`); await sleep(140);

      const dailyChart = await fetchJson(`/stats/hits?start=${start}&end=${endExclusive}&daily=1&limit=1`); await sleep(140);
      const pages = await fetchJson(`/stats/hits?start=${start}&end=${endExclusive}&limit=50`); await sleep(140);

      const toprefs = await fetchJson(`/stats/toprefs?start=${start}&end=${endExclusive}&limit=10`); await sleep(140);
      const browsers = await fetchJson(`/stats/browsers?start=${start}&end=${endExclusive}&limit=10`); await sleep(140);
      const systems = await fetchJson(`/stats/systems?start=${start}&end=${endExclusive}&limit=10`); await sleep(140);
      const locations = await fetchJson(`/stats/locations?start=${start}&end=${endExclusive}&limit=10`); await sleep(140);
      const sizes = await fetchJson(`/stats/sizes?start=${start}&end=${endExclusive}&limit=10`); await sleep(140);

      const todayHourly = await fetchJson(`/stats/hits?start=${today}&end=${endExclusive}&daily=1&limit=1`); await sleep(140);
      const yestHourly = await fetchJson(`/stats/hits?start=${yesterday}&end=${today}&daily=1&limit=1`);

      const blocks = { totals, dailyChart, pages, toprefs, browsers, systems, locations, sizes, todayHourly, yestHourly };
      const errors = Object.entries(blocks)
        .filter(([, v]) => v && v.__error)
        .map(([k, v]) => ({ key: k, status: v.status, message: v.body }));

      for (const k of Object.keys(blocks)) {
        if (blocks[k] && blocks[k].__error) blocks[k] = null;
      }

      const body = JSON.stringify({
        totals: blocks.totals,
        range,
        start,
        end: endExclusive,
        dailyChart: blocks.dailyChart,
        pages: blocks.pages,
        toprefs: blocks.toprefs,
        browsers: blocks.browsers,
        systems: blocks.systems,
        locations: blocks.locations,
        sizes: blocks.sizes,
        today,
        yesterday,
        todayHourly: blocks.todayHourly,
        yestHourly: blocks.yestHourly,
        errors,
      });

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e?.message || String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  },
};
