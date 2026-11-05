// Chạy trong trang Google Flow. Quy trình mô phỏng đúng thao tác của người dùng:
//  ✕ (ô chat) → Upload media → chọn ảnh vừa tải → Add to prompt → dán prompt → bấm Tạo
//  (dừng ở đây — người dùng tự bấm Tạo và các bước sau).
(() => {
  if (window.__mvFlowLoaded) return;
  window.__mvFlowLoaded = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let job = { phase: "idle" };
  let report = [];
  const step = m => { report.push(m); };

  const qs = sel => { try { return sel ? document.querySelector(sel) : null; } catch { return null; } };
  const visible = e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
  };
  const txt = e => (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  const labelOf = e => `${e.getAttribute("aria-label") || ""} ${e.title || ""} ${e.innerText || ""}`.replace(/\s+/g, " ").trim();
  const isDisabled = b => b.disabled || b.getAttribute("aria-disabled") === "true";
  const cancelled = () => { if (job.cancel) throw new Error("Đã dừng"); };

  function realClick(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0,
                clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) };
    const p = { ...o, pointerId: 1, pointerType: "mouse", isPrimary: true, width: 1, height: 1 };
    el.dispatchEvent(new PointerEvent("pointerover", p));
    el.dispatchEvent(new MouseEvent("mouseover", o));
    el.dispatchEvent(new PointerEvent("pointerdown", { ...p, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...o, buttons: 1, detail: 1 }));
    if (el.focus) el.focus();
    el.dispatchEvent(new PointerEvent("pointerup", p));
    el.dispatchEvent(new MouseEvent("mouseup", { ...o, detail: 1 }));
    el.dispatchEvent(new MouseEvent("click", { ...o, detail: 1 }));
  }
  async function waitFor(fn, ms, what) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      cancelled();
      const v = fn();
      if (v) return v;
      await sleep(300);
    }
    throw new Error("Hết thời gian chờ: " + what);
  }

  // phần tử hiển thị có chữ khớp, lấy phần tử có chữ ngắn nhất (= đúng nút/mục)
  function findText(re, scope = document) {
    const els = [...scope.querySelectorAll("button,[role],a,li,div,span,p")]
      .filter(visible).filter(e => re.test(txt(e)));
    els.sort((a, b) => txt(a).length - txt(b).length);
    return els[0] || null;
  }

  function findPrompt(sel) {
    const c = qs(sel.prompt);
    if (c) return c;
    const list = [...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].filter(visible);
    list.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return list[0] || null;
  }
  function chatBar(box) {
    let e = box;
    for (let i = 0; i < 8 && e.parentElement; i++) {
      e = e.parentElement;
      if (e.querySelectorAll("button").length >= 3) return e;
    }
    return box.parentElement || document.body;
  }
  const barButtons = bar => [...bar.querySelectorAll('button,[role="button"]')].filter(visible)
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

  function setText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    }
  }

  const videoSrcs = () => {
    const out = new Set();
    document.querySelectorAll("video").forEach(v => {
      if (v.currentSrc) out.add(v.currentSrc);
      if (v.src) out.add(v.src);
      v.querySelectorAll("source").forEach(s => s.src && out.add(s.src));
    });
    return out;
  };
  const srcOf = v => v.currentSrc || v.src || v.querySelector("source")?.src || "";

  function alertText() {
    const re = /fail|couldn.?t|unable|violat|not allowed|quota|limit|error|thất bại|không thể|lỗi|vi phạm/i;
    for (const e of document.querySelectorAll('[role="alert"],[role="status"],[aria-live]')) {
      const t = (e.innerText || "").trim();
      if (t && t.length < 300 && re.test(t)) return t;
    }
    return null;
  }

  // ---------- 1) đưa ảnh của cảnh vào ô chat ----------
  async function attachImage(sel, msg, box) {
    const bar = chatBar(box);
    const name = msg.name;
    window.dispatchEvent(new CustomEvent("mv-arm", { detail: JSON.stringify({ b64: msg.image, mime: msg.mime, name }) }));

    // nút ✕ / + ở góc trái ô chat: nút nhỏ nhất bên trái, không phải "Agent"
    let opener = qs(sel.add);
    if (!opener) {
      const bs = barButtons(bar);
      opener = bs.find(b => /add ingredients/i.test(labelOf(b))) ||
               bs.find(b => /\badd\b|\bclose\b/i.test(labelOf(b)) && !/agent|settings|generation/i.test(labelOf(b)));
    }
    if (!opener) throw new Error("Không thấy nút ✕ trong ô chat. Nút trong ô chat: " +
      JSON.stringify(barButtons(bar).map(labelOf)));
    realClick(opener);
    step("đã bấm ✕ mở thư viện");

    await waitFor(() => findText(/^\W*upload media\W*$/i), 8000, "mục 'Upload media'");
    // Các dòng trong thư viện: mỗi dòng có ảnh thumbnail nhỏ + "tên" + "Image|Video". Flow đổi tên file khi
    // upload (vd. "Cảnh_13_-_image.png_…") nên không dò theo tên mà lấy dòng trên cùng (Recent = mới nhất).
    const rows = () => {
      const out = [];
      for (const img of document.querySelectorAll("img")) {
        const r = img.getBoundingClientRect();
        if (r.width < 25 || r.width > 90 || !visible(img)) continue;
        let p = img.parentElement;
        for (let i = 0; i < 4 && p && !/\b(Image|Video)$/.test(txt(p)); i++) p = p.parentElement;
        if (p && /\b(Image|Video)$/.test(txt(p)) && txt(p).length < 160 && !out.includes(p)) out.push(p);
      }
      return out.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    };
    const first0 = rows()[0] ? txt(rows()[0]) : "";
    const n0 = rows().length;

    realClick(findText(/^\W*upload media\W*$/i));
    step("đã bấm Upload media");
    await waitFor(() => document.documentElement.dataset.mvConsumed === "1", 5000, "hộp chọn file (inject.js chưa bắt được)");
    step("đã gửi file ảnh, chờ Flow tải lên");

    // chờ ảnh mới xuất hiện trong danh sách (Recent: ảnh mới nằm trên cùng)
    await waitFor(() => { const r = rows(); return r.length > n0 || (r[0] && txt(r[0]) !== first0); },
      90000, "ảnh tải lên Flow (không thấy mục mới trên cùng trong thư viện)");
    await sleep(4000); // cho Flow xử lý xong ảnh vừa tải
    const row = rows()[0];
    if (!row) throw new Error("Không thấy dòng ảnh nào trong thư viện Flow.");
    realClick(row);
    step("đã chọn ảnh trên cùng: " + txt(row).slice(0, 40));

    // chỉ tìm trong hộp thư viện (chứa ô "Search assets"), tránh nhầm nút cùng tên ở nền
    const dialog = () => {
      let p = document.querySelector('input[placeholder*="search assets" i]');
      for (let i = 0; i < 12 && p && !/add to prompt/i.test(p.innerText || ""); i++) p = p.parentElement;
      return p || document;
    };
    const addEl = () => {
      const t = findText(/^\W*add to prompt\W*$/i, dialog());
      return t && (t.closest("button,[role=button]") || t);
    };
    let closed = false;
    for (let attempt = 1; attempt <= 4 && !closed; attempt++) {
      const add = await waitFor(addEl, 10000, "nút 'Add to prompt'");
      await waitFor(() => !isDisabled(add), 10000, "nút 'Add to prompt' sẵn sàng");
      await sleep(1500); // đợi bản xem trước tải xong
      const r = add.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      step(`Add to prompt (lần ${attempt}): <${add.tagName.toLowerCase()} role=${add.getAttribute("role")}> ` +
           `phần tử tại điểm bấm: <${top?.tagName.toLowerCase()}> "${(top?.innerText || "").slice(0, 20)}"`);
      if (attempt === 1) realClick(add);
      else if (attempt === 2 && top) realClick(top);
      else if (attempt === 3) { add.click(); }
      else {
        add.focus && add.focus();
        for (const t of ["keydown", "keyup"])
          add.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      }
      try { await waitFor(() => !addEl(), 5000, "đóng thư viện"); closed = true; }
      catch { step(`bấm Add to prompt lần ${attempt} chưa có tác dụng, thử lại`); }
    }
    if (!closed) throw new Error("Bấm 'Add to prompt' nhiều lần nhưng thư viện vẫn không đóng.");
    step("đã Add to prompt");
    window.dispatchEvent(new CustomEvent("mv-arm", { detail: "" }));
  }

  async function run(msg) {
    const sel = msg.sel || {};
    job = { phase: "running", cancel: false };
    report = [];
    try {
      const box = findPrompt(sel);
      if (!box) throw new Error("Không tìm thấy ô nhập prompt trên Flow (hãy mở trang dự án).");
      delete document.documentElement.dataset.mvConsumed;

      await attachImage(sel, msg, box);
      cancelled();

      const box2 = findPrompt(sel) || box;
      setText(box2, msg.prompt);
      await sleep(800);
      step("đã dán prompt");

      // Dừng ở đây: ảnh + prompt đã nằm trong ô tạo video, người dùng tự kiểm tra và bấm Tạo.
      step("✅ xong: ảnh + prompt đã vào ô tạo video — bạn tự bấm Tạo.");
      job = { phase: "done" };
    } catch (e) {
      job = { phase: "error", error: e.message };
    } finally {
      window.dispatchEvent(new CustomEvent("mv-arm", { detail: "" }));
    }
  }

  function diagnose(sel) {
    const d = el => ({ tag: el.tagName.toLowerCase(), label: labelOf(el).slice(0, 60), role: el.getAttribute("role") });
    const p = findPrompt(sel);
    return {
      url: location.href,
      promptBox: p ? d(p) : null,
      chatBarButtons: p ? barButtons(chatBar(p)).map(d) : [],
      fileInputs: [...document.querySelectorAll('input[type="file"]')].length,
      videos: [...videoSrcs()].slice(0, 10),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg.type === "start") {
      if (job.phase === "running") { send({ ok: false, error: "Flow đang bận" }); return; }
      run(msg); send({ ok: true });
    } else if (msg.type === "status") {
      send({ phase: job.phase, url: job.url, error: job.error, report });
    } else if (msg.type === "cancel") {
      job.cancel = true; send({ ok: true });
    } else if (msg.type === "diagnose") {
      send(diagnose(msg.sel || {}));
    } else if (msg.type === "fetchBlob") {
      fetch(msg.url).then(r => r.arrayBuffer()).then(buf => {
        let s = "", u = new Uint8Array(buf);
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        send({ ok: true, data: btoa(s) });
      }).catch(e => send({ ok: false, error: e.message }));
      return true;
    }
  });
})();
