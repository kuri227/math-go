# 数学でGO 数式認識サービス 要件定義（案）

## 1. 文書の目的

この文書は、現在の手書き数式認識PoCを、数学でGOのほかのプログラムから利用できる「数式認識サービス」に移行するための要件を定める。

サービスの責務は、画像を受け取り、認識したLaTeXと処理情報を返すところまでとする。認識結果が問題の正解と数学的に同値かを判断する処理は、ゲーム側の正誤判定機能として分離する。

対象読者は、Python・HTTP API・JSONについて基礎的な知識がある開発者を想定する。

## 2. 現在地と前提

現在のPoCでは、Web Canvasで作成した同一PNGをTexTellerとUniMERNetへ渡し、LaTeX、推論時間、モデル情報を取得できる。公開UniMER-Test HWE 6,332件を両モデルで評価済みである。

| 指標 | TexTeller | UniMERNet tiny |
|---|---:|---:|
| Normalized Match | 90.92% | 59.60% |
| 推論 P50 | 552.1 ms | 1,083.4 ms |
| 推論 P95 | 1,204.8 ms | 2,550.1 ms |
| 最大推論時間 | 4,754.9 ms | 13,326.8 ms |
| 初期化時間 | 31.6秒 | 43.3秒 |
| Peak VRAM | 1,264.4 MiB | 483.6 MiB |
| 処理失敗 | 0 / 6,332 | 0 / 6,332 |

この結果は公開HWEに対する値であり、数学でGOのWeb実入力に対する最終評価ではない。また、TexTellerの出力にある `\limits` の省略など、表示上同等なLaTeXを現行指標が不一致とする場合がある。

評価結果の固定スナップショットは `results/baselines/2026-10-01-public-hwe/` に保存する。今後の実験結果でこのディレクトリを上書きしない。

## 3. 目標

### 3.1 機能目標

ほかのプログラムがHTTP APIへ画像を送信し、次を受け取れるようにする。

- 認識した生のLaTeX
- 表記差を整理した正規化LaTeX
- 使用モデルとモデル版
- 推論時間とAPI全体の処理時間
- 入力画像に行った共通前処理
- 成功・失敗と、失敗時の機械判定可能なエラーコード
- リクエストを追跡するID

### 3.2 運用目標

- 初回リクエストより前にモデルをロードする。
- モデル未準備時に推論リクエストを受け付けない。
- TexTellerとUniMERNetを同一APIから選択できる。
- 推論処理と評価データ保存を分離する。
- 将来のFine-tuned modelやOnline HMERをRecognizer実装の追加だけで接続できる。

## 4. 対象外

初期リリースでは、次は認識サービスの責務に含めない。

- 問題文・制限時間・得点の管理
- 数学的な正誤判定
- 数式を変形して模範解答へ一致させる処理
- ユーザー認証画面
- 学習・Fine-tuningの実行
- 入力画像や筆跡の自動的な永続保存

ただし、正誤判定機能が利用しやすいように、正規化LaTeXを返す。

## 5. システム境界

```text
数学でGO本体 / Web画面 / 管理ツール
                │
                │ HTTP + multipart/form-data
                ▼
        数式認識サービス API
                │
       共通画像検証・前処理
                │
          Recognizer Router
           ├── TexTeller
           └── UniMERNet
                │
                ▼
       LaTeX + メタデータを返却
```

モデル固有の画像変換、ライブラリ、チェックポイント、出力後処理はRecognizer内部へ隔離する。呼び出し元はモデルのPython APIを直接利用しない。

## 6. モデル構成

### 6.1 精度優先プロファイル：TexTeller

`model=texteller` または `profile=quality` で選択する。数学でGOの既定値とする。

メリット：

- 公開HWEで90.92%と、今回のUniMERNet tinyより高精度だった。
- GPU推論のP50・P95が約2倍高速だった。
- 公式Python APIから利用でき、現在のWebシステムへの組み込みが比較的単純である。
- 4GB VRAMの検証PCでも動作した。

デメリット：

- Peak VRAMが約1.26GBで、UniMERNet tinyより大きい。
- CPU推論はsmoke testで約2.7秒かかり、リアルタイムゲームには遅い可能性がある。
- 生出力に `\[...\]` などの表示用デリミタが含まれるため、ゲーム判定前の正規化が必要である。

### 6.2 省リソースプロファイル：UniMERNet tiny

`model=unimernet` または `profile=lightweight` で選択する。

メリット：

- Peak VRAMが約484MiBで、TexTellerの約38%だった。
- 両モデルの公開HWE全件を処理し、実行エラーはなかった。
- CPUの少数smoke testではTexTellerより高速だった。

デメリット：

- 公開HWEのNormalized Matchは59.60%で、今回のTexTellerを大きく下回った。
- GPU推論はP50約1.08秒、P95約2.55秒でTexTellerより遅かった。
- 初期化に約43秒かかった。
- 公式リポジトリ、設定ファイル、checkpointの組み合わせを管理する必要があり、導入手順が長い。

### 6.3 比較モード

`model=compare` は同じ共通前処理画像を両モデルへ入力し、両方の結果を返す。評価・障害調査・モデル更新確認に使用し、本番ゲームの通常リクエストでは使用しない。2モデルを逐次実行するため応答が遅くなる。

## 7. API要件

APIにはバージョンを付け、初期版を `/api/v1` とする。既存の `/recognize` と `/recognize/compare` は移行期間のみ互換APIとして残す。

### 7.1 稼働確認

#### `GET /health/live`

APIプロセスが動作しているかを返す。モデル未ロードでも `200` とする。

```json
{
  "status": "ok"
}
```

#### `GET /health/ready`

既定モデルで推論可能かを返す。モデル準備中または異常時は `503` とする。

```json
{
  "ready": true,
  "default_model": "texteller"
}
```

### 7.2 モデル状態

#### `GET /api/v1/models`

各モデルの利用可否、ロード状態、デバイス、版を返す。

```json
{
  "models": [
    {
      "id": "texteller",
      "variant": "3.0",
      "device": "cuda",
      "state": "ready",
      "initialization_ms": 31610.5,
      "peak_vram_mb": 1264.4
    },
    {
      "id": "unimernet",
      "variant": "tiny",
      "device": "cuda",
      "state": "ready",
      "initialization_ms": 43338.9,
      "peak_vram_mb": 483.6
    }
  ]
}
```

`state` は `not_loaded`、`loading`、`ready`、`error` のいずれかとする。

### 7.3 数式認識

#### `POST /api/v1/recognitions`

入力形式は `multipart/form-data` とする。

| フィールド | 必須 | 内容 |
|---|---|---|
| `image` | 必須 | PNG、JPEG、WebP画像 |
| `model` | 任意 | `texteller`、`unimernet`、`compare`。省略時は既定モデル |
| `request_id` | 任意 | 呼び出し元が発行した追跡ID。省略時はサービスがUUIDを発行 |
| `strokes_json` | 任意 | 将来分析用の筆跡。初期版の認識処理には使用しない |

成功時は `200` を返す。

```json
{
  "request_id": "018f0a6e-8d5e-7e52-a78b-0d903b911426",
  "status": "success",
  "model": {
    "id": "texteller",
    "variant": "3.0",
    "device": "cuda"
  },
  "result": {
    "raw_latex": "\\[y=x^{2}\\]",
    "normalized_latex": "y=x^2"
  },
  "input": {
    "original_width": 900,
    "original_height": 360,
    "processed_width": 284,
    "processed_height": 146,
    "preprocessing": "common-v1"
  },
  "timing": {
    "queue_ms": 0.8,
    "preprocessing_ms": 4.2,
    "inference_ms": 552.1,
    "total_ms": 561.7
  },
  "warnings": []
}
```

`compare` の場合は `results.texteller` と `results.unimernet` の2要素を返す。片方が失敗しても、もう片方の成功結果は返す。

### 7.4 評価データ保存

現在の `/samples` 相当は認識APIから分離し、管理・検証用途の `/api/v1/evaluation-samples` とする。本番ゲームはこのAPIを自動的に呼ばない。

保存時には、利用者へ保存目的を示した上で次を保持する。

- 入力画像
- stroke JSON
- 人手確認済みGround Truth
- カテゴリ、難易度、匿名writer ID、入力デバイス
- 作成日時

## 8. 入力画像要件

- 最大ファイルサイズは10MiBとする。
- PNG、JPEG、WebPのみ受け付ける。
- デコードできない画像や拡張子と実体が異なる画像を拒否する。
- 最小・最大ピクセル寸法を設定し、極端な画像によるメモリ消費を防ぐ。
- EXIF回転を適用する。
- 透過部分は白背景へ合成する。
- モデルへ渡す前に数式部分のbounding boxを検出し、固定規則のpaddingを追加する。
- 共通前処理後の同じ画像をRecognizerへ渡し、モデル固有前処理は各Recognizer内で行う。
- 共通前処理の版をレスポンスとログへ記録する。

入力画像は原則としてリクエスト処理後に削除し、明示的に評価データ保存APIを呼んだ場合だけ永続化する。

## 9. LaTeX出力と正規化

サービスは必ず次の2種類を返す。

- `raw_latex`: モデルが返した文字列。評価・障害調査のため変更しない。
- `normalized_latex`: ゲーム側で比較しやすい表記へ変換した文字列。

正規化 `common-latex-v1` では、少なくとも次を行う。

- 外側の `\[...\]`、`\(...\)`、`$...$`、`$$...$$` を除去
- 意味に影響しない空白命令と連続空白を除去
- `\left` と `\right` を除去
- `\dfrac`、`\tfrac` を `\frac` へ統一
- 単一文字の指数・添字について `{}` の有無を吸収
- `\limits` の有無を表示上の表記差として吸収

例：

```text
\[y=x^{2}\]  → y=x^2
y = x ^ { 2 } → y=x^2
```

正規化は数学的同値判定ではない。例えば `1/2` と `2/4` を同一とする処理は、別の正誤判定サービスでSymPy等を用いて実施する。

## 10. エラー仕様

エラーはHTTPステータスだけでなく、安定した `error.code` を返す。

| HTTP | エラーコード | 内容 |
|---:|---|---|
| 400 | `IMAGE_EMPTY` | 画像が空 |
| 400 | `IMAGE_INVALID` | 画像をデコードできない |
| 413 | `IMAGE_TOO_LARGE` | サイズ上限超過 |
| 415 | `IMAGE_FORMAT_UNSUPPORTED` | 非対応形式 |
| 422 | `MODEL_INVALID` | 不明なモデル指定 |
| 429 | `QUEUE_FULL` | 同時実行数・待ち行列上限超過 |
| 503 | `MODEL_LOADING` | モデル準備中 |
| 503 | `MODEL_UNAVAILABLE` | モデル初期化失敗 |
| 504 | `INFERENCE_TIMEOUT` | 推論時間上限超過 |
| 500 | `INFERENCE_FAILED` | モデル推論エラー |

エラーレスポンスにも `request_id` を含める。内部スタックトレースやローカルファイルパスはクライアントへ返さない。

## 11. 性能・同時実行要件

初期リリースは、RTX 3050 Laptop GPU 4GBを基準環境とする。

- TexTeller warm推論の目標：P95 1.5秒以下
- UniMERNet tiny warm推論の目標：P95 3.0秒以下
- API前処理とJSON生成の追加時間：P95 200ms以下
- モデルのcold start：60秒以内
- 推論開始後のtimeout：モデルごとに15秒
- 初期のGPU推論同時実行数：1
- 待ち行列の上限：設定可能とし、初期値は10
- 同じモデルプロセスをリクエストごとに再起動しない。
- CUDAエラーでコンテキストが破損した場合、ワーカーを再起動して1回だけ再試行する。

同時接続数は、文化祭で使用する端末台数を確定した後に負荷試験で決める。闇雲にGPU推論を並列化しない。

## 12. モデルロードとフォールバック

- サービス起動後、設定されたモデルをバックグラウンドで事前ロードする。
- モデル準備中はreadinessを失敗させ、推論APIは `MODEL_LOADING` を返す。
- 既定構成ではTexTellerを必須、UniMERNetを任意の比較・予備モデルとする。
- 呼び出し元が明示したモデルを、黙って別モデルへ切り替えない。
- 自動フォールバックを有効にする場合は設定で明示し、レスポンスの `warnings` と実際の `model.id` へ記録する。
- CPU fallbackは機能として用意できるが、ゲーム本番では遅延要件を満たすことを事前試験した場合のみ有効にする。

## 13. 設定要件

少なくとも次を環境変数または設定ファイルで変更可能にする。

- 既定モデル
- 起動時にロードするモデル一覧
- モデルvariantとcheckpoint
- `cpu` / `cuda` / `auto`
- 最大画像サイズ・最大ピクセル数
- 推論timeout
- 同時実行数と待ち行列上限
- ログレベル
- 評価データ保存先
- 自動フォールバックの有効・無効

設定値は起動時に検証し、不正な状態で推論可能として起動しない。

## 14. ログ・監視要件

画像そのものを通常ログへ書き込まず、1リクエストにつき構造化ログを1件記録する。

必須ログ項目：

- timestamp
- request ID
- model ID、variant、device
- 入力形式と処理後画像サイズ
- queue、preprocessing、inference、totalの各時間
- 成功・失敗
- エラーコード
- worker再起動・再試行の有無

集計可能なメトリクス：

- リクエスト数、成功率、モデル別エラー率
- P50、P95、最大応答時間
- 待ち行列長
- モデルのready状態
- 初期化時間
- Peak VRAMまたは現在のGPUメモリ使用量

## 15. セキュリティとプライバシー

- 初期構成は `127.0.0.1` で待ち受ける。
- LAN上の別PCから利用する場合は、APIキーまたは内部ネットワークの認証を追加する。
- CORSは数学でGOの正式なOriginだけを許可する。
- アップロードされたファイル名をサーバーの保存パスとして使用しない。
- 一時ファイルは推論後に必ず削除する。
- writer IDには実名を使用しない。
- 外部の認識APIへ画像を送信しない。

## 16. 可用性と復旧

- workerが異常終了した場合、APIプロセス全体を落とさず対象workerだけを再起動する。
- 再起動中は該当モデルだけを `error` または `loading` とする。
- 連続した再起動には上限と待機時間を設け、無限再起動を防ぐ。
- サービス終了時は子workerを正常終了させる。
- 評価CSVは1件ごとにflushし、中断後に成功済み行から再開できる現在の性質を維持する。

## 17. 呼び出し例

### Python

```python
import requests

with open("formula.png", "rb") as image:
    response = requests.post(
        "http://127.0.0.1:8000/api/v1/recognitions",
        files={"image": ("formula.png", image, "image/png")},
        data={"model": "texteller"},
        timeout=20,
    )

response.raise_for_status()
latex = response.json()["result"]["normalized_latex"]
print(latex)
```

### JavaScript

```javascript
const form = new FormData();
form.append("image", imageBlob, "formula.png");
form.append("model", "texteller");

const response = await fetch("/api/v1/recognitions", {
  method: "POST",
  body: form,
});

if (!response.ok) throw new Error(`recognition failed: ${response.status}`);
const data = await response.json();
console.log(data.result.normalized_latex);
```

## 18. 受入条件

初期リリースは、次をすべて満たしたときに完成とする。

1. 同じAPIからTexTellerとUniMERNetを明示的に選択できる。
2. モデルを省略すると設定された既定モデルが使用される。
3. モデル準備前は認識ボタンや呼び出し元がreadinessで検知できる。
4. 1回の画像送信でLaTeX、モデル情報、処理時間、request IDを取得できる。
5. `raw_latex` と `normalized_latex` を区別して返す。
6. `\[y=x^{2}\]` と `y = x ^ { 2 }` が同じ正規化結果になる。
7. PNG、JPEG、WebPを処理でき、不正画像・10MiB超過を定義済みエラーで拒否する。
8. 一時画像が成功時・失敗時とも削除される。
9. 既定GPU環境でモデル別の性能目標を満たす。
10. worker異常終了後にAPIを再起動せず復旧できる。
11. OpenAPI上でリクエスト、成功、主要エラーのschemaを確認できる。
12. 単体テスト、API統合テスト、実モデルsmoke test、連続負荷試験に合格する。

## 19. 実装段階

### Phase 1：API契約の固定

- `/api/v1` のschemaとエラーコードを実装する。
- `raw_latex` と `normalized_latex` を返す。
- liveness、readiness、モデル状態APIを分離する。
- バックエンド側へ共通画像前処理を移す。
- 既存APIの互換テストを残す。

### Phase 2：組み込みやすさと運用

- 設定ファイルと環境変数を整理する。
- 構造化ログ、request ID、timeout、待ち行列を追加する。
- Windowsでワンコマンド起動・停止できるスクリプトを用意する。
- PythonとJavaScriptの最小クライアントを提供する。

### Phase 3：本番判断

- 数学でGO Web実入力を50～100件以上収集する。
- 2モデルで同一画像を評価する。
- `\limits` 等を含む正規化規則を再検証する。
- 実際の端末台数で連続負荷試験を行う。
- 最終採用モデルとCPU fallback方針を決める。

## 20. 実装前に確定する項目

以下はシステム全体の事情で変わるため、実装開始時に確定する。

- 認識サービスとゲーム本体を同じPCで動かすか、LAN内の別PCで動かすか
- 同時に利用するゲーム端末数
- 本番PCのGPU・CPU・メモリ
- 1リクエストの許容待ち時間
- LAN公開時の認証方式
- 認識画像・筆跡を本番で保存するか
- 自動フォールバックを有効にするか

判断が未確定でも、初期実装は「同一PC、localhost、TexTeller既定、同時推論1、入力非保存」で進められる。
