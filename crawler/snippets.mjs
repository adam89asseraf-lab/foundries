// Browser snippets. The first three are appendix B verbatim (kept for reference / manual use in a console);
// the functions below are the same logic, parameterised for the crawler, and run via page.evaluate().

export const ANIMATION_SNIPPET = `document.getAnimations().forEach(a=>{try{a.finish()}catch(e){}}); document.querySelectorAll('video').forEach(v=>{v.muted=true;v.play().catch(()=>{})}); 1`;

export const TYPE_SNIPPET = `(()=>{document.getAnimations().forEach(a=>{try{a.finish()}catch(e){}});const vis=e=>{const s=getComputedStyle(e);return s.visibility!=='hidden'&&+s.opacity>0.2&&s.display!=='none'};const words=/\\p{L}{3,}/u;let best=null,bs=0,inView=0;for(const e of document.querySelectorAll('body *')){const t=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()||((e.tagName==='TEXTAREA'||e.tagName==='INPUT')?e.value:'');if(!words.test(t))continue;const r=e.getBoundingClientRect();if(r.width<60||r.height<24||!vis(e))continue;const fs=parseFloat(getComputedStyle(e).fontSize);if(r.top>=40&&r.bottom<=innerHeight&&fs>inView)inView=fs;if(fs>bs){bs=fs;best=e}}if(inView<48&&best){window.scrollBy(0,best.getBoundingClientRect().top-140);return 'scrolled to '+bs+'px: '+best.textContent.slice(0,30)}return 'ok '+inView})()`;

export const DISCOVERY_SNIPPET = `(()=>{const o=location.origin;const L=[...document.querySelectorAll('a[href]')].map(a=>{try{const u=new URL(a.href,location.href);return {u:u.origin+u.pathname.replace(/\\/$/,''),t:(a.innerText||a.getAttribute('aria-label')||a.title||'').trim().replace(/\\s+/g,' ').slice(0,50)}}catch(e){return null}}).filter(x=>x&&x.u.startsWith(o)&&x.u!==o);const g={};for(const x of L){const p=x.u.slice(o.length).split('/').filter(Boolean);if(p.length<2)continue;const k=p.slice(0,-1).join('/');const m=(g[k]=g[k]||new Map());if(!m.get(x.u))m.set(x.u,x.t)}const kw=/font|type|famil|product|collection|catalog|retail|^l$/i;return JSON.stringify(Object.entries(g).map(([k,m])=>({k,n:m.size,s:m.size*(kw.test(k)?3:1),links:[...m].slice(0,300).map(([u,t])=>u.slice(o.length).split('/').pop()+'|'+t)})).sort((a,b)=>b.s-a.s).slice(0,3))})()`;

/* ---------------- page.evaluate() functions ---------------- */

/** Animation snippet: finish CSS/Web animations, start muted videos. */
export function finishAnimations() {
  document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });
  document.querySelectorAll("video").forEach(v => { v.muted = true; v.play().catch(() => {}); });
  return 1;
}

/** Hide cookie/consent banners (never accept them). */
export function hideCookieBanners() {
  const re = /cookie|consent|privacy|gdpr/i;
  const known = "#onetrust-consent-sdk,#onetrust-banner-sdk,#CybotCookiebotDialog,#usercentrics-root,#cookiescript_injected,.cc-window,.cc-banner,#cmplz-cookiebanner-container,.cmplz-cookiebanner,#cookie-law-info-bar,.termly-styles-root,#termly-code-snippet-support,[id*='cookie' i][class*='banner' i],[class*='cookie-banner' i],[class*='CookieBanner'],#hs-eu-cookie-confirmation,.fc-consent-root,#didomi-host,#truste-consent-track,.osano-cm-window,#iubenda-cs-banner,#axeptio_overlay";
  let hidden = 0;
  document.querySelectorAll(known).forEach(e => { e.style.setProperty("display", "none", "important"); hidden++; });
  for (const e of document.querySelectorAll("body *")) {
    const s = getComputedStyle(e);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    const t = (e.innerText || "").slice(0, 3000);
    if (t.length < 2000 && re.test(t)) { e.style.setProperty("display", "none", "important"); hidden++; }
  }
  if (hidden) {
    // banners often lock scrolling
    for (const n of [document.documentElement, document.body]) { n.style.setProperty("overflow", "auto", "important"); n.style.setProperty("position", "static", "important"); }
  }
  return hidden;
}

/** Type snippet: if no large word-text in view, scroll to the largest word-text on the page. */
export function typeSnippet() {
  document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });
  const vis = e => { const s = getComputedStyle(e); return s.visibility !== "hidden" && +s.opacity > 0.2 && s.display !== "none"; };
  const words = /\p{L}{3,}/u;
  let best = null, bs = 0, inView = 0;
  for (const e of document.querySelectorAll("body *")) {
    const t = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim() || ((e.tagName === "TEXTAREA" || e.tagName === "INPUT") ? e.value : "");
    if (!words.test(t)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 60 || r.height < 24 || !vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (r.top >= 40 && r.bottom <= innerHeight && fs > inView) inView = fs;
    if (fs > bs) { bs = fs; best = e; }
  }
  if (inView < 48 && best) { window.scrollBy(0, best.getBoundingClientRect().top - 140); return "scrolled to " + bs + "px: " + best.textContent.slice(0, 30); }
  return "ok " + inView;
}

/**
 * Quality check for a font shot. Returns { ok, score, fs, family, reasons[] }.
 *  - large text: visible element in the viewport, font-size >= 48px, own text matches \p{L}{3,}
 *  - not an image: element at the viewport centre is not an img/video/canvas covering > 60% of the viewport
 *  - the font itself: the large text's computed font-family is not a generic/system font
 */
export function qualityCheck() {
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|blinkmacsystemfont|arial|helvetica|helvetica neue|times|times new roman|georgia|verdana|tahoma|segoe ui|roboto|courier|courier new|inherit|initial)$/i;
  const words = /\p{L}{3,}/u;
  const vis = e => { const s = getComputedStyle(e); return s.visibility !== "hidden" && +s.opacity > 0.2 && s.display !== "none"; };
  const W = innerWidth, H = innerHeight, reasons = [];
  let big = null, fs = 0;
  for (const e of document.querySelectorAll("body *")) {
    const t = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim() || ((e.tagName === "TEXTAREA" || e.tagName === "INPUT") ? e.value : "");
    if (!words.test(t)) continue;
    const r = e.getBoundingClientRect();
    if (r.bottom < 40 || r.top > H - 40 || r.right < 0 || r.left > W || r.width < 60) continue;
    if (!vis(e)) continue;
    const f = parseFloat(getComputedStyle(e).fontSize);
    // prefer text whose box is mostly in view
    const inV = (Math.min(r.bottom, H) - Math.max(r.top, 0)) / Math.max(1, r.height);
    if (f >= 48 && inV >= 0.5 && f > fs) { fs = f; big = e; }
  }
  const largeText = !!big;
  if (!largeText) reasons.push("no large text");

  let notImage = true;
  const c = document.elementFromPoint(W / 2, H / 2);
  for (let n = c, d = 0; n && d < 4; n = n.parentElement, d++) {
    if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(n.tagName)) {
      const r = n.getBoundingClientRect();
      const area = (Math.min(r.right, W) - Math.max(r.left, 0)) * (Math.min(r.bottom, H) - Math.max(r.top, 0));
      if (area > 0.6 * W * H) { notImage = false; reasons.push("centre is a large " + n.tagName.toLowerCase()); }
      break;
    }
  }

  let family = "", ownFont = false;
  if (big) {
    family = getComputedStyle(big).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    ownFont = !GENERIC.test(family);
    if (!ownFont) reasons.push("generic font " + family);
  }
  const ok = largeText && notImage && ownFont;
  const score = (largeText ? 4 : 0) + (notImage ? 2 : 0) + (ownFont ? 1 : 0) + Math.min(fs, 400) / 1000;
  return { ok, score, fs, family, reasons };
}

/** Fallback: scroll to a "type tester" (input/textarea/contenteditable set large). */
export function scrollToTypeTester() {
  const cands = [...document.querySelectorAll("textarea, input[type=text], input:not([type]), [contenteditable=''], [contenteditable=true]")]
    .map(e => ({ e, fs: parseFloat(getComputedStyle(e).fontSize), r: e.getBoundingClientRect() }))
    .filter(x => x.fs >= 40 && x.r.width > 200 && x.r.height > 30)
    .sort((a, b) => b.fs - a.fs);
  if (!cands.length) return false;
  window.scrollBy(0, cands[0].r.top - 140);
  return cands[0].fs;
}

/**
 * Discovery snippet, generalised: group same-site links by parent path.
 * Returns ALL groups (not just top 3) with full URLs and link text, plus nav links.
 */
export function discoverLinks() {
  const o = location.origin;
  const L = [...document.querySelectorAll("a[href]")].map(a => {
    try {
      const u = new URL(a.href, location.href);
      return { u: u.origin + u.pathname.replace(/\/$/, ""), t: (a.innerText || a.getAttribute("aria-label") || a.title || "").trim().replace(/\s+/g, " ").slice(0, 120) };
    } catch (e) { return null; }
  }).filter(x => x && x.u.startsWith(o) && x.u !== o);
  const g = {};
  for (const x of L) {
    const p = x.u.slice(o.length).split("/").filter(Boolean);
    if (p.length < 2) continue;
    const k = p.slice(0, -1).join("/");
    const m = (g[k] = g[k] || new Map());
    if (!m.get(x.u)) m.set(x.u, x.t);
    if (p.length >= 3) { // id-style paths: /typefaces/22789/wet-letters
      const m2 = (g[p[0] + "/*"] = g[p[0] + "/*"] || new Map());
      if (!m2.get(x.u)) m2.set(x.u, x.t);
    }
  }
  const kw = /font|type|famil|product|collection|catalog|retail|fonderie|^l$|(^|\/)(shop|store|p)(\/|$)/i;
  const groups = Object.entries(g).map(([k, m]) => ({ k, n: m.size, kw: kw.test(k), s: m.size * (kw.test(k) ? 3 : 1), links: [...m].map(([u, t]) => ({ u, t })) }))
    .sort((a, b) => b.s - a.s);
  const nav = [...document.querySelectorAll("a[href]")].map(a => ({ u: a.href, t: (a.innerText || "").trim().replace(/\s+/g, " ") }))
    .filter(x => /^(fonts|typefaces|catalogue|catalog|shop|retail|library|all fonts|all typefaces|type)$/i.test(x.t));
  return { origin: o, groups, nav, all: L, shopify: !!window.Shopify };
}

/** Visible page text for categorising (headings first). */
export function pageText() {
  const pick = sel => [...document.querySelectorAll(sel)].map(e => e.innerText || "").join("\n");
  const meta = [...document.querySelectorAll("meta[name=description],meta[property='og:description'],meta[property='og:title']")].map(m => m.content || "").join("\n");
  return {
    title: document.title || "",
    h1: (document.querySelector("h1")?.innerText || "").trim().slice(0, 120),
    head: (meta + "\n" + pick("h1,h2,h3")).slice(0, 4000),
    body: (document.body?.innerText || "").slice(0, 30000),
  };
}

/**
 * Bot-block / challenge page detector. Returns a short reason string, or null when the page looks real.
 * Catches interstitials served with HTTP 200 and normal titles, including block overlays on top of a real page.
 */
export function blockCheck() {
  const RE = /access (is )?(restricted|denied)|you have been blocked|you('ve| have) been blocked|attention required|verify (you are|that you are|you're) (a )?human|are you a robot|not a robot|(?<!re)captcha(?! badge)|request (blocked|unsuccessful)|unusual traffic|security check|checking (your|if the site connection is secure)|ddos protection|bot (detection|protection)|enable javascript and cookies to continue|pardon our interruption|why have i been blocked|sorry, you have been blocked/i;
  const sel = '#challenge-form,#challenge-running,#cf-wrapper,.cf-error-details,#px-captcha,iframe[src*="captcha"],iframe[src*="challenges.cloudflare.com"],iframe[src*="hcaptcha"],[id*="captcha" i]:not(script)';
  // big enough to be the page's main content (the small reCAPTCHA v3 badge on normal sites doesn't count)
  const hit = [...document.querySelectorAll(sel)].find(e => { const r = e.getBoundingClientRect(); return r.width > 250 && r.height > 120 && !/recaptcha/i.test(e.getAttribute("src") || "") ; });
  if (hit) return "challenge element " + (hit.id || hit.tagName.toLowerCase());
  const body = (document.body?.innerText || "").trim();
  const head = document.title + "\n" + body.slice(0, 3000);
  if (body.length < 4000 && RE.test(head)) return "block text: " + (head.match(RE) || [""])[0];
  // an overlay in the middle of the screen that says we're blocked
  const W = innerWidth, H = innerHeight;
  for (const [x, y] of [[W / 2, H / 2], [W / 2, H / 3]]) {
    for (let n = document.elementFromPoint(x, y), d = 0; n && d < 8; n = n.parentElement, d++) {
      const t = (n.innerText || "").slice(0, 2000);
      if (t.length < 1500 && RE.test(t)) return "block overlay: " + (t.match(RE) || [""])[0];
    }
  }
  return null;
}
