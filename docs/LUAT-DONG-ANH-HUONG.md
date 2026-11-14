# Kiểm tra công thức và luật xác định dòng dữ liệu ảnh hưởng đến kết quả

Ngày 14/11/2026. Phạm vi mã: `src/core/stats.js`, `src/core/distributions.js`, `src/analysis/bootstrap.js`, `src/analysis/rowcheck.js`. Tài liệu đối chiếu: [SMARTPLS-FORMULAS.md](SMARTPLS-FORMULAS.md).

## Phần 1 — Mã hiện tại có đúng công thức không

**Kết luận:** mọi công thức ứng dụng đang cài đều khớp với tài liệu, sau khi sửa hai điểm lệch cùng ngày: HTMT của thang đo một biến và mặc định đổi dấu trong bootstrap. Năm điểm còn lại không kết luận được vì tài liệu SmartPLS không công bố chi tiết.

**Cách kiểm:** đọc từng dòng mã so với công thức, rồi chạy một kịch bản tính lại độc lập trên `du_lieu_mau.csv` (250 phiếu, 4 thang đo, 4 quan hệ) — 41 phép so đều khớp trong sai số 10⁻⁶. Đây là kiểm công thức, **không phải** so với bản xuất từ SmartPLS; chưa có bản xuất nào để đối chứng.

### 1.1 Khớp tài liệu

| Thành phần | Vị trí | Cách kiểm độc lập | Kết quả |
|---|---|---|---|
| Chuẩn hóa z, khởi tạo weight +1, 3.000 vòng, ngưỡng 10⁻⁷ | `stats.js:122-166` | Đọc mã | Khớp |
| Path scheme: tiền tố dùng hệ số hồi quy, hậu tố dùng tương quan | `stats.js:175-182` | Dựng lại proxy từ điểm đã hội tụ, tỷ lệ weight mới/cũ bằng nhau ở cả 4 thang đo | Khớp |
| Mode A, chuẩn hóa `var(Y) = 1` | `stats.js:195-196` | Phương sai điểm = 1,000000 | Khớp |
| Outer loading = `cor(x, Y)` | `stats.js:207` | Tính lại từ weight | Khớp |
| Cronbach's alpha chuẩn hóa | `stats.js:91-99` | Bằng alpha công thức gốc trên dữ liệu z | Khớp |
| ρc, AVE | `stats.js:214-217` | Kiểm thử có sẵn | Khớp |
| ρA | `stats.js:219-230` | Tính lại bằng dạng ma trận | Khớp |
| HTMT (trị tuyệt đối, HTMT+) | `stats.js:252-263` | Ví dụ Exhibit 4.7 của Primer: ứng dụng ra 0,632, sách ghi 0,632 | Khớp |
| Fornell-Larcker, cross loadings | `stats.js:209, 244` | Đọc mã | Khớp |
| VIF outer và inner | `stats.js:63-67` | Bằng `1/(1−R²)` | Khớp |
| β (OLS), R², R² hiệu chỉnh | `stats.js:266-274` | Giải phương trình chuẩn bằng tay | Khớp |
| f² (giữ điểm mô hình đầy đủ) | `stats.js:276-283` | Tính lại | Khớp |
| Tác động gián tiếp, tổng tác động | `bootstrap.js` `extract` | Bằng `(I − B)⁻¹ − I` | Khớp |
| Bootstrap: mean, STDEV (chia B−1), T = \|O/STDEV\| | `bootstrap.js` `summarize` | Ví dụ 10 giá trị | Khớp |
| BCa: z0, hệ số gia tốc jackknife, phân vị hiệu chỉnh | `bootstrap.js` `summarize` | Đọc mã so với Efron (1987) | Khớp công thức |
| HTMT inference theo tùy chọn kiểm định chung (sửa 14/11/2026; trước đó luôn một phía 95%) | `bootstrap.js` `summarize` | Kiểm thử | Khớp |
| Phân phối t, chuẩn, χ² | `distributions.js` | Bảng tra: t(10) = 2,228 → p = 0,050; z₀,₉₇₅ = 1,960; χ²₀,₀₀₁(10) = 29,588 | Khớp |
| Hai engine (dữ liệu gốc và ma trận tương quan) | `stats.js` / `bootstrap.js` | Kiểm thử có sẵn, 4 bộ CSV | Khớp 10⁻⁸ |

### 1.2 Lệch so với SmartPLS

| # | Điểm lệch | Bằng chứng | Mức ảnh hưởng |
|---|---|---|---|
| 1 | **Đã sửa.** Trước đây HTMT không được tính cho cặp có thang đo một biến; SmartPLS có tính. | Primer, Exhibit 4.18 báo cáo khoảng tin cậy HTMT cho cặp CUSA–COMP, trong đó CUSA chỉ có một biến. | Nay coi tương quan nội bộ trung bình của thang đo một biến bằng 1. Sách chỉ cho thấy SmartPLS có báo cáo giá trị này, không in công thức; quy ước bằng 1 là theo định nghĩa HTMT, cần đối chiếu số với SmartPLS. |
| 2 | **Đã sửa.** Trước đây bootstrap đổi dấu từng mẫu con theo loading của mô hình gốc. | Sách Primer chọn “No Sign Changes” trong mọi ví dụ bootstrapping. | Nay mặc định không đổi dấu; đổi dấu theo thang đo còn là tùy chọn. Chỉ khác khi có mẫu con bị lật chiều. |

### 1.3 Chưa kết luận được

| # | Điểm | Ứng dụng đang làm | Vì sao chưa kết luận |
|---|---|---|---|
| 3 | Quy tắc hội tụ | Chênh lệch tuyệt đối **lớn nhất** của weight < 10⁻⁷ | Primer nói "tổng thay đổi"; trang SmartPLS chỉ nói "thay đổi". Ở ngưỡng 10⁻⁷ kết quả gần như không khác. |
| 4 | Bậc tự do của p-value bootstrap | `df = B − 1` | Hai nguồn không nêu. Với B = 10.000 thì t và chuẩn cho p gần như trùng nhau. |
| 5 | Cách nội suy phân vị | Tuyến tính (kiểu 7) | Không nguồn nào nêu. Khác biệt cỡ 1/B. |
| 6 | Skewness, kurtosis | Công thức tổng thể (chia n), kurtosis trừ 3 | SmartPLS không công bố dùng bản tổng thể hay bản hiệu chỉnh mẫu. |
| 7 | Mô hình chưa có quan hệ | Tự nối mọi cặp, dùng Factor | Quy ước riêng của ứng dụng; SmartPLS không chạy mô hình này. |

### 1.4 Chưa cài

Mode B (formative), PLSc, WPLS, PCA weighting, kết quả chưa chuẩn hóa, cỡ mẫu tối thiểu, model fit (SRMR, d_ULS, d_G, NFI, Chi²), khoảng studentized, permutation, MICOM, MGA, PLSpredict, CVPAT, model comparison (BIC), FIMIX, IPMA, tương tác ba chiều. (Biến điều tiết hai chiều đã được cài ngày 14/11/2026, xem `SMARTPLS-FORMULAS.md` mục 6.1.)

---

## Phần 2 — Luật xác định dòng ảnh hưởng đến kết quả

### 2.1 Vì sao truy được

Mọi kết quả PLS là hàm của ma trận tương quan `R`, và `R` là tổng đóng góp của từng dòng. Với dữ liệu đã chuẩn hóa:

```
r_xy = Σ_i  z_x,i · z_y,i / (N − 1)
```

Vì vậy bỏ một dòng làm `R` đổi một lượng tính được chính xác, kéo theo weight, loading, β, và phân phối bootstrap.

### 2.2 Lớp A — Luật chất lượng trả lời (được dùng làm căn cứ loại phiếu)

Không phụ thuộc kết quả phân tích. Đặt ngưỡng trước khi xem kết quả.

| Luật | Công thức | Ngưỡng mặc định | Ý nghĩa | Xử lý đề xuất |
|---|---|---|---|---|
| A1 Trả lời một kiểu | Độ lệch chuẩn của mọi câu trong dòng | ≤ 0,30 (khi có từ 5 câu) | Chọn cùng một đáp án cho gần hết các câu | Loại |
| A2 Không nhất quán trong thang đo | Trung bình (qua các thang đo) của độ lệch chuẩn giữa các câu cùng thang đo | ≥ 1/4 độ rộng thang (thang 1–5: 1,0) | Trả lời ngẫu nhiên, hoặc quên đảo chiều câu hỏi | Kiểm câu đảo chiều trước; nếu không phải thì loại |
| A3 Ngoại lai đa biến | `D² = z' R⁻¹ z`, p theo χ² với df = số biến | p < 0,001 | Tổ hợp câu trả lời rất hiếm | Đối chiếu phiếu gốc; lỗi nhập thì sửa, không thì cân nhắc loại |
| A4 Thiếu nhiều câu | Tỷ lệ ô trống trong dòng | > 15% | Phiếu bỏ dở | Loại |

Cài tại `rowcheck.js:48-89`.

### 2.3 Lớp B — Luật ảnh hưởng đến kết quả (chỉ để soi, không phải căn cứ loại)

Ký hiệu: `θ` là một hệ số (β hoặc tác động gián tiếp); `θ_(i)` là hệ số khi bỏ dòng `i`; `θ*_b` là hệ số ở mẫu bootstrap `b`; `c_b,i` là số lần dòng `i` xuất hiện trong mẫu `b`.

| Luật | Công thức | Ngưỡng | Đọc kết quả |
|---|---|---|---|
| B1 Thay đổi chỉ số đo lường | `Δ = chỉ số_(i) − chỉ số` cho α, CR, AVE | Δ dương vượt trung bình + 3 độ lệch chuẩn của mọi dòng (tối thiểu 0,003) | Bỏ dòng thì độ tin cậy tăng bất thường |
| B2 Thay đổi hệ số | `Δθ_i = θ_(i) − θ̂` (jackknife) | Xem B3 | Dương: dòng đang kéo hệ số xuống |
| B3 Phần phương sai do dòng tạo ra | `share_i = (θ_(i) − θ̄)² / Σ_j (θ_(j) − θ̄)²` | ≥ `9/N` (kỳ vọng `1/N`) | Dòng làm phình sai số chuẩn. Tương đương `\|Δθ_i\|` vượt `3/√N` sai số chuẩn |
| B4 Kiểm định khi vắng dòng | `se_(i)` = độ lệch chuẩn của `θ*_b` trên các mẫu có `c_b,i = 0`; `t_(i) = \|θ_(i)\| / se_(i)`; p theo t với df = số mẫu đó − 1 | `(p_(i) < α)` khác `(p < α)` | Kết luận phụ thuộc vào đúng một phiếu |
| B5 Chiều kéo | `corr_b(c_b,i , θ*_b)` | Dấu | Dương: thêm bản sao của dòng thì hệ số tăng |
| B6 Có mặt ở đuôi bất lợi | Trung bình `c_b,i` trên `α/2` số mẫu có `θ*_b` gần hoặc vượt qua 0 nhất | Lớn hơn 1 rõ rệt (kỳ vọng 1) | Dòng kéo khoảng tin cậy về phía 0 |

Một dòng được gắn cờ "ảnh hưởng lớn" khi thỏa B1, hoặc B3, hoặc B4. B2, B5, B6 dùng để giải thích dòng đó tác động thế nào. B1 cài tại `rowcheck.js:91-124`; B2–B6 tại hàm `influence` trong `bootstrap.js`.

Liên hệ giữa B3 và sai số chuẩn bootstrap:

```
se_jackknife² = (N − 1)/N · Σ_i (θ_(i) − θ̄)²   ≈   STDEV² của bootstrap
```

nên `share_i` chính là phần của STDEV² mà dòng `i` chịu trách nhiệm.

Về B4: khoảng 36,8% số mẫu bootstrap không chứa một dòng cho trước (với 10.000 mẫu là khoảng 3.680), nên `se_(i)` dao động nhiều hơn STDEV chính. Dưới 5.000 mẫu chỉ nên coi là gợi ý.

### 2.4 Quy trình duyệt

1. Đặt ngưỡng lớp A, quét, ghi lại số dòng vi phạm từng luật.
2. Chạy Bootstrapping (nên 10.000 mẫu), mở mục "Ảnh hưởng theo dòng".
3. Với mỗi dòng bị gắn cờ lớp B, xem nó có vi phạm lớp A không:
   - Có: loại, ghi lý do theo luật lớp A.
   - Không: đối chiếu phiếu gốc để tìm lỗi nhập liệu. Không có lỗi thì giữ lại.
4. Tính lại, báo cáo kết quả trước và sau khi loại, kèm số phiếu loại theo từng luật.

### 2.5 Những gì không làm

- Không loại phiếu chỉ vì nó thỏa luật lớp B. Chọn dữ liệu theo kết quả làm p-value và khoảng tin cậy mất ý nghĩa.
- Không sửa câu trả lời để kết quả đẹp hơn. Chỉ sửa khi có căn cứ ngoài kết quả: lỗi nhập so với phiếu gốc, giá trị ngoài thang đo, câu đảo chiều chưa đảo.

### 2.6 Ví dụ trên dữ liệu mẫu

`du_lieu_mau.csv`, 250 phiếu, 5.000 mẫu bootstrap, seed 1, quan hệ `TC → HL` (β = 0,442; T = 8,919).

| Dòng Excel | β nếu bỏ | Δβ (B2) | Phần phương sai (B3) | Chiều kéo (B5) | Đuôi bất lợi (B6) | Đổi kết luận (B4) |
|---|---|---|---|---|---|---|
| 9 | 0,462 | +0,020 | 16,3% (ngưỡng 3,6%) | Kéo xuống | 2,32 | Không |
| 247 | 0,429 | −0,013 | 6,8% | Kéo lên | 0,49 | Không |

Dòng 9 trả lời TC = 4, 5, 5, 4 nhưng HL = 2, 1, 2, 1: ngược chiều quan hệ dương của cả mẫu, nên một mình nó tạo ra 16,3% phương sai của hệ số và có mặt ở đuôi bất lợi gấp 2,3 lần kỳ vọng. Dòng này không vi phạm luật lớp A nào, nên theo quy trình là giữ lại sau khi đối chiếu phiếu gốc.

### 2.7 Giới hạn

- B2–B6 chỉ tính cho hệ số đường dẫn và tác động gián tiếp cụ thể; chưa tính cho loading, weight, R², HTMT.
- Các luật xét từng dòng riêng lẻ. Hai dòng bất thường giống nhau có thể che nhau; chưa có phép đo "phải bỏ ít nhất bao nhiêu dòng thì kết luận đổi".
- Ngưỡng `9/N` của B3 là do tôi chọn theo quy tắc `3/√N`, không lấy từ tài liệu SmartPLS (SmartPLS không có chức năng này).
