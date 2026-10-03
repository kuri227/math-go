# 数学でGO HMER PoC アーキテクチャ

## 処理の流れ

ブラウザはPointer Eventsでマウス、ペン、タッチを同じ経路で受け取る。ゲーム画面ではPhaserが問題進行を、独立したHTML Canvasが手書きを担当する。認識時には描画のbounding boxへ余白を加え、白背景・黒線のcrop済みPNGを生成する。通常ゲームはPNGを `POST /api/v1/recognitions` へ送りTexTellerだけで認識する。比較画面は `POST /recognize/compare` へ一度だけ送り、API内の同一一時ファイルを両モデルへ順番に渡す。評価データ保存では同じPNG、stroke JSON、人手確認済みGround Truth、匿名メタデータを `POST /samples` へ送る。

FastAPIは画像形式とサイズを検証し、モデル名から共通Recognizerを選ぶ。TexTellerとUniMERNetは依存するTransformersの版が異なるため、モデルごとに独立したPython仮想環境と常駐ワーカープロセスを使用する。ゲームはページロード時に `POST /api/v1/models/texteller/preload` を呼び、`GET /api/v1/health/ready` を監視する。比較画面は従来どおり `POST /models/preload` で両モデルを順番に準備する。ワーカーはモデルを一度ロードし、標準入出力のJSON Linesで画像パスと認識結果を交換する。

```text
Pointer Events
  ├─ strokes.json
  └─ cropped PNG
        ↓
FastAPI /recognize/compare
        ↓
Recognizer Registry
  ├─ TexTeller worker (.venv-texteller)
  └─ UniMERNet worker (.venv-unimernet)
        ↓
モデル別 LaTeX + inference_ms + initialization_ms + peak_vram_mb + device + error

FastAPIはモデル依存処理を持たず、Recognizer Registryだけを参照する。ゲーム用 `/api/v1/recognitions` は選択モデル1つだけを実行し、生LaTeX、正規化LaTeX、画像情報、処理時間を返す。評価画面だけが `/recognize/compare` を使用する。
```

## データと評価

データ位置は `config/paths.toml` のみを設定元とする。通常はリポジトリルート基準の相対パスを使い、`HMER_DATA_ROOT` がある場合だけ別データルートへ切り替える。`benchmark/prepare_unimer.py` は公式ZIPのSHA-256を検証し、HWE画像と `hwe.txt` の行番号対応からmanifestを生成する。公開HWEはテスト専用であり、学習には使用しない。

`benchmark/run_benchmark.py` は同じmanifestを両Recognizerへ与え、warm-upを計測から除外する。各行に予測、正解、Exact Match、保守的なNormalized Match、モデル内推論時間、端から端までの時間、初期化時間、peak VRAM、例外を保存する。失敗行も分母から除外しない。公開HWEにはGround TruthのLaTeX構造から再現可能な主カテゴリと難易度を付与する。`benchmark/analyze_results.py` はモデル別・カテゴリ別精度、平均/P50/P95/最大レイテンシ、失敗画像と原因仮説を再生成し、`benchmark/build_comparison_report.py` がTest AとTest Bを分離した最終レポートを作る。

## セキュリティとプライバシー

入力画像とstrokeデータはローカル処理のみで、外部認識APIには送信しない。独自データは匿名 `writer_id` のみを使い、Git管理対象外とする。アップロードは10 MiBまでのPNG、JPEG、WebPに制限する。
