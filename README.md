# Phân Tích Số Liệu — PLS-SEM

Trang web tính các chỉ số đánh giá thang đo từ file Excel/CSV. Không cần cài đặt hay chạy server.

## Cách dùng
1. Mở `index.html` bằng Chrome/Edge (nhấp đúp).
2. Kéo thả file `.xlsx`, `.xls` hoặc `.csv` vào ô nhập. Dòng đầu là tên biến, mỗi dòng sau là một người trả lời.
   Bấm **Dùng dữ liệu mẫu** để xem thử.
3. Khai báo mô hình ở bước 2, chọn một trong hai cách:

   **Vẽ sơ đồ (giống SmartPLS)**
   - Kéo biến từ danh sách bên trái thả lên một thang đo để gán, hoặc thả vào chỗ trống để tạo thang đo mới
     (bấm để chọn nhiều biến, Shift để chọn một dải). Hoặc bấm **Tự nhận diện**.
   - Công cụ **Nối** (phím C): kéo từ thang đo nguyên nhân sang thang đo kết quả để vẽ mũi tên.
   - Công cụ **Chọn** (phím V): kéo để di chuyển; bấm đúp để đổi tên; chọn rồi nhấn Delete để xóa;
     nút "Biến quan sát: bên trái…" đổi phía đặt biến; "Đảo chiều" đổi hướng mũi tên.
   - **Tự sắp xếp** xếp lại theo các mũi tên; **Tải PNG** lưu ảnh sơ đồ. Sau khi chạy, sơ đồ hiện
     loading, β và R². Bố cục được nhớ theo file dữ liệu.

   **Nhập dạng chữ**: mỗi dòng một thang đo:
   ```
   TC: TC1, TC2, TC3, TC4
   CL: CL1-CL5
   ```
   Hoặc bấm **Tự nhận diện theo tiền tố** (TC1, TC2… → TC).
4. (Không bắt buộc) Khai báo mô hình cấu trúc, ví dụ `TC, CL -> HL`, để có hệ số β, R², f², VIF inner.
5. Ở bước 3, bấm vào từng nút độ đo (Outer loading, Độ tin cậy & AVE, Giá trị phân biệt…) để chạy riêng độ đo đó,
   hoặc bấm **Chạy tất cả** (Ctrl+Enter). Mỗi nút hiện trạng thái: Chưa chạy / Đã chạy / số chỉ số chưa đạt / Cần chạy lại
   (khi bạn sửa mô hình). Bấm × cạnh một biến trong bảng Outer loading để loại biến đó và tính lại.
6. Bấm **Xuất Excel** để lưu toàn bộ kết quả. Ô không đạt ngưỡng được tô **đỏ**, ô cần xem lại tô **vàng**.

## Bootstrapping
Nút **Bootstrapping** lấy mẫu lặp có hoàn lại (mặc định 10.000 mẫu, giống SmartPLS 4) và chạy lại PLS trên mỗi mẫu.
Mẫu mà thuật toán PLS chưa hội tụ bị loại và được đếm riêng.
Tùy chọn: số mẫu, kiểm định hai phía / một phía có hướng, mức ý nghĩa, seed (cùng seed thì kết quả lặp lại y hệt).
Khi chọn **một phía**, chọn hướng giả thuyết (Dương / Âm) cho từng quan hệ; hệ số ngược dấu giả thuyết luôn không có ý nghĩa.
Kết quả:
- **Hệ số đường dẫn**: Original sample (O), Sample mean (M), STDEV, T statistics (|O/STDEV|), P values, kết luận
- **Khoảng tin cậy**: percentile và BCa (bias-corrected and accelerated, hệ số gia tốc ước lượng bằng jackknife).
  Chưa có khoảng tin cậy studentized.
- **Tác động gián tiếp**: từng đường gián tiếp cụ thể và tổng tác động gián tiếp (kiểm định trung gian)
- **Tổng tác động**, **Outer loading**, **Outer weight**, **R²**
- **HTMT**: luôn kiểm định một phía, α = 0,05 (cận trên 95%), không phụ thuộc tùy chọn chung; đạt khi cận trên < 0,85 (hoặc < 0,90)

Sau khi chạy, sơ đồ hiện β kèm p-value, ví dụ `0.420 (0.000)`; bảng kiểm và đoạn văn ở Tổng quan được cập nhật theo.

## Dòng đáng ngờ
Nút **Dòng đáng ngờ** quét từng phiếu theo các tiêu chí:
- Trả lời một kiểu (độ lệch chuẩn của dòng ≤ 0,3)
- Không nhất quán trong thang đo: độ lệch chuẩn trung bình giữa các câu cùng thang đo ≥ 1/4 độ rộng thang
  (thang 1–5: ≥ 1,0), dấu hiệu của trả lời ngẫu nhiên
- Ngoại lai đa biến (Mahalanobis D², p < 0,001)
- Thiếu trên 15% câu trả lời
- Ảnh hưởng lớn: thử bỏ từng dòng, xem α, CR, AVE, β thay đổi bao nhiêu (chỉ để tham khảo)

Chọn các dòng rồi bấm **Loại dòng đã chọn và tính lại**; mọi độ đo được tính lại trên dữ liệu còn lại và có
bảng so sánh trước/sau (phân tích độ nhạy). Có thể khôi phục từng dòng hoặc tất cả. Chỉ nên loại phiếu theo
tiêu chí đặt trước khi phân tích, không loại chỉ vì phiếu làm kết quả xấu đi.

## Tiện ích khác
- **Tổng quan**: bảng kiểm Đạt / Cần xem lại / Chưa đạt (độ tin cậy, hội tụ, phân biệt, đa cộng tuyến inner, ý nghĩa β), sơ đồ mô hình kiểu SmartPLS
  (tải được ảnh PNG độ phân giải cao) và đoạn văn mô tả kết quả viết sẵn để đưa vào luận văn.
- Nút **Sao chép bảng** ở mỗi bảng: dán thẳng vào Word hoặc Excel.
- Chọn dấu thập phân **0.708** hoặc **0,708** ở góc trên; giao diện sáng / tối.

## Các chỉ số
| Bảng | Nội dung |
|---|---|
| Outer loadings | Hệ số tải ngoài (thuật toán PLS, Mode A) |
| Độ tin cậy & AVE | Cronbach's α (gốc như SPSS và chuẩn hóa như SmartPLS), rho_A, CR (rho_c), AVE |
| Cronbach's α chi tiết | Tương quan biến-tổng hiệu chỉnh, α nếu loại biến (như SPSS) |
| VIF (outer) | Tham khảo (dùng cho thang đo cấu tạo) |
| Fornell-Larcker, HTMT, Cross loadings | Giá trị phân biệt |
| Mô hình cấu trúc | Hệ số β, R², R² hiệu chỉnh, f², VIF (inner) |
| Bootstrapping | T, p-value, khoảng tin cậy percentile và BCa, tác động gián tiếp, tổng tác động, HTMT |
| Thống kê mô tả | N, giá trị thiếu, min, max, trung bình, độ lệch chuẩn, độ lệch, độ nhọn |

## Lưu ý
- Đọc file Excel cần Internet (thư viện SheetJS tải từ CDN). File CSV đọc được cả khi không có mạng.
  Muốn đọc Excel khi offline: tải `xlsx.full.min.js` (SheetJS 0.18.5) rồi đặt vào `assets/lib/`.
  Xuất Excel không cần Internet.
- **Phạm vi**: chỉ PLS-SEM chuẩn với thang đo phản ánh (reflective, Mode A). Chưa hỗ trợ thang đo cấu tạo
  (formative, Mode B), PLSc, biến điều tiết, thang đo bậc cao, phân tích đa nhóm (MGA), PLSpredict.
- Thuật toán: lược đồ Path (mặc định) hoặc Factor; SmartPLS 4 không còn Centroid; PCA chưa hỗ trợ.
  Tối đa 3.000 vòng lặp, tiêu chí dừng 10⁻⁷, trọng số khởi đầu 1 (mặc định SmartPLS 4).
- Cần ít nhất 2 thang đo. Khi đã vẽ quan hệ, mọi thang đo phải được nối vào mô hình cấu trúc; chưa vẽ quan hệ nào
  thì trang dùng lược đồ Factor để đánh giá mô hình đo lường.
- Đánh giá độ tin cậy dùng α chuẩn hóa (như SmartPLS), rho_A và CR; α dữ liệu gốc (như SPSS) hiển thị để đối chiếu.
  rho_A > 1 là bất thường.
- HTMT tính trên trị tuyệt đối của các hệ số tương quan (như SmartPLS); thang đo một biến không có HTMT.
- p-value tính theo phân phối Student t với bậc tự do B − 1 (B = số mẫu bootstrap hợp lệ). SmartPLS không công bố
  công thức này; với vài nghìn mẫu, khác biệt so với phân phối chuẩn không đáng kể.
- Kết quả loadings/CR/AVE có thể chênh rất nhỏ so với SmartPLS nếu khác lược đồ trọng số hoặc cách xử lý giá trị thiếu.
- Mọi tính toán chạy ngay trên máy bạn, dữ liệu không được gửi đi đâu.

## Cấu trúc thư mục
Mỗi file một nhiệm vụ. Các file JavaScript được nạp theo thứ tự trong `index.html` và liên kết qua
không gian tên chung `window.PTSL` (không dùng ES module vì trình duyệt chặn module khi mở file trực tiếp).
```
index.html                       Trang chính (khung giao diện + thứ tự nạp file)
assets/
  css/base.css                   Màu sáng/tối, chữ, thanh trên cùng, nút, ô nhập, thông báo
  css/data.css                   Bước 1: nhập dữ liệu
  css/model.css                  Bước 2: nhập dạng chữ và khung vẽ mô hình
  css/results.css                Bước 3: nút độ đo, bảng kết quả, bảng kiểm, sơ đồ
  css/rowcheck.css               Dòng đáng ngờ
  css/bootstrap.css              Bootstrapping
  lib/                           (tùy chọn) xlsx.full.min.js để đọc Excel khi offline
src/
  core/namespace.js              Trạng thái ứng dụng + tiện ích dùng chung (định dạng số, thông báo…)
  core/distributions.js          Phân phối chuẩn, Student t, χ² (p-value, khoảng tin cậy)
  core/stats.js                  Thuật toán PLS và công thức: α, rho_A, CR, AVE, VIF, HTMT, β, R², f²
  data/csv-parser.js             Đọc CSV
  data/file-loader.js            Nhập file Excel/CSV, xem trước, chuẩn bị dữ liệu số
  data/sample-data.js            Dữ liệu mẫu nhúng sẵn
  model/model-parser.js          Đọc cú pháp khai báo thang đo và quan hệ
  model/text-editor.js           Chế độ nhập dạng chữ
  model/canvas.js                Khung vẽ mô hình kiểu SmartPLS
  analysis/fit.js                Chạy PLS cho mô hình đang khai báo
  analysis/assessment.js         Đánh giá theo ngưỡng, bảng kiểm, đoạn văn mô tả
  analysis/tables.js             Dựng bảng kết quả cho từng độ đo
  analysis/rowcheck.js           Phát hiện dòng đáng ngờ
  analysis/bootstrap.js          Bootstrapping (PLS trên ma trận tương quan cho nhanh)
  ui/steps.js                    Thanh 3 bước
  ui/measures.js                 Nút độ đo và hiển thị bảng
  ui/rows-view.js                Giao diện Dòng đáng ngờ
  ui/bootstrap-view.js           Giao diện Bootstrapping
  ui/prefs.js                    Dấu thập phân, sáng/tối, chế độ khai báo
  export/xlsx-writer.js          Ghi file .xlsx có tô màu (tự viết, không cần thư viện)
  export/excel-export.js         Xuất kết quả ra Excel
  export/clipboard.js            Sao chép bảng sang Word/Excel
  export/diagram.js              Xuất sơ đồ ra ảnh PNG
  app.js                         Nối sự kiện và khởi động
du_lieu_mau.csv, du_lieu_thu_nghiem.csv, data_test.csv, data_test_kho.csv   Dữ liệu thử
```
