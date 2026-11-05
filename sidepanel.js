const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEFAULTS = { base: "http://127.0.0.1:5100", timeout: 10, suffix: "", sel: "",
                   model: "Veo 3.1 Lite", aspect: "16:9", count: 1 };
let cfg = { ...DEFAULTS };
let scenes = [];
let song = null;
let stopping = false;
let running = false;

const log = (m) => {
  const t = new Date().toLocaleTimeString("vi-VN");
  const el = $("#log");
  el.textContent += `[${t}] ${m}\n`;
  el.scrollTop = el.scrollHeight;
};

async function loadCfg() {
  const s = await chrome.storage.local.get(DEFAULTS);
  cfg = { ...DEFAULTS, ...s };
  $("#base").value = cfg.base;
  $("#suffix").value = cfg.suffix;
  $("#sel").value = cfg.sel;
}
$("#save").onclick = async () => {
  const sel = $("#sel").value.trim();
  if (sel) { try { JSON.parse(sel); } catch { return alert("Selector không phải JSON hợp lệ"); } }
  cfg = { base: $("#base").value.trim().replace(/\/+$/, "") || DEFAULTS.base,
          suffix: $("#suffix").value, sel };
  await chrome.storage.local.set(cfg);
  log("Đã lưu cài đặt.");
  loadSongs();
};

const api = async (path, opt) => {
  const r = await fetch(cfg.base + path, opt);
  if (!r.ok) {
    let msg = r.status;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(`MakeVideo ${path}: ${msg}`);
  }
  return r;
};

async function loadSongs() {
  try {
    const list = await (await api("/api/songs")).json();
    $("#song").innerHTML = list.map(s =>
      `<option value="${s.id}">${s.title} (${s.video_count || 0}/${s.scene_count || 0} video)</option>`).join("");
    if (list.length) loadScenes(); else $("#tbl").innerHTML = "";
  } catch (e) {
    log("Không kết nối được MakeVideo — hãy chạy makevideo.bat. " + e.message);
  }
}
$("#reload").onclick = loadSongs;
$("#song").onchange = () => loadScenes();

async function loadScenes() {
  const id = $("#song").value;
  const d = await (await api(`/api/songs/${id}`)).json();
  song = d.song; scenes = d.scenes;
  let firstSet = false;
  const rows = scenes.map(s => {
    const ready = s.image && (s.prompt || "").trim();
    const checked = ready && !s.video && !firstSet ? "checked" : "";
    if (checked) firstSet = true;
    const dis = ready ? "" : "disabled";
    const url = s.image ? `${cfg.base}/media/${song.id}/${encodeURIComponent(s.image)}` : "";
    const thumb = url
      ? `<a href="${url}" target="_blank" title="Mở ảnh lớn"><img class="th" src="${url}" loading="lazy"></a>`
      : `<div class="th none">chưa có ảnh</div>`;
    return `<tr><td><input type="radio" name="scene" data-id="${s.id}" ${checked} ${dis} style="width:auto"></td>
      <td>${thumb}</td>
      <td>Cảnh ${String(s.idx).padStart(2, "0")}</td>
      <td class="${s.image ? "ok" : "no"}">${s.image ? "ảnh ✓" : "thiếu ảnh"}</td>
      <td class="${(s.prompt || "").trim() ? "ok" : "no"}">${(s.prompt || "").trim() ? "prompt ✓" : "thiếu prompt"}</td>
      <td class="${s.video ? "ok" : "no"}">${s.video ? "video ✓ (sẽ ghi đè nếu chọn)" : "chưa có video"}</td></tr>`;
  }).join("");
  $("#tbl").innerHTML = `<tr><th></th><th>Ảnh</th><th>Cảnh</th><th colspan=3></th></tr>` + rows;
  $("#info").textContent = d.offline ? "⚠ Thư mục bài hát chưa truy cập được (đang dùng bản nhớ đệm)." : "";
}

// ------------------------------------------------------------ Flow tab

async function flowTab() {
  const tabs = await chrome.tabs.query({ url: ["https://flow.google.com/*", "https://labs.google/*"] });
  if (!tabs.length) throw new Error("Chưa mở Google Flow. Hãy mở một dự án trên flow.google.com rồi thử lại.");
  return tabs.find(t => t.active) || tabs[0];
}
async function toTab(tab, msg) {
  try { return await chrome.tabs.sendMessage(tab.id, msg); }
  catch { throw new Error("Trang Flow chưa nạp extension — bấm F5 trên tab Flow rồi thử lại."); }
}

const b64 = buf => {
  let s = "", u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

$("#diag").onclick = async () => {
  try {
    const tab = await flowTab();
    const r = await toTab(tab, { type: "diagnose", sel: parseSel() });
    log("CHẨN ĐOÁN:\n" + JSON.stringify(r, null, 1));
  } catch (e) { log("Lỗi: " + e.message); }
};
const parseSel = () => { try { return cfg.sel ? JSON.parse(cfg.sel) : {}; } catch { return {}; } };

async function getVideoBytes(tab, url) {
  if (url.startsWith("blob:")) {
    const r = await toTab(tab, { type: "fetchBlob", url });
    if (!r?.ok) throw new Error("Không đọc được video blob: " + (r?.error || ""));
    return fromB64(r.data);
  }
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Tải video từ Flow lỗi HTTP " + res.status);
  return new Uint8Array(await res.arrayBuffer());
}

async function doScene(tab, sc) {
  const label = `Cảnh ${String(sc.idx).padStart(2, "0")}`;
  log(`${label}: lấy ảnh từ MakeVideo…`);
  const imgRes = await api(`/media/${song.id}/${encodeURIComponent(sc.image)}`);
  const imgBuf = await imgRes.arrayBuffer();
  const mime = imgRes.headers.get("content-type") || "image/png";
  const prompt = (sc.prompt || "").trim() + (cfg.suffix ? " " + cfg.suffix : "");

  log(`${label}: đưa ảnh + prompt vào Flow…`);
  const st = await toTab(tab, { type: "start", sel: parseSel(), prompt, image: b64(imgBuf), mime, name: sc.image });
  if (!st?.ok) throw new Error(st?.error || "Flow không nhận lệnh");

  let shown = 0;
  for (;;) {
    if (stopping) { await toTab(tab, { type: "cancel" }); throw new Error("Đã dừng"); }
    await sleep(1000);
    const s = await toTab(tab, { type: "status" });
    for (; shown < (s.report?.length || 0); shown++) log(`${label}: ${s.report[shown]}`);
    if (s.phase === "error") throw new Error(s.error);
    if (s.phase === "done") break;
  }
}

$("#run").onclick = async () => {
  const el = document.querySelector("#tbl input:checked");
  if (!el) return alert("Chưa chọn cảnh nào.");
  const sc = scenes.find(s => s.id === +el.dataset.id);
  running = true; stopping = false;
  $("#run").disabled = true; $("#stop").disabled = false;
  try {
    const tab = await flowTab();
    await doScene(tab, sc);
    log(`Cảnh ${String(sc.idx).padStart(2, "0")}: ✅ sẵn sàng — hãy kiểm tra rồi tự bấm Tạo trên Flow.`);
  } catch (e) { log(`❌ ${e.message}`); }
  running = false;
  $("#run").disabled = false; $("#stop").disabled = true;
};
$("#stop").onclick = () => { stopping = true; log("Đang dừng…"); };

loadCfg().then(loadSongs);
