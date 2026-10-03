# 数学でGO HMER PoC 評価レポート

## 結論

公開HWEの基礎比較は完了したが、独自Canvas評価がないため本番採用は保留する。

## 評価範囲

- 記録行数: 6
- サブセット: {'HWE': 6}
- 入力デバイス: {'unknown': 6}

## モデル別結果

### texteller

- サンプル数: 3
- Exact Match: 0.000%
- Normalized Match: 100.000%
- 失敗率: 0.000%
- 推論時間 P50 / P95: 2716.3814 / 3360.0718399999996 ms

### unimernet

- サンプル数: 3
- Exact Match: 66.667%
- Normalized Match: 66.667%
- 失敗率: 0.000%
- 推論時間 P50 / P95: 1450.1639 / 1725.5593099999999 ms

## 解釈上の注意

UniMER-Test HWEは公開テスト専用であり、学習やFine-tuningには使用していない。Exact MatchはLaTeX表記ゆれを過大評価するため、保守的な正規化後一致も併記した。数学的同値判定は今回のHMER評価には含めない。公開HWEはUniMERNet開発元の評価セットであるため、数学でGOの採用判断では独自Canvas入力をより重視する。

## 残課題

独自Canvasデータを複数人・複数入力機器で50件以上収集し、人手レビュー済みの正解LaTeXを付与する。代表的失敗例は元画像と照合し、自動分類した原因仮説を確認する。Render/Structure MatchはCDMのWindows導入コストを確認したうえで追加する。
