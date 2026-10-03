# 代表的失敗例

推論エラーと正規化後不一致をモデルごとに最大10件抽出した。原因は自動分類による仮説であり、採用判断前に画像を目視確認する。

## texteller

### 0000029

- 正解: `\sum \limits _ { n = 0 } ^ { \infty } ( - x ) ^ { n } = ( 1 + x ) ^ { - 1 }`
- 予測: `\[\sum_{n=0}^{ \infty}(-x)^{n}=(1+x)^{-1}\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000029.png](texteller/0000029.png)

### 0000046

- 正解: `\lim \limits _ { r \rightarrow \infty } e ^ { 2 r } ( n - H ( r ) ) = 2 n`
- 予測: `\[\lim_{r \rightarrow \infty}e^{2r}(n-H(r))=2n\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000046.png](texteller/0000046.png)

### 0000073

- 正解: `\sum \limits _ { x } \Delta _ { x y } = 0`
- 予測: `\[\sum_x \Delta_{xy}=0\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000073.png](texteller/0000073.png)

### 0000087

- 正解: `x ^ { i } e _ { i } = \sum \limits _ { i } x ^ { i } e _ { i }`
- 予測: `\[x^{i}e_{i}= \sum_{i}x^{i}e_{i}\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000087.png](texteller/0000087.png)

### 0000096

- 正解: `\int \limits _ { - \infty } ^ { \infty } d x ^ { 1 }`
- 予測: `\[\int_{- \infty}^{ \infty}dx^{1}\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000096.png](texteller/0000096.png)

### 0000099

- 正解: `\frac { \sin ^ { 2 } \frac { \pi a } { L + 2 } } { \sin ^ { 2 } \frac { \pi } { L + 2 } }`
- 予測: `\[\frac{ \sin^2 \frac{ \pi a}{L{+}2}}{ \sin^2 \frac{ \pi}{L{+}2}}\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000099.png](texteller/0000099.png)

### 0000122

- 正解: `\sum \limits _ { i _ { 1 } } m _ { i _ { 1 } } + \sum \limits _ { j _ { 1 } } m _ { j _ { 1 } } - 2 \sum \limits _ { k _ { 1 } } m _ { k _ { 1 } } = - 3`
- 予測: `\[\sum_{i_{1}}m_{i_{1}}+ \sum_{j_{1}}m_{j_{1}}-2 \sum_{k_{1}}m_{k_{1}}=-3\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000122.png](texteller/0000122.png)

### 0000125

- 正解: `\vert 3 0 0 x = 3 0 0 \times 6 = 1 8 0 0`
- 予測: `\[300x=300 \times 6=1800\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000125.png](texteller/0000125.png)

### 0000139

- 正解: `\sum \limits _ { m = 1 } ^ { \infty } \sum \limits _ { n = 1 } ^ { \infty } \frac { m ^ { 2 } n } { 3 ^ { m } ( m 3 ^ { n } + n 3 ^ { m } ) }`
- 予測: `\[\sum_{m=1}^{ \infty} \sum_{n=1}^{ \infty} \frac{m^{2}n}{3^{m}(m3^{n}+n3^{m})}\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000139.png](texteller/0000139.png)

### 0000146

- 正解: `\frac { q ^ { 2 } \sqrt { \pi } } { 2 g } \sqrt { \frac { a - 1 } { a } }`
- 予測: `\[\frac{{q^{2} \sqrt{ \pi}}}{{2g}} \sqrt{ \frac{a-1}{{a}}}\]`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [texteller/0000146.png](texteller/0000146.png)

## unimernet

### 0000001

- 正解: `N H _ { 4 } C l + N a C H = N a C l + N H _ { 3 } \uparrow + H _ { 2 } O`
- 予測: `N H _ { 4 } a + N a O H = N a C l + N H _ { 2 } \uparrow + H _ { 2 } O`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000001.png](unimernet/0000001.png)

### 0000008

- 正解: `P F _ { 1 } + P F _ { 2 } = 2 a \cdot`
- 予測: `P F _ { 1 } + P F _ { 2 } = 2 G .`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000008.png](unimernet/0000008.png)

### 0000012

- 正解: `\{ a _ { 1 } , a _ { 2 } , a _ { 3 } , a _ { 4 } \}`
- 予測: `\{ a _ { 1 } a _ { 2 } a _ { 3 } a _ { 4 } \}`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000012.png](unimernet/0000012.png)

### 0000013

- 正解: `3 2 x ^ { 6 } - 4 8 x ^ { 4 } + 1 8 x ^ { 2 } - 1`
- 予測: `3 2 x ^ { 2 } - 4 8 x ^ { 4 } + 1 8 x ^ { 2 } - 1`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000013.png](unimernet/0000013.png)

### 0000016

- 正解: `| a | = | x ^ { 1 } | + \ldots + | x ^ { n } |`
- 予測: `| \alpha | = | x ^ { n } | + \cdots + | x ^ { n } |`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000016.png](unimernet/0000016.png)

### 0000019

- 正解: `m _ { z n } = M _ { z n } \cdot n _ { z n } = 6 5 g / m o l \times 0 . 2 m o l = 1 3 g`
- 予測: `m _ { z n } = M z \cdot n _ { z n } = 6 5 g / m o l \times 0 . 2 m o l = 1 3 g`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000019.png](unimernet/0000019.png)

### 0000020

- 正解: `S u p E \leq S u p F`
- 予測: `\sin p E \leq \sin p F`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000020.png](unimernet/0000020.png)

### 0000024

- 正解: `u = \tan ( z )`
- 予測: `u = \tan ( 2 )`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000024.png](unimernet/0000024.png)

### 0000025

- 正解: `p _ { 1 } = - p _ { 2 } + p _ { 5 } - p _ { 6 }`
- 予測: `P _ { 1 } = - P _ { 2 } + P _ { 5 } - P _ { 6 }`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000025.png](unimernet/0000025.png)

### 0000026

- 正解: `\frac { D F } { F C } = \frac { A F } { F G }`
- 予測: `\frac { O F } { F C } = \frac { A E } { F G }`
- 原因仮説: 文字・記号の混同またはLaTeX表記差
- 入力画像: [unimernet/0000026.png](unimernet/0000026.png)
