# One-off: appendix C page -> site/index.html (static, reads data/data.json + shots/).
import re, sys
s = open("scripts/original-index.html").read()
def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (s.count(old), old[:80])
    s = s.replace(old, new)
def cut(start, end, new="", keep_end=True):
    global s
    i = s.index(start); j = s.index(end, i)
    s = s[:i] + new + (s[j:] if keep_end else s[j+len(end):])

# ---- CSS additions
rep("@media (prefers-reduced-motion:reduce)", """.editlink{font:400 12px/1 var(--mono);color:var(--muted);text-decoration:none;align-self:center;margin-left:8px}
.editlink:hover{color:var(--accent);text-decoration:underline}
.zoom{position:absolute;top:10px;right:10px;z-index:2;opacity:0;border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:999px;width:32px;height:32px;display:grid;place-items:center;cursor:zoom-in;transition:opacity .15s}
.card:hover .zoom,.fcard:hover .zoom,.zoom:focus-visible{opacity:1}
@media (hover:none){.zoom{opacity:1}}
.card .zoom{top:22px;right:24px}
.lightbox{position:fixed;inset:0;z-index:40;background:rgba(10,10,14,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;cursor:zoom-out}
.lightbox img{max-width:min(1600px,100%);max-height:calc(100vh - 90px);width:auto;height:auto;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);background:var(--tile)}
.lightbox .lbbar{display:flex;gap:16px;align-items:center;color:#fff;font:500 13px/1.3 var(--body)}
.lightbox a{color:#fff}
.tag.low{border-style:dashed}
@media (prefers-reduced-motion:reduce)""")

# ---- HTML
rep("""        <a href="#foundries" id="tabFoundries">Foundries<span class="n" id="nFoundries"></span></a>
""", """        <a href="#foundries" id="tabFoundries">Foundries<span class="n" id="nFoundries"></span></a>
        <a class="editlink" id="editLink" href="#" target="_blank" rel="noopener" hidden title="Edit foundries.yaml on GitHub">Edit list</a>
""")
rep("""      <button class="btn primary" id="addBtn" hidden>Add foundry</button>
""", "")
cut('      <div class="tester" id="testerWrap" hidden>', '    </div>\n  </div>\n</div>\n\n<main', '    </div>\n  </div>\n</div>\n\n<main', keep_end=False)
cut("<!-- Add / edit dialog -->", '<div class="toast"', '<div class="lightbox" id="lb" hidden role="dialog" aria-modal="true" aria-label="Screenshot"><img alt=""><div class="lbbar"><span id="lbName"></span><a id="lbLink" target="_blank" rel="noopener noreferrer">Open site ↗</a></div></div>\n')

# ---- JS: state + helpers
rep("  let db = null, assets = null, canWrite = null;\n", "")
cut("  const fontCache = new Map();", "  /* ---------- helpers ---------- */")
cut("  function loadSpecimen(id){", "  const NEW_DAYS = 30;")
rep("""  const shotUrl = it => it.shotId ? "/_blob/" + encodeURIComponent(it.shotId) : null;""",
"""  const shot = (id, at, full) => id ? "shots/" + id.split("/").map(encodeURIComponent).join("/") + (full ? ".webp" : ".thumb.webp") + (at ? "?v=" + (Date.parse(at) || 0) : "") : null;
  const shotUrl = (it, full) => shot(it.shotId, it.shotAt, full);
  const setImg = (img, it, w) => { img.src = shotUrl(it); img.srcset = shotUrl(it) + " 800w, " + shotUrl(it, true) + " 1600w"; img.sizes = (w || 400) + "px"; };
  function lightbox(it, name){
    const lb = $("#lb"); lb.querySelector("img").src = shotUrl(it, true); lb.querySelector("img").alt = "Screenshot of " + name;
    $("#lbName").textContent = name; $("#lbLink").href = it.url; lb.hidden = false;
  }
  function zoomBtn(it, name){
    const b = el("button","zoom"); b.type = "button"; b.setAttribute("aria-label", "View larger screenshot of " + name);
    b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); lightbox(it, name); };
    return b;
  }""")
rep("""    const dl = $("#tagList"); dl.replaceChildren(...tagsSorted.map(([tag]) => { const o = el("option"); o.value = tag; return o; }));\n""", "")
cut("  function editBtn(it){", "  function card(it, i){")

# card(): drop specimen/tester branch
cut("    const fam = it.specimenId && fontCache.get(it.specimenId);", "    const foot = el(\"div\",\"foot\");", """    const sh = el("div","shot");
    if (it.shotId) { const img = el("img"); img.onerror = () => { const fbk = el("div","fallback", it.name); if (isRTL(it.name)) fbk.dir = "rtl"; img.replaceWith(fbk); }; setImg(img, it, 400); img.alt = "Screenshot of " + host(it.url); img.loading = "lazy"; img.decoding = "async"; sh.append(img); c.append(zoomBtn(it, it.name)); }
    else if (it.scan === "failed") { const fb = el("div","fallback", it.name); if (isRTL(it.name)) fb.dir = "rtl"; sh.append(fb); }
    else sh.append(el("div","pending","Screenshot on the way"));
    c.append(sh);
""")
rep("    if (hasFont) nm.style.fontFamily = `\"${fam}\", var(--display)`;\n", "")
rep("""    if (it.specimenId) tags.append(el("span","tag spec","Specimen"));\n""", "")
rep("    if (canWrite !== false && db) c.append(editBtn(it));\n", "")
rep("""    if (canWrite !== false && db) r.append(editBtn(it)); else r.append(el("span"));""", """    r.append(el("span"));""")
rep("""    $("#addBtn").hidden = !(db && canWrite !== false);
    $("#testerWrap").hidden = !items.some(i => i.specimenId);
""", "")

# fonts view
rep("""    const isFree = f => ftags(f).includes("Free");""", """    const isFree = f => f.free === true || ftags(f).includes("Free");""")
rep("""        const img = el("img","rthumb"); img.src = "/_blob/" + encodeURIComponent(f.shotId); img.alt = ""; img.loading = "lazy";""",
    """        const img = el("img","rthumb"); img.src = shotUrl(f); img.alt = ""; img.loading = "lazy";""")
rep("""img.src = "/_blob/" + encodeURIComponent(f.shotId); img.alt = "Screenshot of " + f.name;""",
    """setImg(img, f, fstate.card); img.alt = "Screenshot of " + f.name;""")
rep("""      c.append(a, sh, body); grid.append(c);""", """      c.append(a, sh, body, zoomBtn(f, f.name + (fd.name ? " · " + fd.name : ""))); grid.append(c);""")

# controls
rep("""  $("#tText").addEventListener("input", e => { state.tText = e.target.value; render(); });
  $("#tSize").addEventListener("input", e => { state.tSize = +e.target.value; document.querySelectorAll(".test").forEach(t => t.style.setProperty("--tsize", state.tSize+"px")); });
""", """  $("#lb").onclick = e => { if (e.target.tagName !== "A") $("#lb").hidden = true; };
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#lb").hidden = true; });
""")

# drop dialog code, replace data loading
cut("  /* ---------- dialog ---------- */", "  /* ---------- data ---------- */")
cut("  const clean = arr =>", "})();\n</script>", """  const clean = arr => (arr||[]).filter(i => safeUrl(i.url)).map(i => ({ ...i, url: safeUrl(i.url), name: String(i.name || nameFromUrl(i.url)), tags: Array.isArray(i.tags) ? i.tags.map(String) : [], typefaces: Array.isArray(i.typefaces) ? i.typefaces.map(String) : [], newReleases: Array.isArray(i.newReleases) ? i.newReleases.map(String) : [] }));
  (async () => {
    try {
      const r = await fetch("data/data.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      const snap = await r.json();
      fonts = (snap.fonts||[]).filter(f => safeUrl(f.url) && f.name).map(f => ({ ...f, url: safeUrl(f.url), name: String(f.name) }));
      items = clean(snap.foundries);
      const d = snap.updatedAt ? new Date(snap.updatedAt) : null;
      $("#status").textContent = $("#status").dataset.base = d ? "Updated " + d.toLocaleDateString(undefined, {day:"numeric", month:"short", year:"numeric"}) : "";
      if (snap.repo && /^[\\w.-]+\\/[\\w.-]+$/.test(snap.repo)) { const a = $("#editLink"); a.href = "https://github.com/" + snap.repo + "/edit/main/foundries.yaml"; a.hidden = false; }
      render();
    } catch(e) {
      $("#status").textContent = "The index couldn't load. Reload the page to try again.";
    }
  })();
""")
rep("const state = { q:\"\", kind:null, onlyNew:false, tags:new Set(), sort:\"order\", view:\"grid\", tText:\"\", tSize:48 };",
    "const state = { q:\"\", kind:null, onlyNew:false, tags:new Set(), sort:\"order\", view:\"grid\" };")
assert "_blob" not in s and "claude.use" not in s and "db." not in s, "leftover artifact code"
open("site/index.html", "w").write(s)
print("ok", len(s))
