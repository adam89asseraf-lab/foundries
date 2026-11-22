// For sites that only show prices after choosing a licence: pick the smallest/first licence option, then read prices.
// node scripts/price-interact.mjs id1 id2 ...
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, pool } from "../crawler/lib/browser.mjs";
import { hideCookieBanners, repeatedPrice } from "../crawler/snippets.mjs";

const ids = process.argv.slice(2);
const d = loadData();
const { browser, newContext } = await launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scrollAll = async p => {
  for (let i = 0; i < 25; i++) {
    const end = await p.evaluate(() => { scrollBy(0, innerHeight); return innerHeight + scrollY >= document.body.scrollHeight - 5; });
    await sleep(200);
    if (end && i > 3) break;
  }
  await sleep(600);
};

async function interact(p) {
  const did = [];
  for (const h of await p.$$("select")) {
    const ok = await h.evaluate(s => {
      const o = [...s.options].find(o => o.value && !/select|choose|please|--/i.test(o.text));
      if (!o) return null;
      s.value = o.value;
      s.dispatchEvent(new Event("input", { bubbles: true }));
      s.dispatchEvent(new Event("change", { bubbles: true }));
      return o.text.trim().slice(0, 30);
    }).catch(() => null);
    if (ok) did.push("select:" + ok);
  }
  const clicked = await p.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const re = /^(desktop( licen[cs]e)?|print( licen[cs]e)?|standard( licen[cs]e)?|basic( licen[cs]e)?|personal|individual|small( business)?|startup|1 (user|computer|seat|workstation)|1[-–]5 (users|computers|seats)|up to [1-5] (users|employees|computers)|freelancer|select a licen[cs]e|please select a licen[cs]e|choose licen[cs]e|licen[cs]e)$/i;
    const out = [];
    for (const e of [...document.querySelectorAll("button,[role=button],[role=option],label,li,a,div,span")].filter(vis)) {
      const t = (e.innerText || "").trim().split("\n")[0];
      if (t.length < 40 && re.test(t) && out.length < 3 && !e.closest("nav,header,footer")) { e.click(); out.push(t); }
    }
    for (const r of [...document.querySelectorAll("input[type=radio]")].filter(vis).slice(0, 1)) { r.click(); out.push("radio"); }
    return out;
  }).catch(() => []);
  did.push(...clicked);
  await sleep(2000);
  return did;
}

await pool(ids, 4, async id => {
  const f = d.fonts.find(x => x.foundryId === id && x.shotId) || { url: d.foundries.find(x => x.id === id).url, name: "(home)" };
  const ctx = await newContext();
  const p = await ctx.newPage();
  let line = `## ${id} — ${f.name}`;
  try {
    await open(p, f.url);
    await p.evaluate(hideCookieBanners).catch(() => {});
    const buy = await p.evaluate(() => [...document.querySelectorAll("a[href]")]
      .filter(a => a.host === location.host && /^(buy|buy now|buy fonts?|buy \w+|purchase|shop|buy edition|buying options|license|licen[cs]e this font)$/i.test((a.innerText || "").trim()) && !/licen[cs]es?\/?$|eula|terms/i.test(a.pathname))
      .map(a => a.href)[0]);
    if (buy) { await open(p, buy); await p.evaluate(hideCookieBanners).catch(() => {}); }
    const did = await interact(p); await scrollAll(p);
    const did2 = await interact(p); await scrollAll(p);
    const rep = await p.evaluate(repeatedPrice);
    const lines = await p.evaluate(() => [...new Set(document.body.innerText.split(/\n+/).map(s => s.trim())
      .filter(l => l.length < 120 && /([$€£₪]|\b(CHF|USD|EUR|GBP|ILS|NZD|SEK|DKK)\b)\s?\d|\d\s?([€₪]|\b(CHF|USD|EUR|GBP|ILS|NZD)\b)/.test(l)))].slice(0, 12));
    line += `\n  at: ${p.url().replace(/^https?:\/\/[^/]+/, "")}  clicked: ${[...did, ...did2].join(", ") || "-"}`
      + `\n  repeated: ${rep ? rep.price + " ×" + rep.count + " (" + rep.all + ")" : "-"}`
      + `\n  prices: ${lines.join(" ¦ ") || "-"}`;
  } catch (e) { line += " ERR " + e.message.slice(0, 80); }
  await ctx.close();
  console.log(line);
});
await browser.close();
