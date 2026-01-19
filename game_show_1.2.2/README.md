# Hướng dẫn sử dụng Hệ thống Gameshow Challenge Quiz (v1.2.2)

Đây là tài liệu hướng dẫn toàn diện, bao gồm các bước từ cài đặt, chuẩn bị dữ liệu, quản trị hệ thống cho đến khi vận hành một buổi gameshow hoàn chỉnh.

## 📜 Mục lục

1.  [🚀 Cài đặt & Khởi chạy](https://www.google.com/search?q=%23-c%C3%A0i-%C4%91%E1%BA%B7t--kh%E1%BB%9Fi-ch%E1%BA%A1y)
2.  [📝 Chuẩn bị Dữ liệu ban đầu](https://www.google.com/search?q=%23-chu%E1%BA%A9n-b%E1%BB%8B-d%E1%BB%AF-li%E1%BB%87u-ban-%C4%91%E1%BA%A7u)
3.  [👑 Quản trị hệ thống (Trước khi Gameshow diễn ra)](https://www.google.com/search?q=%23-qu%E1%BA%A3n-tr%E1%BB%8B-h%E1%BB%87-th%E1%BB%91ng-tr%C6%B0%E1%BB%9Bc-khi-gameshow-di%E1%BB%85n-ra)
4.  [▶️ Vận hành Gameshow (Trong khi Gameshow diễn ra)](https://www.google.com/search?q=%23%EF%B8%8F-v%E1%BA%ADn-h%C3%A0nh-gameshow-trong-khi-gameshow-di%E1%BB%85n-ra)
5.  [💡 Lưu ý Quan trọng](https://www.google.com/search?q=%23-l%C6%B0u-%C3%BD-quan-tr%E1%BB%8Dng)

-----

## 🚀 Cài đặt & Khởi chạy

### \#\#\# 1. Cài đặt các thư viện cần thiết

Mở terminal (dòng lệnh) trong thư mục dự án và chạy lệnh:

```bash
pip install pymongo Pillow dnspython
```

### \#\#\# 2. Cấu hình Database

  * Mở file `config.py`.
  * Cập nhật biến `MONGODB_URL` bằng chuỗi kết nối từ tài khoản MongoDB Atlas của bạn.
  * **Lưu ý:** Đảm bảo đã cho phép IP truy cập (Whitelist IP `0.0.0.0/0`) trên trang quản trị MongoDB Atlas để tránh lỗi kết nối.

### \#\#\# 3. Nạp dữ liệu ban đầu (Chỉ chạy lần đầu)

Thao tác này sẽ đọc dữ liệu từ các file `.json` và `.csv` trong dự án để nạp vào database trống của bạn.

```bash
python migrate.py
```

### \#\#\# 4. Khởi động Server

Để bắt đầu chương trình, hãy chạy server backend:

```bash
python server_mongodb.py
```

### \#\#\# 5. Truy cập ứng dụng

  * Mở trình duyệt (khuyên dùng Chrome hoặc Edge) và truy cập: `http://localhost:8127` hoặc địa chỉ IP public của bạn.

-----

## 📝 Chuẩn bị Dữ liệu ban đầu

Trước khi chạy `migrate.py`, bạn cần chuẩn bị dữ liệu trong các file sau:

  * **File Câu hỏi (`/data/cau_hoi_dap_an_new.csv`):**

      * Đây là file chứa ngân hàng câu hỏi chính cho Vòng 1 và Vòng 2.
      * File phải có các cột tiêu đề sau: `ques`, `ans_1`, `ans_2`, `ans_3`, `ans_4`, `ans_5`, `correct_ans`, `time`.
      * Các câu hỏi sẽ tự động được chia: 60 câu đầu cho Phần 1, các câu sau cho Phần 2.
      * Cột `time` chứa thời gian trả lời câu hỏi (tính bằng giây). Nếu để trống, hệ thống sẽ mặc định là 300 giây.

  * **File Giám khảo (`/db/judges.json`):**

      * Dùng để nạp danh sách giám khảo ban đầu.
      * Mỗi giám khảo phải có cấu trúc với `extra_questions` là một **mảng** chứa các câu hỏi phụ dạng trắc nghiệm.

    **Ví dụ:**

    ```json
    [
      {
        "id": "1",
        "name": "Nguyễn Văn An",
        "title": "Trưởng Ban Tổ Chức",
        "type": "main",
        "image": "images/judges/an.png",
        "extra_questions": [
          {
            "question": "Câu hỏi phụ 1 của BGK An?",
            "answer_options": { "A":"...", "B":"...", "C":"...", "D":"..." },
            "correct_answer": "A"
          }
        ]
      }
    ]
    ```

  * **File Đội chơi (`/db/teams.json`):** Dùng để nạp danh sách các đội chơi ban đầu.

-----

## 👑 Quản trị hệ thống (Trước khi Gameshow diễn ra)

Sau khi khởi động server và truy cập ứng dụng, hãy đăng nhập với tài khoản mặc định:

  * **Tên đăng nhập:** `trolly`
  * **Mật khẩu:** `123`

Tại **Bảng điều khiển**, bạn có thể thực hiện các thao tác sau:

### \#\#\# 1. Quản lý Ban Giám Khảo

  * **Thêm Giám khảo:**
    1.  Điền đầy đủ các thông tin: Tên, Chức vụ, Ảnh đại diện.
    2.  Nhấn nút `[+ Thêm câu hỏi phụ]` để tạo các khối nhập câu hỏi.
    3.  **Lưu ý:** Phải nhập **ít nhất 2 câu hỏi phụ** cho mỗi giám khảo. Tất cả các ô (câu hỏi, đáp án A, B, đáp án đúng) đều là bắt buộc.
    4.  Nhấn "Lưu".
  * **Sửa/Xóa Giám khảo:** Sử dụng các nút tương ứng trong danh sách.

### \#\#\# 2. Quản lý Ảnh Đội

  * Điền tên đội và nhấn `Upload Ảnh Từ Máy` để thêm đội mới.

### \#\#\# 3. Quản lý Câu hỏi

  * Để nạp hoặc cập nhật lại toàn bộ ngân hàng câu hỏi cho Vòng 1 và 2, hãy vào mục này và nhấn nút **"Load từ CSV"**.
  * **Lưu ý quan trọng:** Hành động này sẽ **xóa toàn bộ** câu hỏi cũ trong database và thay thế bằng dữ liệu mới từ file `.csv`.

-----

## ▶️ Vận hành Gameshow (Trong khi Gameshow diễn ra)

### \#\#\# 1. Bắt đầu Vòng 1 & 2

1.  Từ **Bảng điều khiển**, nhấn vào thẻ **"BẮT ĐẦU"**.
2.  Màn hình danh sách các đội sẽ hiện ra.
3.  Nhấn nút **"Phần 1 (60 câu)"** hoặc **"Phần 2 (60 câu)"** để vào lưới câu hỏi tương ứng.
4.  Click vào một ô số để mở **modal câu hỏi**. Đồng hồ 15 giây sẽ bắt đầu đếm ngược.
5.  Sau khi trả lời, ô số sẽ bị làm mờ.

### \#\#\# 2. Bắt đầu Vòng Câu hỏi phụ (Thử thách)

1.  Từ **Bảng điều khiển** (hoặc từ màn hình lưới câu hỏi), nhấn nút **"Câu Hỏi Phụ"**.
2.  Màn hình lựa chọn các giám khảo **chưa được sử dụng** sẽ hiện ra.
3.  Click vào một thẻ giám khảo để bắt đầu thử thách của họ.
4.  **Modal câu hỏi** sẽ hiện ra, hiển thị **tất cả các câu hỏi** của giám khảo đó.
5.  Một **đồng hồ đếm ngược tổng** (40 giây/câu) sẽ bắt đầu ở header của modal. Header này sẽ được **ghim cố định** khi bạn cuộn xuống.
6.  Người chơi có thể trả lời các câu hỏi theo thứ tự bất kỳ.
7.  Thử thách kết thúc khi:
      * Người chơi trả lời hết tất cả các câu hỏi.
      * Đồng hồ đếm ngược về 0.
8.  Sau khi kết thúc, bạn có thể tự đóng modal bằng nút 'x' để quay lại màn hình chọn giám khảo. Vị giám khảo vừa được chọn sẽ biến mất khỏi danh sách.

-----

## 💡 Lưu ý Quan trọng

  * **Khi sửa code Backend (`.py`):** Luôn phải **khởi động lại server** (dừng bằng `Ctrl + C` rồi chạy lại `python server_mongodb.py`).
  * **Khi sửa code Frontend (`.js`, `.css`, `.html`):** Luôn phải **Hard Reload** trình duyệt (nhấn `Ctrl + F5`) để xóa cache và thấy thay đổi.