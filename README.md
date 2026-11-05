# MakeVideo → Google Flow (Chrome extension)

1. Chạy MakeVideo (`makevideo.bat`, cổng 5100).
2. Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục này.
3. Mở một dự án trên https://flow.google.com (đã đăng nhập), bấm F5.
4. Bấm biểu tượng extension → side panel mở ra. Chọn bài hát, tick các cảnh, bấm **Tạo video**.

Mỗi lần chỉ làm **một cảnh**: chọn cảnh (nút tròn) → bấm **Đưa ảnh + prompt … vào Flow**. Extension lấy ảnh + prompt từ MakeVideo, đính ảnh và dán prompt vào ô tạo video trên Flow rồi dừng. Bạn tự bấm Tạo, đổi tên và tải video.

Nếu Flow đổi giao diện và extension không tìm được nút: bấm **Chẩn đoán**, rồi điền selector CSS vào Cài đặt
(`{"prompt":"…","file":"…","generate":"…","video":"…"}`).
