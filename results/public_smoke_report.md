# 数学でGO HMER PoC 評価レポート

## 結論

公開HWEの基礎比較は完了したが、独自Canvas評価がないため本番採用は保留する。

## 評価範囲

- 記録行数: 20
- サブセット: {'HWE': 20}
- 入力デバイス: {'unknown': 20}

## モデル別結果

### texteller

- サンプル数: 10
- Exact Match: 0.000%
- Normalized Match: 100.000%
- 失敗率: 0.000%
- 推論時間 P50 / P95: 500.382 / 791.0904249999996 ms

### unimernet

- サンプル数: 10
- Exact Match: 80.000%
- Normalized Match: 80.000%
- 失敗率: 0.000%
- 推論時間 P50 / P95: 997.3614 / 1789.4505149999993 ms

## 解釈上の注意

UniMER-Test HWEは公開テスト専用であり、学習やFine-tuningには使用していない。Exact MatchはLaTeX表記ゆれを過大評価するため、保守的な正規化後一致も併記した。数学的同値判定は今回のHMER評価には含めない。公開HWEはUniMERNet開発元の評価セットであるため、数学でGOの採用判断では独自Canvas入力をより重視する。

## 残課題

独自Canvasデータを複数人・複数入力機器で50件以上収集し、人手レビュー済みの正解LaTeXを付与する。代表的失敗例は元画像と照合し、自動分類した原因仮説を確認する。Render/Structure MatchはCDMのWindows導入コストを確認したうえで追加する。
