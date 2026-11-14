# Công thức và cách tính các thuật toán trong SmartPLS

Tổng hợp ngày 14/11/2026 để làm ngữ cảnh cài đặt cho SmartPLS-HomeMake.

## 0. Nguồn và độ tin cậy

| Nhãn | Nguồn | Ghi chú |
|---|---|---|
| **[Doc]** | 17 trang tại smartpls.com/documentation/algorithms-and-techniques (đọc 14/11/2026) | Chủ yếu mô tả và thiết lập; chỉ có công thức đầy đủ cho thuật toán PLS (bảng Lohmöller) và cỡ mẫu tối thiểu. |
| **[Primer]** | Hair, Hult, Ringle, Sarstedt — *A Primer on PLS-SEM*, 3e (2022) | Có công thức: alpha, ρc, ρA, AVE, HTMT, VIF, f², MAE/RMSE, BIC, Akaike weights, cỡ mẫu, t-value, khoảng tin cậy studentized. |
| **[Lit]** | Bài báo gốc mà hai nguồn trên dẫn tới | Tôi viết lại theo hiểu biết về bài gốc, **chưa đối chiếu trực tiếp** trong phiên này. Áp dụng cho: BCa, d_ULS/d_G, Bollen-Stine, PLSc, WPLS, PLS-MGA, parametric/Welch, MICOM, CVPAT, FIMIX, IPMA. Cần kiểm bằng bản xuất SmartPLS trước khi coi là khớp. |

Ký hiệu: `N` số quan sát; `x_kj` biến quan sát `k` của khối `j` (đã chuẩn hóa z); `X_j` ma trận khối `j`; `Y_j` điểm biến tiềm ẩn (phương sai 1); `w` outer weight; `l` outer loading; `p`/`β` hệ số đường dẫn; `S` hoặc `R` ma trận tương quan của biến quan sát; `r_ij` tương quan giữa hai biến tiềm ẩn.

---

## 1. Ước lượng

### 1.1 Thuật toán PLS-SEM [Doc + Primer]

**Chuẩn bị.** Chuẩn hóa từng biến quan sát: `x = (raw − mean) / sd`. Mọi hồi quy vì thế không có hệ số chặn.

**Giai đoạn 1 — lặp tìm outer weights.** Khởi tạo `w = +1` cho mọi biến, tính bước #4 một lần, rồi lặp #1 → #4:

```
#1 Inner weights e_ji (chỉ khác 0 khi Y_j và Y_i nối trực tiếp):
   Centroid (SmartPLS 4 đã bỏ):  e_ji = sign(cor(Y_j, Y_i))
   Factor:                        e_ji = cor(Y_j, Y_i)
   Path (mặc định):
      Y_i là tiền tố của Y_j (i → j):  e_ji = hệ số hồi quy bội của Y_j theo TẤT CẢ tiền tố của nó
      Y_i là hậu tố của Y_j (j → i):   e_ji = cor(Y_j, Y_i)

#2 Inside approximation:   Ỹ_j = Σ_i e_ji · Y_i

#3 Outer weights tạm thời:
   Mode A (reflective):  w̃_kj = cov(x_kj, Ỹ_j)              — hồi quy đơn từng x theo Ỹ_j
   Mode B (formative):   w̃_j  = (X_j'X_j)⁻¹ X_j' Ỹ_j         — hồi quy bội Ỹ_j theo cả khối

#4 Outside approximation:  Y_j = f_j · Σ_k w̃_kj · x_kj,   f_j chọn sao cho var(Y_j) = 1
   ⇔ w_j = w̃_j / sqrt(w̃_j' R_jj w̃_j)
```

**Dừng** khi thay đổi outer weights giữa hai vòng < `10⁻⁷`, hoặc đạt 3.000 vòng (cố định trong SmartPLS 4; SmartPLS 3 mặc định 300). Primer gọi là "tổng thay đổi"; [Doc] chỉ nói "thay đổi" — quy tắc gộp chính xác chưa xác nhận. Số vòng tối đa = 0 cho kết quả sum scores.

Tùy chọn khác: weighting scheme PCA (dùng PCA theo từng construct); kết quả standardized (mặc định) / unstandardized / mean-centered.

**Giai đoạn 2 — ước lượng cuối** từ điểm `Y` đã hội tụ:

```
Outer loading:      l_kj = cor(x_kj, Y_j)
Cross loading:      cor(x_kj, Y_i), i ≠ j
Outer weight:       w_kj cuối cùng (Mode A hay B đều báo cáo)
Path coefficients:  β_j = (R_PP)⁻¹ r_Pj      — OLS của Y_j theo tập tiền tố P; R_PP tương quan giữa các tiền tố
R²_j     = β_j' r_Pj
R²_adj   = 1 − (1 − R²)(N − 1)/(N − k − 1)   — k = số tiền tố
```

**Giai đoạn 3** — tham số vị trí (trung bình, hệ số chặn) khi cần kết quả chưa chuẩn hóa.

**Hiệu ứng gián tiếp và tổng.** Với `B[i][j]` = hệ số đường dẫn `i → j` (mô hình không vòng lặp):

```
Total effects    T = B + B² + B³ + … = (I − B)⁻¹ − I
Total indirect   = T − B
Specific indirect = tích các hệ số dọc theo từng đường đi cụ thể
```

### 1.2 Tiêu chí đánh giá tính từ kết quả PLS [Primer]

```
Indicator reliability = l²            (ngưỡng l ≥ 0,708)

Cronbach's alpha = (M/(M−1)) · (1 − Σ s_i² / s_t²)
   s_i² phương sai biến i, s_t² phương sai của tổng M biến
   Dữ liệu chuẩn hóa ⇒ alpha = M·r̄ / (1 + (M−1)·r̄),  r̄ = tương quan trung bình trong khối

Composite reliability ρc = (Σ l_i)² / [ (Σ l_i)² + Σ (1 − l_i²) ]

ρA = (w'w)² · [ w'(S − diag(S)) w ] / [ w'(ww' − diag(ww')) w ]
   w = outer weights của khối (đã chuẩn hóa để var(Y) = 1), S = ma trận tương quan của khối

AVE = Σ l_i² / M                     (ngưỡng ≥ 0,50)

Fornell-Larcker:  sqrt(AVE_j) > max_i |r_ji|

HTMT(i,j) = mean(R_ij) / sqrt( mean(R_ii) · mean(R_jj) )
   R_ij: tương quan giữa mọi biến của i với mọi biến của j
   R_ii: tương quan giữa các cặp biến trong cùng khối (không tính đường chéo)
   Thang đo một biến: mean(R_ii) = 1
   SmartPLS ≥ 3.2.1 lấy TRỊ TUYỆT ĐỐI từng tương quan trước khi lấy trung bình (HTMT+) [Doc]
   Ngưỡng 0,90 (khái niệm gần nhau) / 0,85; kiểm định bằng CI bootstrap một phía 95%

VIF_k = 1 / (1 − R²_k) = phần tử đường chéo thứ k của R⁻¹
   Outer VIF: hồi quy biến k theo các biến còn lại cùng khối
   Inner VIF: giữa các tiền tố của cùng một biến nội sinh
   Ngưỡng: < 3 tốt, ≥ 5 nghiêm trọng

f² = (R²_included − R²_excluded) / (1 − R²_included)
   SmartPLS GIỮ điểm biến tiềm ẩn của mô hình đầy đủ rồi chỉ bỏ predictor khỏi hồi quy
   (không ước lượng lại PLS) ⇒ khác với tính tay bằng cách chạy lại mô hình.
   0,02 / 0,15 / 0,35 = nhỏ / vừa / lớn
```

Mô hình formative: redundancy analysis (đường dẫn sang thang đo reflective/global item ≥ 0,70), VIF outer, ý nghĩa thống kê của outer weight; nếu weight không ý nghĩa thì xét loading (≥ 0,50 giữ lại).

Blindfolding (cũ, đã bị PLSpredict thay thế): `Q² = 1 − Σ_D SSE_D / Σ_D SSO_D` với khoảng bỏ sót `D`.

### 1.3 Consistent PLS (PLSc) [Doc mô tả; công thức Lit — Dijkstra & Henseler 2015]

Là bước hiệu chỉnh sau PLS thường, dựa trên công thức correction for attenuation của Nunnally:

```
1. Chạy PLS (khuyến nghị nối mọi biến tiềm ẩn với nhau ở bước tính ban đầu) → w_j, r_ij, ρA_j
2. Tương quan nhất quán:  r_ij^c = r_ij / sqrt(ρA_i · ρA_j)
   (ρA = 1 với construct formative hoặc một biến quan sát)
3. Loading nhất quán:      λ_j = w_j · sqrt(ρA_j) / (w_j' w_j)
4. Path coefficients, R²:  OLS lại trên ma trận r^c
```

### 1.4 Weighted PLS (WPLS) [Doc mô tả; công thức Lit — Becker & Ismail 2016]

Thuật toán giữ nguyên, thay mọi thống kê bằng bản có trọng số lấy mẫu `ω_n`:

```
x̄_w   = Σ ω_n x_n / Σ ω_n
s²_w  = Σ ω_n (x_n − x̄_w)² / Σ ω_n
cov_w = Σ ω_n (x_n − x̄_w)(y_n − ȳ_w) / Σ ω_n ;   r_w = cov_w / (s_w,x · s_w,y)
Hồi quy: β = (X' Ω X)⁻¹ X' Ω y,   Ω = diag(ω)
```

### 1.5 Cỡ mẫu tối thiểu — inverse square root [Doc + Primer; Kock & Hadaya 2018]

```
N_min = ⌈ (c / |β|_min)² ⌉       power 80%, kiểm định một hướng
   α = 1%:  c = 3,168      α = 5%:  c = 2,486      α = 10%: c = 2,123
   (c = z_{1−α} + z_{0,80})
Ví dụ |β| = 0,20, α = 5% → (2,486/0,2)² = 154,5 → 155
```

SmartPLS báo "Technically required sample size" (Algorithm → Posthoc minimum sample size), dùng hệ số có trị tuyệt đối nhỏ nhất quyết định yêu cầu. Bảng tham chiếu α = 5%: 0,10 → 619; 0,15 → 275; 0,20 → 155; 0,25 → 99; 0,30 → 69; 0,40 → 39.

---

## 2. Suy luận

### 2.1 Bootstrapping [Doc + Primer; BCa theo Lit — Efron 1987]

```
1. Rút B mẫu (mặc định 10.000), mỗi mẫu N quan sát, có hoàn lại.
2. Ước lượng lại toàn bộ mô hình trên từng mẫu → θ*_b cho mọi tham số
   (weights, loadings, paths, indirect, total, R², f², alpha, ρ, AVE, HTMT…)
3. Sample mean M = mean(θ*);   Bias = M − θ̂
   se* = sd(θ*) = sqrt( Σ (θ*_b − M)² / (B − 1) )
   t   = θ̂ / se*
   p   = từ phân phối t (Primer: N > 30 thì dùng phân vị chuẩn: 1,65 / 1,96 / 2,57)
```

Khoảng tin cậy mức `1 − α`:

```
Percentile (mặc định):  [ Q_{α/2}(θ*), Q_{1−α/2}(θ*) ]
Studentized:            [ θ̂ − t_{1−α/2}·se*, θ̂ + t_{1−α/2}·se* ]
BCa:
   z0 = Φ⁻¹( #{θ*_b < θ̂} / B )
   a  = Σ (θ̄_jk − θ_(i))³ / ( 6 · [ Σ (θ̄_jk − θ_(i))² ]^{3/2} )     θ_(i): ước lượng jackknife bỏ quan sát i
   α1 = Φ( z0 + (z0 + z_{α/2})   / (1 − a(z0 + z_{α/2}))   )
   α2 = Φ( z0 + (z0 + z_{1−α/2}) / (1 − a(z0 + z_{1−α/2})) )
   CI = [ Q_{α1}(θ*), Q_{α2}(θ*) ]
Một phía: dồn toàn bộ α sang một đuôi.
```

Có ý nghĩa khi CI không chứa 0. Primer: dùng percentile; chỉ chuyển BCa khi phân phối bootstrap lệch mạnh (skewness ngoài ±2). Seed cố định cho kết quả tái lập với cùng B. HTMT, d_ULS, d_G, SRMR chỉ có khi chọn "Complete".

Chưa xác nhận: bậc tự do SmartPLS dùng cho p-value (ứng dụng này đang dùng `df = B − 1`).

### 2.2 Permutation [Doc; Chin & Dibbern 2010]

```
1. Ước lượng riêng nhóm A, B → d = θ_A − θ_B
2. Lặp P lần (mặc định 1.000; kết quả cuối nên 5.000):
   rút n_A quan sát KHÔNG hoàn lại từ dữ liệu gộp làm "A", còn lại làm "B" → d*_p
3. p hai phía = #{ |d*_p| ≥ |d| } / P ;  một phía = #{ d*_p ≥ d } / P
   CI hoán vị = [ Q_{α/2}(d*), Q_{1−α/2}(d*) ] — khác biệt có ý nghĩa khi d nằm NGOÀI khoảng
```

Cùng lần chạy này trả về kết quả MICOM (mục 4.1).

### 2.3 CVPAT [Doc mô tả; công thức Lit — Liengaard et al. 2021, Sharma et al. 2023]

Dùng sai số dự báo ngoài mẫu từ k-fold của PLSpredict (mục 5.1):

```
L_i^model = trung bình e²_ik trên các biến quan sát của construct nội sinh (hoặc toàn mô hình)
D_i  = L_i^PLS − L_i^benchmark         benchmark: IA (trung bình mẫu huấn luyện) và LM
D̄    = mean(D_i);   s²_D = Σ (D_i − D̄)² / (N − 1)
t    = D̄ / sqrt(s²_D / N),   df = N − 1,  kiểm định một phía
```

`D̄ < 0` và có ý nghĩa ⇒ PLS-SEM dự báo tốt hơn benchmark. SmartPLS dùng **earliest antecedents** cho cả PLSpredict và CVPAT (bài gốc CVPAT dùng direct antecedents).

---

## 3. Giá trị và độ phù hợp

### 3.1 HTMT — xem mục 1.2.

HTMT inference: bootstrap "Complete", một phía; cận trên của CI phải dưới 0,90 (hoặc 0,85).

### 3.2 Model fit [Doc; công thức Lit — Henseler et al. 2014, Dijkstra & Henseler 2015]

`S` = ma trận tương quan thực nghiệm của K biến quan sát; `Σ̂` = ma trận do mô hình hàm ý.

```
Xây Σ̂:
   Khác khối:           Σ̂_ij = λ_i · r̂_ij · λ_j'
   Cùng khối reflective: Σ̂_jj = λ_j λ_j' (đường chéo = 1)
   Cùng khối formative:  Σ̂_jj = S_jj (giữ tương quan thực nghiệm)
   Saturated model: r̂_ij = tương quan thực nghiệm giữa mọi cặp construct
   Estimated model: r̂_ij suy từ cấu trúc đường dẫn (total effects) — bị ràng buộc hơn

SRMR  = sqrt( Σ_{i≤j} (s_ij − σ̂_ij)² / (K(K+1)/2) )        < 0,08 (hoặc 0,10)
d_ULS = ½ · Σ_i Σ_j (s_ij − σ̂_ij)²                           khoảng cách Euclid bình phương
d_G   = ½ · Σ_k (ln φ_k)²,   φ_k = trị riêng của S⁻¹ Σ̂      khoảng cách geodesic
Chi²  = (N − 1) · F_ML,   F_ML = ln|Σ̂| − ln|S| + tr(S Σ̂⁻¹) − K
df    = (K² + K)/2 − t,   t = số tham số độc lập
NFI   = 1 − Chi²_model / Chi²_null,   null: Σ̂ = I  ⇒  F_null = −ln|S|      > 0,90
```

**Kiểm định exact fit (Bollen-Stine).** Vòng bootstrap thứ hai: biến đổi dữ liệu `X° = X · S^{−1/2} · Σ̂^{1/2}` để H0 đúng, bootstrap trên `X°`, tính lại d_ULS, d_G, SRMR cho từng mẫu (một lượt cho saturated, một lượt cho estimated). Mô hình phù hợp khi giá trị gốc **nhỏ hơn** phân vị 95% (hoặc 99%) của phân phối này.

[Doc] khuyên dùng estimated model nếu phải báo cáo, và không dùng GoF. Primer: `RMS_theta < 0,12`.

### 3.3 Model comparison [Doc + Primer]

SmartPLS so hai mô hình bằng PLSpredict, CVPAT, BIC và Akaike weights:

```
BIC_i = n · [ ln(SSE_i / n) + p_k · ln(n) / n ]
   SSE_i = tổng bình phương sai số của construct nội sinh mục tiêu; p_k = số predictor
   (Sharma et al. 2019 tính p_k = số predictor + 1; Primer ghi "số predictor" — cần kiểm)
Chọn mô hình có BIC nhỏ nhất.

Δ_i = BIC_i − BIC_min
w_i = exp(−Δ_i/2) / Σ_k exp(−Δ_k/2)        Akaike weight = khả năng tương đối của mô hình i
```

---

## 4. Nhóm

### 4.1 MICOM [Doc; Henseler, Ringle, Sarstedt 2016]

```
Bước 1  Configural invariance: cùng biến quan sát, cùng xử lý dữ liệu, cùng thiết lập — định tính.
Bước 2  Compositional invariance:
        c = cor( X·w_A, X·w_B )   — điểm tính trên dữ liệu gộp bằng weights của từng nhóm
        Hoán vị → phân phối c*;  đạt khi c ≥ phân vị 5% của c* (c không nhỏ hơn 1 có ý nghĩa)
Bước 3  Bằng nhau về trung bình và phương sai (điểm từ mô hình dữ liệu gộp):
        Δmean = mean(Y_A) − mean(Y_B)
        Δvar  = ln var(Y_A) − ln var(Y_B)
        Đạt khi giá trị quan sát nằm TRONG CI hoán vị 2,5%–97,5%
```

Bước 2 đạt, bước 3 không đạt ⇒ partial invariance (được so sánh hệ số chuẩn hóa). Cả hai đạt ⇒ full invariance (được gộp dữ liệu). [Doc] đính chính: CI hoán vị phải **chứa giá trị chênh lệch thu được**, không phải chứa 0.

### 4.2 Multigroup analysis [Doc; công thức Lit — Henseler et al. 2009, Sarstedt et al. 2011]

Bootstrap riêng từng nhóm → `θ_g`, `se_g`, `θ*_g,b`.

```
(1) CI bias-corrected từng nhóm: khác biệt có ý nghĩa khi hai CI không chồng nhau.

(2) PLS-MGA (phi tham số):
    p = P(θ_A ≤ θ_B) = 1 − (1/B²) · Σ_b Σ_c H( 2θ̄*_A − θ*_A,b − 2θ̄*_B + θ*_B,c )
    H(x) = 1 nếu x > 0, ngược lại 0.  Có ý nghĩa ở 5% khi p < 0,05 hoặc p > 0,95.

(3) Parametric (phương sai bằng nhau), df = n_A + n_B − 2:
    t = (θ_A − θ_B) /
        [ sqrt( (n_A−1)²/(n_A+n_B−2) · se_A² + (n_B−1)²/(n_A+n_B−2) · se_B² ) · sqrt(1/n_A + 1/n_B) ]

(4) Welch-Satterthwaite (phương sai khác nhau):
    v_g = (n_g − 1)/n_g · se_g²
    t  = (θ_A − θ_B) / sqrt(v_A + v_B)
    df = (v_A + v_B)² / [ (n_A−1)/n_A² · se_A⁴ + (n_B−1)/n_B² · se_B⁴ ] − 2
```

Primer khuyến nghị permutation test (mục 2.2) vì kiểm soát sai lầm loại I tốt hơn.

---

## 5. Dự báo và phân khúc

### 5.1 PLSpredict [Doc + Primer; Shmueli et al. 2016, 2019]

```
Lặp r lần (mặc định 10), mỗi lần chia ngẫu nhiên k fold (mặc định 10):
  Với mỗi fold làm holdout:
    1. Ước lượng PLS trên k−1 fold còn lại → w, l, β, mean/sd huấn luyện
    2. Chuẩn hóa holdout bằng mean/sd HUẤN LUYỆN
    3. Điểm construct ngoại sinh: Y_exo = X_exo · w
    4. Điểm nội sinh dự báo: lan truyền qua mô hình cấu trúc chỉ từ các construct
       ngoại sinh sớm nhất (earliest antecedents): Ŷ_endo = Σ β · Ŷ_pred
    5. Biến quan sát dự báo: x̂ = l · Ŷ_endo → đổi về thang gốc: x̂·sd_train + mean_train
    6. e = x − x̂
Trung bình sai số qua các lần lặp.

MAE  = (1/n) Σ |y_i − ŷ_i|
RMSE = sqrt( (1/n) Σ (y_i − ŷ_i)² )
MAPE = (100/n) Σ |(y_i − ŷ_i) / y_i|          (chỉ cho biến quan sát)
Q²predict = 1 − Σ (y_i − ŷ_i)² / Σ (y_i − ȳ_train)²      > 0 là tốt hơn dự báo bằng trung bình

Benchmark LM: hồi quy tuyến tính từng biến quan sát nội sinh theo TẤT CẢ biến quan sát
ngoại sinh, cùng các fold. Chỉ có cho biến quan sát.
```

Đọc kết quả (Primer): so RMSE (hoặc MAE nếu sai số lệch mạnh) của PLS với LM theo từng biến — tất cả thấp hơn = dự báo cao; đa số = vừa; thiểu số = thấp; không biến nào = không có.

### 5.2 FIMIX-PLS [Doc mô tả; công thức Lit — Hahn et al. 2002, Sarstedt et al. 2011]

Hỗn hợp hữu hạn của các hồi quy trong mô hình cấu trúc, trên điểm biến tiềm ẩn từ PLS. Cho K phân khúc:

```
lnL = Σ_i ln Σ_k ρ_k · f_ik,     f_ik = Π_m N( y_mi | x_mi' β_mk, ω_mk )
      m chạy qua các construct nội sinh; ρ_k = tỷ trọng phân khúc, Σ ρ_k = 1

E-step:  P_ik = ρ_k f_ik / Σ_h ρ_h f_ih
M-step:  ρ_k  = Σ_i P_ik / N
         β_mk = (X_m' P_k X_m)⁻¹ X_m' P_k y_m           P_k = diag(P_1k … P_Nk)
         ω_mk = Σ_i P_ik (y_mi − x_mi' β_mk)² / Σ_i P_ik
Dừng khi ΔlnL < stop criterion hoặc hết số vòng; chạy nhiều lần, lấy lnL tốt nhất.

N_k = số tham số tự do = (K − 1) + K·(số đường dẫn) + K·(số construct nội sinh)
AIC  = −2lnL + 2N_k        AIC3 = −2lnL + 3N_k        AIC4 = −2lnL + 4N_k
BIC  = −2lnL + ln(N)·N_k   CAIC = −2lnL + (ln N + 1)·N_k
HQ   = −2lnL + 2·ln(ln N)·N_k        MDL5 = −2lnL + 5·ln(N)·N_k
EN   = 1 − [ Σ_i Σ_k −P_ik ln P_ik ] / (N · ln K)        entropy chuẩn hóa, > 0,50
```

Tùy chọn: dùng điểm chưa chuẩn hóa, ước lượng hệ số chặn theo phân khúc.

### 5.3 IPMA [Doc mô tả; công thức Lit — Ringle & Sarstedt 2016]

```
1. Đổi thang biến quan sát về 0–100:  x' = (x − min) / (max − min) · 100
   min/max là biên LÝ THUYẾT của thang đo (Likert 7 điểm: 1 và 7), không phải biên quan sát được.
2. Outer weight chưa chuẩn hóa, chuẩn lại để tổng = 1:
   w̃_k = (w_k / s_k) / Σ_k (w_k / s_k)
3. Điểm construct:  Y'_j = Σ_k w̃_k · x'_k           (nằm trong 0–100)
4. Performance = mean(Y'_j)
5. Importance  = total effect CHƯA chuẩn hóa lên construct mục tiêu (hồi quy trên Y')
```

Yêu cầu: mọi outer weight dương, biến cùng chiều. Trục ngang importance, trục dọc performance.

---

## 6. Quan hệ mở rộng

### 6.1 Moderation — two-stage [Doc + Primer]

```
Giai đoạn 1: ước lượng mô hình hiệu ứng chính (không có tương tác) → lưu điểm Y_X, Y_M
Giai đoạn 2: I = Y_X · Y_M  (KHÔNG chuẩn hóa lại I)
             Y = p1·Y_X + p2·Y_M + p3·I + ε
```

SmartPLS 4 tự thêm đường dẫn `M → Y`. Kết quả mô hình đo lường (loading, độ tin cậy, HTMT) lấy từ giai đoạn 1; kết quả mô hình cấu trúc lấy từ giai đoạn 2, khi mọi thang đo được biểu diễn bằng điểm của chính nó [Primer, chương 7].

Cách ứng dụng cài (`stats.js` `modRegression`, `bootstrap.js` `applyMods`): giai đoạn 2 là hồi quy OLS có hệ số chặn của `Y` theo điểm chuẩn hóa của các thang đo dự báo và tích `Y_M · Y_X` để nguyên; các biến phụ thuộc không bị điều tiết giữ nguyên kết quả giai đoạn 1. Bootstrap làm lại cả hai giai đoạn trên từng mẫu con. Hệ số của tương tác được báo cáo với khóa `M x X → Y`. Điểm dùng để nhân theo đúng lựa chọn standardized / unstandardized / mean-centered. Tương tác ba chiều: kéo thêm đường dẫn từ biến điều tiết thứ hai vào tương tác đã có.

```
Simple slope:  hiệu ứng của X lên Y tại M = m  là  p1 + p3·m ;  vẽ tại m = −1 SD, 0, +1 SD
f² tương tác:  (R²_incl − R²_excl)/(1 − R²_incl);  0,005 / 0,01 / 0,025 = nhỏ / vừa / lớn (Kenny)
```

Biến điều tiết nhị phân phải mã hóa 0/1. Cách khác: product indicator (nhân từng cặp biến quan sát), orthogonalizing (dùng phần dư của tích sau khi hồi quy theo mọi biến quan sát gốc).

### 6.2 Mediation [Doc + Primer]

```
Direct = p3;  Indirect = p1·p2;  Total = p3 + p1·p2
Nhiều trung gian: total indirect = p1·p2 + p4·p5 (+ p1·p6·p5 nếu nối tiếp)
```

Kiểm định bằng bootstrap phân phối của hiệu ứng gián tiếp (percentile CI); không dùng Sobel. Phân loại theo Zhao et al. (2010):

| Indirect | Direct | Kết luận |
|---|---|---|
| Có ý nghĩa | Không | Indirect-only (full mediation) |
| Có ý nghĩa | Có, cùng dấu với indirect | Complementary (partial) |
| Có ý nghĩa | Có, trái dấu | Competitive (partial) |
| Không | Có | Direct-only (không trung gian) |
| Không | Không | No effect |

---

## 7. Thiết lập mặc định SmartPLS 4

| Thuật toán | Mặc định |
|---|---|
| PLS | Path weighting, standardized, weights khởi tạo +1, 3.000 vòng, stop 10⁻⁷ |
| Bootstrapping | 10.000 mẫu, percentile, cỡ mẫu con = N |
| Permutation | 1.000 lần, hai phía, α = 0,05 |
| PLSpredict / CVPAT | 10 fold, 10 lần lặp |
| HTMT | Trị tuyệt đối tương quan (HTMT+) |

## 8. Việc cần kiểm trước khi cài đặt

1. Các mục gắn **[Lit]**: đối chiếu với bài gốc hoặc bản xuất SmartPLS trên cùng dữ liệu.
2. Quy tắc gộp chênh lệch outer weights khi xét hội tụ (tổng hay lớn nhất).
3. Bậc tự do của p-value trong bootstrapping.
4. `p_k` trong BIC (có cộng 1 hay không).
5. Cách SmartPLS dựng `Σ̂` cho estimated model và số tham số `t` khi tính df.
