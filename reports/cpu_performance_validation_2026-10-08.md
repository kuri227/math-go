# CPU環境の起動・性能検証（2026-10-08）

## 結論

GPUを使わず、CPU専用PyTorchの新規環境でTexTellerの導入・起動・認識が成功した。
Ryzen 5 5600Hでは公開手書き画像32要求の中央値1.55秒、最大2.75秒。
展示ゲームはGPU必須ではないが、PC性能・式の長さ・負荷によって待ち時間が変わるため、配布先でのリハーサルは必要。

## 検証条件

- Windows 11 Home x64、AMD Ryzen 5 5600H（6コア12スレッド）、RAM 16GB。
- Python 3.10.5、torch 2.14.0+cpu、torchvision 0.29.0+cpu、TexTeller 1.0.2、transformers 4.47.0。
- `.venv-texteller-cpu` を新規作成し、公式CPU wheelから導入。`pip check` 成功。
- torch.version.cuda=None、torch.cuda.is_available()=False。スレッド数は既定の6（interopも6）。CPU起動スクリプトでCUDA_VISIBLE_DEVICESも空にする。
- このPC自体はGPU搭載だが、CPU wheelにCUDAサポートがなく、GPUでの推論は不可能。GPUを物理的に搭載しない別PCの試験ではない。
- モデル重みは固定revisionのローカル資産を共有。CPUvenvのライブラリはゼロから導入し、GPUvenvは変更していない。

## 起動・メモリ

`start_festival_cpu.ps1 -Port 8014 -NoBrowser` で3画面を配信するFastAPIを起動。
サーバープロセス起動からreadiness=readyまで10.79秒、workerが返した初期化時間8.04秒。
事前チェック・初回ダウンロード・初回ライブラリ導入の時間は含まない。ディスクキャッシュ済みのPC上でのプロセス起動であり、完全なOSコールドブート測定ではない。
モデルプロセスWorkingSetは測定時1561.2MiB（約1.52GiB）、PeakWorkingSetは2666.4MiB（約2.60GiB）。
これはモデルプロセス単体で、OS・ブラウザー・APIを含むPC全体のRAM必要量ではない。

## 逐次認識：公開手書き画像

UniMER-Test HWE manifestを先頭から走査し、各カテゴリの最初の1枚を選択。
16カテゴリ16枚を2巡して計32要求（最初の推論も含む）。HTTP送信からJSON受信までの時間を測定。

| 指標 | 値 |
| --- | --- |
| API失敗・例外・タイムアウト | 0 / 32 |
| 平均 | 1560.84ms |
| 中央値 | 1554.79ms |
| P95 | 2711.95ms |
| 最大 | 2747.19ms |
| 最初の認識 | 1570.33ms |
| 32要求の総時間 | 49.99秒 |

カテゴリ別の最大応答時間（一部）：四則演算1.36秒、分数1.65秒、積分1.49秒、極限1.90秒、入れ子分数1.93秒、manifest上のpartial_derivativeカテゴリ2.75秒。
カテゴリは既存manifestの分類で、厳密な数学的難易度の層別ではない。画像は幅80–662pxなどの範囲で、任意サイズ・任意長の入力の最悪時間は測定していない。
少数の決定的サンプルによる動作・遅延検査であり、全6,332件の精度・速度評価ではない。
すべてdevice=cpu、peak_vram_mb=nullを確認。生記録は `results/cpu_benchmark.json`（Git対象外）。

## 同時要求・連続処理

合成筆跡「12」を同時2要求で計30回送信。失敗0、中央値1953.5ms、最大1974.6ms。
平均推論966.85ms、平均キュー待ち930.55ms。モデル実行は排他制御で逐次処理され、同時要求は待ち行列になる。
これは2台のController同期を意味しない。Display/Controllerの同期は同一PC・同一Originの1セット向け。
生記録は `results/cpu-smoke-concurrent.json`（Git対象外）。

## オフライン設定での再起動

HF_HUB_OFFLINE=1 / TRANSFORMERS_OFFLINE=1 を設定し、8015でCPUサーバーを新規起動。
準備完了9.23秒、合成筆跡5要求すべて成功、中央値965.9ms、最大990.0ms。
これによりモデル配布元への取得通信なしでローカル重みから起動・認識できることを確認した。
ネットワークを物理的に切断する会場環境やブラウザーの全操作までを検証したわけではない。

## 運用上の注意

- 正常応答と正しい読み取りは別。今回の失敗0はAPIが処理できたことを示し、全画像の正解認識を保証しない。出力に読取差もある。
- 2画面版では提出・認識中に時計を止めるため、この待ち時間自体が20秒制限を消費するわけではない。
- フロントの認識要求は30秒でタイムアウトする。今回の要求はすべてその範囲内だったが、遅いPC・長い式・負荷で超える可能性は残る。
- まず時間制限なしの練習で、実際のペン入力と1セット完走を確認する。
- GPUドライバーやCUDA ToolkitはCPU版に不要。アプリ用Python本体・CPUモデルvenv・モデルファイル・ブラウザーは必要。
- 低性能CPU、RAM 8GB、長時間耐久、実際の液タブ、GPUを物理的に搭載しない別PC、Linuxは未検証。

## 再実行

配布ZIPでは初回に `setup_festival_cpu.ps1`、毎回 `start_festival_cpu.ps1` を使用。
起動済みの別PowerShellで、公開画像不要の検査を実行できる：

```powershell
.\.venv\Scripts\python.exe scripts/smoke_exhibition.py --base-url http://127.0.0.1:8000 --expected-device cpu --requests 30 --concurrency 2 --output results/cpu-smoke.json
```

公開HWE画像とmanifestが用意されたソース環境でのカテゴリ別測定（通常の展示PCでは評価データ取得不要）：

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_cpu.py --base-url http://127.0.0.1:8000 --per-category 1 --repeat 2
```

CPU/GPU別スクリプト、環境選択、NVIDIAドライバーなしでCPU検査が通ること、配布ファイルを回帰テストとPowerShell構文解析で検査。Python全177件が対象。
GPU専用スクリプトでも8016で起動（準備完了10.22秒）し、device=cudaの5要求が成功。既存GPU環境をCPU導入で破壊していないことを確認した。
