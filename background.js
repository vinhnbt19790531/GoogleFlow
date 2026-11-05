// Bấm biểu tượng extension thì mở side panel (panel giữ nguyên khi chạy lâu).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
