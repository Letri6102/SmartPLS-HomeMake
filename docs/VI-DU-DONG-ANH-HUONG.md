# Ví dụ minh họa: tìm dòng dữ liệu đang ảnh hưởng đến kết quả

Tài liệu này đi từng bước qua công thức, với hai ví dụ:

- **Ví dụ 1** — 10 dòng, 2 biến, tính tay được. Mục đích là thấy rõ công thức.
- **Ví dụ 2** — dữ liệu mẫu của ứng dụng (250 phiếu, 16 biến), số liệu lấy từ chính ứng dụng.

Bảng luật đầy đủ ở [LUAT-DONG-ANH-HUONG.md](LUAT-DONG-ANH-HUONG.md). Mọi con số dưới đây đều do máy tính ra từ mã của ứng dụng, seed = 1.

---

## Ví dụ 1 — 10 dòng, 2 biến

Mô hình: `X → Y`. Với một biến dự báo và dữ liệu chuẩn hóa, hệ số đường dẫn `β` bằng đúng hệ số tương quan `r`, nên ở đây `θ = r`.

| Dòng | X | Y |
|---|---|---|
| 1 | 1 | 1 |
| 2 | 2 | 2 |
| 3 | 2 | 3 |
| 4 | 3 | 2 |
| 5 | 3 | 4 |
| 6 | 4 | 3 |
| 7 | 4 | 5 |
| 8 | 5 | 4 |
| 9 | 5 | 5 |
| **10** | **5** | **1** |

Chín dòng đầu đi theo xu hướng "X cao thì Y cao". Dòng 10 đi ngược: X cao nhất, Y thấp nhất.

### Bước 1 — Đóng góp của từng dòng vào hệ số

```
z_x,i = (X_i − X̄) / s_X          X̄ = 3,4   s_X = 1,4298
z_y,i = (Y_i − Ȳ) / s_Y          Ȳ = 3,0   s_Y = 1,4907

đóng góp_i = z_x,i · z_y,i / (N − 1)
r = Σ đóng góp_i
```

Tính cho dòng 10: `z_x = (5 − 3,4)/1,4298 = 1,119`; `z_y = (1 − 3)/1,4907 = −1,342`; đóng góp = `1,119 × (−1,342) / 9 = −0,1668`.

| Dòng | z_x | z_y | Đóng góp |
|---|---|---|---|
| 1 | −1,679 | −1,342 | +0,2502 |
| 2 | −0,979 | −0,671 | +0,0730 |
| 3 | −0,979 | 0,000 | 0,0000 |
| 4 | −0,280 | −0,671 | +0,0209 |
| 5 | −0,280 | +0,671 | −0,0209 |
| 6 | +0,420 | 0,000 | 0,0000 |
| 7 | +0,420 | +1,342 | +0,0626 |
| 8 | +1,119 | +0,671 | +0,0834 |
| 9 | +1,119 | +1,342 | +0,1668 |
| **10** | +1,119 | −1,342 | **−0,1668** |
| **Tổng** | | | **r = 0,4692** |

Đọc bảng: dòng có đóng góp âm lớn là dòng kéo hệ số xuống. Chỉ có dòng 10 làm việc đó ở mức đáng kể.

Bước này chỉ là xấp xỉ, vì bỏ một dòng thì trung bình và độ lệch chuẩn cũng đổi. Bước 2 cho con số chính xác.

### Bước 2 — Bỏ từng dòng (jackknife): luật B2 và B3

```
θ_(i)   = hệ số tính lại khi bỏ dòng i
Δθ_i    = θ_(i) − θ̂                                   (B2: thay đổi hệ số)
θ̄       = trung bình của mọi θ_(i)
share_i = (θ_(i) − θ̄)² / Σ_j (θ_(j) − θ̄)²            (B3: phần phương sai do dòng i tạo ra)
```

| Dòng | r khi bỏ dòng | Δ (B2) | (r_(i) − r̄)² | share (B3) |
|---|---|---|---|---|
| 1 | 0,2684 | −0,2008 | 0,03963 | 22,6% |
| 2 | 0,4253 | −0,0439 | 0,00178 | 1,0% |
| 3 | 0,4997 | +0,0305 | 0,00104 | 0,6% |
| 4 | 0,4612 | −0,0080 | 0,00004 | 0,0% |
| 5 | 0,5091 | +0,0399 | 0,00173 | 1,0% |
| 6 | 0,4743 | +0,0052 | 0,00005 | 0,0% |
| 7 | 0,4582 | −0,0110 | 0,00009 | 0,0% |
| 8 | 0,4213 | −0,0478 | 0,00213 | 1,2% |
| 9 | 0,3500 | −0,1192 | 0,01379 | 7,9% |
| **10** | **0,8071** | **+0,3380** | 0,11539 | **65,7%** |
| | r̄ = 0,4675 | | Σ = 0,17567 | 100% |

Bỏ dòng 10 thì hệ số nhảy từ 0,469 lên 0,807. Mỗi dòng kỳ vọng chỉ tạo ra `1/N = 10%` phương sai; dòng 10 tạo ra 65,7%.

Sai số chuẩn jackknife, xấp xỉ sai số chuẩn bootstrap:

```
se_jack = sqrt( (N − 1)/N · Σ (θ_(i) − θ̄)² ) = sqrt(0,9 × 0,17567) = 0,398
```

Ngưỡng của ứng dụng cho B3 là `share ≥ 9/N`, tương đương `|Δθ_i| > 3/√N × se`. Ngưỡng này chỉ có nghĩa khi `N` từ khoảng 30 trở lên (với N = 10 thì `9/N = 0,9`); ví dụ này vì thế so với mức kỳ vọng `1/N`.

### Bước 3 — Bootstrap và ma trận đếm

Rút 5.000 mẫu, mỗi mẫu 10 dòng có hoàn lại. Ghi lại `c_b,i` = số lần dòng `i` xuất hiện trong mẫu `b`. Sáu mẫu đầu:

| Mẫu | Số lần xuất hiện của dòng 1 → 10 | r* |
|---|---|---|
| 1 | 1 0 1 0 1 1 2 1 0 **3** | −0,019 |
| 2 | 1 2 1 1 4 0 0 1 0 **0** | +0,727 |
| 3 | 1 1 3 0 1 2 1 1 0 **0** | +0,714 |
| 4 | 0 2 1 1 1 0 0 4 0 **1** | +0,407 |
| 5 | 1 2 2 0 1 1 1 1 1 **0** | +0,835 |
| 6 | 0 0 1 1 1 0 2 1 0 **4** | −0,397 |

Nhìn cột cuối là thấy quy luật: mẫu không có dòng 10 cho `r*` trên 0,7; mẫu có 3–4 bản sao của dòng 10 cho `r*` âm.

Kết quả trên cả 5.000 mẫu:

```
STDEV = 0,3245      T = |0,4692 / 0,3245| = 1,446      p = 0,148
Khoảng tin cậy 95% (percentile) = [−0,246 ; 0,913]   → chứa 0, không có ý nghĩa
```

### Bước 4 — Kiểm định khi vắng dòng: luật B4

Xác suất một dòng không được rút vào một mẫu là `(1 − 1/N)^N`, tiến tới `e⁻¹ = 36,8%` khi N lớn (N = 10: 34,9%). Lấy riêng các mẫu có `c_b,i = 0`:

```
se_(i) = độ lệch chuẩn của r* trên các mẫu không chứa dòng i
t_(i)  = |θ_(i)| / se_(i)          θ_(i) lấy từ Bước 2
p_(i)  = p hai phía của t_(i), df = số mẫu đó − 1
Đổi kết luận khi (p_(i) < α) khác (p < α)
```

| Bỏ dòng | Số mẫu không chứa dòng | r | STDEV | T | p | Khoảng tin cậy 95% | Kết luận |
|---|---|---|---|---|---|---|---|
| (không bỏ) | 5.000 | 0,469 | 0,3245 | 1,446 | 0,148 | [−0,246 ; 0,913] | Không có ý nghĩa |
| 1 | 1.686 | 0,268 | 0,3432 | 0,782 | 0,434 | [−0,388 ; 0,845] | Không có ý nghĩa |
| 7 | 1.702 | 0,458 | 0,3365 | 1,361 | 0,174 | [−0,311 ; 0,930] | Không có ý nghĩa |
| **10** | 1.768 | 0,807 | **0,1146** | **7,041** | **< 0,001** | [0,498 ; 0,944] | **Có ý nghĩa — đổi kết luận** |

Dòng 10 tác động theo hai đường cùng lúc: kéo hệ số xuống (0,807 → 0,469) và làm sai số chuẩn phình gần gấp ba (0,115 → 0,325). Cả hai đều làm T nhỏ đi.

### Bước 5 — Chiều kéo và đuôi bất lợi: luật B5, B6

```
B5  corr_i = tương quan giữa c_b,i và r*_b qua mọi mẫu b
B6  tail_i = trung bình c_b,i trên α/2 số mẫu có r* thấp nhất (phía 0 so với hệ số gốc)
             kỳ vọng = 1
```

Với α = 0,05 và 5.000 mẫu, đuôi bất lợi gồm 125 mẫu.

| Dòng | corr (B5) | tail (B6) | Đọc |
|---|---|---|---|
| 1 | +0,399 | 0,18 | Kéo hệ số lên; gần như vắng mặt ở đuôi bất lợi |
| 7 | +0,017 | 0,94 | Trung tính |
| **10** | **−0,816** | **2,64** | Kéo hệ số xuống rất mạnh; có mặt ở đuôi bất lợi gấp 2,6 lần kỳ vọng |

### Kết luận của ví dụ 1

| Luật | Dòng 10 | Mức so sánh |
|---|---|---|
| B2 thay đổi hệ số | +0,338 | Lớn nhất, gấp 1,7 lần dòng đứng thứ hai |
| B3 phần phương sai | 65,7% | Kỳ vọng 10% |
| B4 kiểm định khi vắng dòng | p từ 0,148 xuống < 0,001 | Đổi kết luận |
| B5 chiều kéo | −0,816 | Kéo xuống |
| B6 đuôi bất lợi | 2,64 | Kỳ vọng 1 |

Cả năm phép đo cùng chỉ vào dòng 10. Lưu ý dòng 1 cũng có share cao (22,6%) nhưng theo chiều ngược lại: nó là điểm đầu mút đang **đỡ** cho hệ số, bỏ nó thì hệ số giảm.

Biết dòng 10 ảnh hưởng lớn chưa đủ để loại nó. Xem phần "Sau khi tìm ra dòng" ở cuối.

---

## Ví dụ 2 — Dữ liệu mẫu của ứng dụng

`du_lieu_mau.csv`: 250 phiếu, thang đo TC (4 biến), CL (5), HL (4), TT (3); quan hệ `TC → HL`, `CL → HL`, `HL → TT`. Bootstrap 10.000 mẫu.

Kết quả gốc của `TC → HL`: β = 0,4420; STDEV = 0,0494; T = 8,955; khoảng tin cậy 95% = [0,339 ; 0,533].

Xét hai phiếu:

| Dòng Excel | TC | CL | HL | TT |
|---|---|---|---|---|
| 9 | 4 5 5 4 | 3 3 5 3 3 | 2 1 2 1 | 2 2 3 |
| 48 | 4 5 5 2 | 4 3 3 4 2 | 4 3 3 5 | 2 3 4 |

### Lớp A — chất lượng trả lời

```
A1  sd_dòng = độ lệch chuẩn của cả 16 câu trả lời               vi phạm khi ≤ 0,30
A2  inc     = trung bình (qua 4 thang đo) của độ lệch chuẩn
              giữa các câu cùng thang đo                         vi phạm khi ≥ 1,0 (thang 1–5)
A3  D²      = z' R⁻¹ z ; p theo χ² với df = 16                   vi phạm khi p < 0,001 (D² > 39,25)
A4  thiếu   = tỷ lệ ô trống                                      vi phạm khi > 15%
```

| Luật | Dòng 9 | Dòng 48 | Ngưỡng |
|---|---|---|---|
| A1 sd của dòng | 1,317 | 1,033 | ≤ 0,30 |
| A2 không nhất quán | 0,657 | **1,052** | ≥ 1,0 |
| A3 Mahalanobis D² (p) | 29,39 (0,021) | 31,15 (0,013) | p < 0,001 |
| A4 thiếu | 0% | 0% | > 15% |
| **Kết quả** | Không vi phạm | **Vi phạm A2** | |

Cách tính A2 cho dòng 48: độ lệch chuẩn của TC (4, 5, 5, 2) = 1,414; CL (4, 3, 3, 4, 2) = 0,837; HL (4, 3, 3, 5) = 0,957; TT (2, 3, 4) = 1,000. Trung bình = 1,052.

### Lớp B — ảnh hưởng đến `TC → HL`

Vì sao dòng 9 đáng chú ý: điểm thang đo chuẩn hóa của phiếu này là TC = +1,924 và HL = −1,618. Áp công thức Bước 1 lên tương quan giữa hai thang đo: `1,924 × (−1,618) / 249 = −0,0125`. Trung bình mỗi phiếu đóng góp `0,553 / 250 = +0,0022`, nên phiếu này một mình xóa đi phần đóng góp của gần sáu phiếu bình thường.

| Luật | Dòng 9 | Dòng 48 | Dòng 247 | Ngưỡng |
|---|---|---|---|---|
| B2 β khi bỏ dòng (Δ) | 0,4624 (+0,0204) | 0,4399 (−0,0021) | 0,4288 (−0,0132) | — |
| B3 phần phương sai | **16,28%** | 0,17% | **6,76%** | ≥ 9/250 = 3,6% (kỳ vọng 0,4%) |
| B4 số mẫu không chứa dòng | 3.643 | 3.627 | 3.638 | — |
| B4 STDEV khi vắng dòng | 0,0450 | 0,0488 | 0,0494 | gốc 0,0494 |
| B4 T khi vắng dòng | 10,282 | 9,008 | 8,673 | gốc 8,955 |
| B4 đổi kết luận | Không | Không | Không | — |
| B5 chiều kéo | −0,403 (xuống) | +0,064 | +0,250 (lên) | — |
| B6 đuôi bất lợi | 2,28 | 0,93 | 0,54 | kỳ vọng 1 |
| **Gắn cờ ảnh hưởng lớn** | **Có** | Không | **Có** | |

Kiểm lại B3 của dòng 9 bằng quy tắc tương đương: `|Δ| / STDEV = 0,0204 / 0,0494 = 0,41`, vượt `3/√250 = 0,19`.

### Đọc kết quả của ví dụ 2

| Dòng | Lớp A | Lớp B | Xử lý theo quy trình |
|---|---|---|---|
| 9 | Đạt | Ảnh hưởng lớn, kéo `TC → HL` xuống | Đối chiếu phiếu gốc. Không có lỗi nhập thì **giữ lại**: đây là một người thật sự đánh giá TC cao nhưng HL thấp. |
| 48 | Vi phạm A2 | Không ảnh hưởng (0,17%) | Kiểm xem TC4 có phải câu đảo chiều không; nếu không thì được phép loại theo A2. Loại hay giữ thì `TC → HL` gần như không đổi. |
| 247 | (xem trên ứng dụng) | Ảnh hưởng lớn, kéo `TC → HL` lên | Như dòng 9. Lưu ý phiếu này đang **có lợi** cho giả thuyết; soi phiếu có hại mà bỏ qua phiếu có lợi là thiên lệch. |

Hai lớp luật trả lời hai câu hỏi khác nhau, và ví dụ này cho thấy chúng không trùng nhau: phiếu kém chất lượng (48) không ảnh hưởng đến kết quả, còn phiếu ảnh hưởng nhất (9) lại trả lời hoàn toàn hợp lệ.

---

## Sau khi tìm ra dòng

1. Dòng vi phạm lớp A: được loại, ghi rõ luật nào.
2. Dòng chỉ thỏa lớp B: đối chiếu phiếu gốc để tìm lỗi nhập liệu, giá trị ngoài thang, câu đảo chiều chưa đảo. Có lỗi thì sửa theo phiếu gốc. Không có lỗi thì giữ.
3. Báo cáo kết quả trước và sau, kèm số phiếu loại theo từng luật.

Không loại phiếu chỉ vì nó làm kết quả xấu đi, và không sửa câu trả lời cho kết quả đẹp hơn: sau khi chọn dữ liệu theo kết quả, p-value và khoảng tin cậy không còn đúng nghĩa. Trong ví dụ 1, nếu dòng 10 là một phiếu hợp lệ thì kết luận đúng của nghiên cứu là "quan hệ chưa đủ bằng chứng với 10 quan sát", không phải "có ý nghĩa sau khi bỏ một phiếu".

## Xem trên ứng dụng

- Lớp A và B1: mục **Dòng đáng ngờ**.
- B2–B6: chạy **Bootstrapping**, mở **Ảnh hưởng theo dòng**. Bảng trên cho biết bao nhiêu dòng làm đổi kết luận của từng quan hệ; bảng dưới liệt kê từng dòng với đủ các cột ở trên.
