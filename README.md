# Blacksite

Mod cho Claude Code, tông Hắc kim (đen và vàng kim). Mod thêm vào giao diện:

- **Bảng điều khiển** bên cạnh khung chat: danh sách nhiệm vụ, % bộ nhớ hội thoại và % hạn mức 5 giờ, nhật ký 8 lệnh gần nhất, số lệnh đã bị chặn.
- **Dải nhiệm vụ** ngay trên ô nhập tin nhắn: việc đang chạy và số lệnh đã chặn.
- **Dòng trạng thái**: `◆ BLACKSITE ▸ ⛨ LÁ CHẮN BẬT ▸ ĐÃ CHẶN 0 ▸ BỘ NHỚ 38%`.
- **Lá chắn**: chặn lệnh xóa hàng loạt và lệnh phá ổ đĩa trước khi chúng chạy, kèm thông báo và còi báo động:
  - Bash: `rm -rf`, `git push --force`, `mkfs`, `dd` ghi vào thiết bị
  - PowerShell và CMD trên Windows: `Remove-Item -Recurse -Force` (kể cả `rm -r -fo`), `rd /s /q`, `del /s /q`, `Format-Volume`, `format C:`
- **Âm thanh**: còi khi chặn lệnh, tiếng "ting" khi Claude làm xong một việc dài hơn 20 giây (macOS và Windows).
- **Theme Hắc kim**: đổi màu giao diện terminal của Claude Code sang đen và vàng kim.

## Bật theme và bảng điều khiển

- Gõ `/theme` và chọn **Hắc kim** để đổi màu toàn bộ giao diện terminal.
- Gõ `/tui fullscreen` để bảng điều khiển nằm cố định bên cạnh cuộc trò chuyện. Ở chế độ thường, cửa sổ hẹp sẽ không tự mở bảng; gõ `/blacksite` để mở.

## Lệnh

| Lệnh | Tác dụng |
| --- | --- |
| `/blacksite` | Mở lại bảng điều khiển |
| `/nhiemvu` | Xem danh sách nhiệm vụ |
| `/nhiemvu thêm <việc>` | Thêm một việc |
| `/nhiemvu chạy <số>` | Đặt việc số `<số>` là việc đang chạy |
| `/nhiemvu xong <số>` | Đánh dấu xong |
| `/nhiemvu xóa <số>` | Xóa một việc |
| `/nhiemvu dọn` | Xóa các việc đã xong |
| `/arm` | Bật/tắt chế độ báo động: chặn thêm mọi lệnh xóa (`rm`, `Remove-Item`, `del`), `git reset --hard`, `git clean -f` |

Bấm vào một việc trong bảng để đổi trạng thái: Chờ → Đang chạy → Xong.

Lá chắn dò theo mẫu lệnh nên chặn được các lệnh phổ biến, nhưng không phải bức tường tuyệt đối. Hãy vẫn đọc lệnh trước khi cho phép.

## Cài đặt

Trong app Claude desktop: bấm **+** cạnh ô nhập tin nhắn, chọn **Plugins**, **Add marketplace** với `yalza/Blacksite`, rồi **Add plugin**.

Ở ô nhập của một phiên Claude Code trong terminal:

```
/plugin install blacksite --marketplace yalza/Blacksite
```

Hoặc từ shell:

```bash
claude plugin install blacksite --marketplace yalza/Blacksite
```

Lần đầu sẽ có câu hỏi `Add marketplace?`, trả lời `y`, rồi chọn phạm vi cài (mặc định là user).

## Cập nhật lên bản mới

```bash
claude plugin marketplace update blacksite
```

```bash
claude plugin update blacksite@blacksite
```

Sau đó mở phiên Claude Code mới, hoặc gõ `/reload-plugins` trong phiên đang mở.
