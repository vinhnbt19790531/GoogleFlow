// Chạy trong "MAIN world" của trang Flow: khi trang mở hộp thoại chọn file (input[type=file].click()
// hoặc showOpenFilePicker) thì tự nhét ảnh đã chuẩn bị vào, không hiện hộp thoại.
(() => {
  if (window.__mvInject) return;
  window.__mvInject = true;
  let armed = null;
  const root = document.documentElement;

  const mk = () => {
    const bin = Uint8Array.from(atob(armed.b64), c => c.charCodeAt(0));
    return new File([bin], armed.name, { type: armed.mime });
  };
  const feed = input => {
    const dt = new DataTransfer();
    dt.items.add(mk());
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    root.dataset.mvConsumed = "1";
  };

  const origClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (armed && this.type === "file") { feed(this); return; }
    return origClick.apply(this, arguments);
  };
  document.addEventListener("click", e => {
    if (armed && e.target && e.target.type === "file") { e.preventDefault(); feed(e.target); }
  }, true);

  const origShow = window.showOpenFilePicker;
  window.showOpenFilePicker = async function () {
    if (armed) {
      root.dataset.mvConsumed = "1";
      const f = mk();
      return [{ kind: "file", name: f.name, getFile: async () => f }];
    }
    if (origShow) return origShow.apply(this, arguments);
    throw new DOMException("Không hỗ trợ", "NotSupportedError");
  };

  window.addEventListener("mv-arm", e => {
    armed = e.detail ? JSON.parse(e.detail) : null;
    delete root.dataset.mvConsumed;
  });
})();
