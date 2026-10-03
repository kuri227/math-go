# 代表的失敗例

推論エラーと正規化後不一致をモデルごとに最大10件抽出した。原因は自動分類による仮説であり、採用判断前に画像を目視確認する。

## texteller

該当なし。

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
