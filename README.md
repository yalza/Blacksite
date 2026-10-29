# Blacksite

Mod cho Claude Code, tông Hắc kim (đen và vàng kim). Mod thêm vào giao diện:

- **Bảng điều khiển** bên cạnh khung chat: danh sách nhiệm vụ, % bộ nhớ hội thoại và % hạn mức 5 giờ, nhật ký 8 lệnh gần nhất, số lệnh đã bị chặn.
- **Dải nhiệm vụ** ngay trên ô nhập tin nhắn: việc đang chạy và số lệnh đã chặn.
- **Dòng trạng thái**: `◆ BLACKSITE ▸ ⛨ LÁ CHẮN BẬT ▸ ĐÃ CHẶN 0 ▸ BỘ NHỚ 38%`.
- **Lá chắn**: chặn `rm -rf`, `git push --force`, `mkfs` và `dd` ghi vào thiết bị trước khi chúng chạy, kèm thông báo và còi báo động.
- **Âm thanh**: còi khi chặn lệnh, tiếng "ting" khi Claude làm xong một việc dài hơn 20 giây (phát được trên macOS).

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
| `/arm` | Bật/tắt chế độ báo động: chặn thêm mọi lệnh `rm`, `git reset --hard`, `git clean -f` |

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
