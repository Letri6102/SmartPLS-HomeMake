# Đối chiếu SmartPLS 4 — 14/10/2026

Phạm vi: PLS-SEM chuẩn, dữ liệu chuẩn hóa, reflective Mode A. Đây là rà soát mã và kiểm thử nội bộ, chưa phải chứng nhận kết quả trùng SmartPLS. Chưa có bảng kết quả xuất từ SmartPLS chạy trên cùng dữ liệu/mô hình/cấu hình để đối chứng.

| Thành phần | Kết quả rà soát |
|---|---|
| Path / Factor weighting | Cấu trúc thuật toán phù hợp tài liệu; hai engine (dữ liệu gốc và ma trận tương quan) khớp trong dung sai 1e-8 trên bốn bộ CSV thử, với cả Path và Factor. |
| Khởi tạo / hội tụ | Trọng số +1, 3.000 vòng, ngưỡng 1e-7. Đã chặn báo cáo khi không hội tụ. Chưa xác nhận quy tắc tổng hợp chênh lệch trọng số nội bộ SmartPLS; ứng dụng dùng sai khác tuyệt đối lớn nhất. |
| Loadings, alpha, CR, AVE | Công thức tương quan và độ tin cậy chuẩn hóa nhất quán. Alpha thô hiển thị riêng. Kiểm tra alpha bằng ví dụ có đáp án giải tích. |
| rho_A | Công thức dựa trên trọng số chuẩn hóa và các phần tử ngoài đường chéo của ma trận tương quan; chưa có bộ đáp án SmartPLS đối chứng độc lập. |
| HTMT | Dùng trị tuyệt đối của từng tương quan, phù hợp HTMT+ được SmartPLS mô tả. Không tính cho cặp chứa thang đo một biến. |
| Beta, R², VIF, f² | Hồi quy trên điểm construct chuẩn hóa. f² giữ điểm construct của mô hình đầy đủ, rồi bỏ predictor khỏi hồi quy; phù hợp hướng dẫn case study SmartPLS. R² hiệu chỉnh trả giá trị không xác định nếu không đủ bậc tự do. |
| Bootstrap | Lấy mẫu có hoàn lại, cỡ mẫu bằng dữ liệu đã xử lý thiếu; mặc định 10.000. Seed tái lập trong ứng dụng, không đảm bảo cùng seed cho cùng chuỗi mẫu với SmartPLS. |
| Đổi dấu bootstrap | Đã sửa: căn theo vector loadings của mô hình gốc, áp dụng cho cả bootstrap và jackknife. Đây là lựa chọn của ứng dụng, cần kiểm tra cấu hình đổi dấu khi so sánh SmartPLS. |
| Percentile / BCa | Percentile nội suy tuyến tính. BCa dùng jackknife đầy đủ; không trả BCa khi thiếu một hoặc nhiều mẫu jackknife hợp lệ. Chưa hỗ trợ studentized. |
| p-value | Hiện dùng Student t với df = B hợp lệ − 1. Tài liệu SmartPLS được kiểm tra không xác định đủ công thức này; chưa xác nhận tương đương. Ưu tiên xem thêm khoảng tin cậy bootstrap. |
| Không có đường dẫn | Ứng dụng tự dùng Factor trên toàn bộ các cặp construct: đây là quy ước riêng, không coi là cùng mô hình với SmartPLS. |
| Dữ liệu thiếu | Hỗ trợ thay bằng trung bình hoặc loại theo dòng, cần chọn giống nhau khi đối chiếu. |

Không hỗ trợ: Mode B, PLSc, PCA weighting, kết quả chưa chuẩn hóa, biến điều tiết, mô hình bậc cao, MGA, PLSpredict và các chức năng SmartPLS ngoài phạm vi này.

## Nguồn chính thức

- Thuật toán và thiết lập: https://www.smartpls.com/documentation/algorithms-and-techniques/core-algorithm/pls/
- Bootstrapping: https://www.smartpls.com/documentation/algorithms-and-techniques/resampling-and-inference/bootstrapping/
- HTMT: https://www.smartpls.com/documentation/algorithms-and-techniques/validity-and-model-fit/discriminant-validity-assessment/
- f² và ví dụ mô hình: https://www.smartpls.com/primer-book-case-studies/primer_3e_chap6_case_new.pdf

## Thay đổi giao diện

Hình tròn xanh, biến quan sát vàng; thanh công cụ và danh sách biến gọn hơn. Sửa padding thừa của khung rỗng và cách tính vùng vẽ gây thanh cuộn ngang. Vừa khung xét cả chiều cao và chiều rộng. Bổ sung công cụ Bàn tay (H), Ctrl + lăn chuột thu phóng quanh con trỏ, nút Mở rộng / Thu gọn và Escape để trở về. Chặn đường dẫn hoặc đảo chiều gây vòng lặp. Bố cục tự động không còn giới hạn sáu cột thang đo.

## Kiểm chứng

Chạy `node --test tests/numerics.test.js`: 7 kiểm tra đạt. Đây là kiểm tra công thức, tính nhất quán hai engine và hồi quy lỗi bootstrap; không phải so sánh với bản xuất SmartPLS.

Kiểm tra trực quan chưa hoàn tất: trình duyệt kiểm tra không kết nối được máy chủ cục bộ; Computer Use dừng vì không xác định được URL Chrome đủ tin cậy để kiểm tra chính sách. Cần kiểm tra trực tiếp các thao tác kéo, nối, zoom, mở rộng và xuất PNG trong trình duyệt của người dùng.
