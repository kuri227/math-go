# TexTeller追加学習とデータの一回限りの利用

## 目次

- [何ができるか・制約](#scope)
- [必要な環境](#environment)
- [収集・取り込み・レビュー](#review)
- [CPU / GPUで実行](#run)
- [ファイル管理と再学習防止](#ledger)
- [結果の評価・モデルの採用と戻し方](#adoption)
- [失敗・中断・PC移動](#recovery)
- [検証済みの範囲](#validation)

<a id="scope"></a>

## 何ができるか・制約

収集したPNGと**人が確認した手書きの転記**でTexTellerを追加学習する。問題の正答例やモデル自身の出力を教師として自動使用しない。
通常の多エポック学習と異なり、ユーザー要件に合わせ、**同じ画像を勾配更新へ二度投入しない**ことを優先する。

- 学習は出力射影層（LM head）のみ。画像エンコーダー・デコーダー本体・入力埋め込みは固定。共有された出力重みは分離して学習・保存する。
- 1エポック、バッチ1、再サンプリング・水増し・分散学習・チェックポイント再開なし。学習画像ごとに1回の勾配更新だけ行う。
- 2回目以降は直近の成功モデルを引き継ぎ、未使用の新規画像だけを使う。過去画像のリプレイはしない。
- 少量データ・一回通過・headのみなので、精度向上は保証しない。検証損失が下がっても認識精度の向上とは限らない。忘却の評価も必要。
- 保存直後の自動学習、Web画面からの学習開始、自動モデル採用はしない。管理者がCLIで実行する。

公式の[学習例](https://github.com/OleehyO/TexTeller/tree/main/examples/train_texteller)を確認した上で、繰り返し学習を防ぐため独自の単一通過ループを実装した。インストール済みTexTeller 1.0.2の `load_model` / `load_tokenizer` と、推論と同じ決定的な画像前処理 `texteller.utils.transform` を使用する。追加の学習用リポジトリのcloneは不要。

<a id="environment"></a>

## 必要な環境

先にREADMEのCPU版またはGPU版セットアップを行う。学習コマンドは既存のローカル環境だけを使用し、pip・Torch・CUDA・グローバルPython設定を変更しない。

| 用途 | Python |
|---|---|
| 取り込み・レビュー・台帳確認 | `.venv/Scripts/python.exe` |
| CPU学習 | `.venv-texteller-cpu/Scripts/python.exe` |
| NVIDIA GPU学習 | `.venv-texteller/Scripts/python.exe` |

追加学習にもTorch・TexTeller・Transformers・Pillowが必要だが、既存の推論用環境に含まれる。`texteller[train]` やaccelerateを追加導入する必要はない。CPU版はCUDA不要。GPU版は互換NVIDIAドライバーとCUDA版Torchが必要で、GPU非対応時の黙ったCPU切替はしない。
元モデルは `.model-cache/texteller` が必要。学習結果は別保存するため、モデル1個分以上の空き容量を実行ごとに確保する。使用中サーバーと学習を同時稼働させない。推論のRAM/VRAM要件がそのまま学習要件になるわけではなく、4GB GPUでの本モデル学習は未検証。
Linuxでは下記pythonパスの `Scripts/python.exe` を `bin/python` に読み替える。PowerShellラッパーはWindows向け。

<a id="review"></a>

## 収集・取り込み・レビュー

1. テストプレイで実際の画像と転記を確認し、保存同意を取得する。同一筆者には常に同じ**仮名コード**を使う。氏名を使わない。`anonymous` / `unknown` / `qa-synthetic-exclude` は学習対象から除外する。
2. リポジトリ直下で候補を取り込む。元画像・元メタデータは変更しない。

```powershell
.\.venv\Scripts\python.exe scripts/train_texteller.py scan
.\.venv\Scripts\python.exe scripts/train_texteller.py status
```

`scan` は学習しない。明示的な `consent=true` と `human_verified=true` のあるものだけを候補にする。拒否を含む場合は終了コード2（取り込み可能な候補は保存済み）。既定はゲームと同じcustom_eval設定で、`HMER_DATA_ROOT` も反映する。別の保存場所なら `scan --source "D:\math-data\custom"` を指定する。画像パスは元メタデータの絶対パスまたはこのリポジトリからの相対パスで解決し、指定したsourceのimages配下以外は拒否する。管理台帳は保存場所にかかわらずこのリポジトリの `data/training` 一箇所に固定。

3. 管理者が `data/training/objects/<hash>.png` と `status` のlabelを照合。誤ラベル・個人情報・同一画像・類似候補を確認してから、**個別に**承認する。以下のIDはstatusに出た実際のsample_idへ置き換える。

```powershell
.\.venv\Scripts\python.exe scripts/train_texteller.py review --sample-id sample_XXX --split train --reviewer staff-01
.\.venv\Scripts\python.exe scripts/train_texteller.py review --sample-id sample_YYY --split validation --reviewer staff-01
.\.venv\Scripts\python.exe scripts/train_texteller.py review --sample-id sample_ZZZ --split test --reviewer staff-01
.\.venv\Scripts\python.exe scripts/train_texteller.py plan
```

少なくとも別筆者のtrainとvalidationが各1件必要。実運用では複数筆者・多様な式と、独立したtest筆者を十分に確保する。必要件数や精度向上をこの最小件数が保証するものではない。同一筆者を別splitに分けること、承認済みsplitの変更は禁止。

`near_duplicates` はdHashによる候補で、別筆跡が同じハッシュになることもある。候補がある場合は画像を人が比較し、別筆跡だと確認したときだけreviewに `--checked-near-duplicates` を付ける。同じ画像なら承認しない。完全一致画像は、このオプションでも別の学習画像にならない。

旧データで同意記録・人の転記確認がない場合は、自動でtrueに補完しない。必要な同意と出典を確認して再収集するか、管理者が適切な手続きを別途行う。2026-10-16の現PCでは11件があり、旧形式9件とQA等2件のため取り込み0件。現時点で人の承認が必要なため、実データ学習は未実施。

<a id="run"></a>

## CPU / GPUで実行

`plan` の内容を確認し、サーバーを停止してからどちらか一方を使う。引数は失敗時にも対象画像を再投入できなくなることの確認。

```powershell
# GPUを使わない
.\scripts\train_texteller_cpu.ps1 -ConfirmSingleUse

# または NVIDIA GPUを使う
.\scripts\train_texteller_gpu.ps1 -ConfirmSingleUse
```

直接指定する場合（ラッパーと同じ処理）：

```powershell
.\.venv-texteller-cpu\Scripts\python.exe scripts/train_texteller.py run --device cpu --confirm-single-use
.\.venv-texteller\Scripts\python.exe scripts/train_texteller.py run --device cuda --confirm-single-use
```

既定学習率は `1e-5`。直接実行なら `--learning-rate` で変更可能だが、同じ画像を別の学習率で再実験することはできない。エポック数・resume・force-retrainの引数は存在しない。

事前にモデル・トークナイザー・画像・同意メタデータ・ラベル長・未知トークンを検査。トークンを黙って切り詰めない。この事前検査だけで失敗した場合は未使用のまま。学習用に予約が確定した後は、更新前の失敗も含め**バッチ全件を再利用不可**にする。これは二重学習を避けるための意図的なデータ損失トレードオフ。

<a id="ledger"></a>

## ファイル管理と再学習防止

```text
data/custom/                         収集原本（変更・移動しない）
data/training/
  registry-id.json                   台帳の識別子
  registry.sqlite3                  画像・別名・レビュー・筆者分割・使用履歴
  objects/<image-content-hash>.png   固定化した学習候補
  runs/<run-id>/
    reservation.json                予約時の画像一覧・教師・設定・元モデルハッシュ
    steps.jsonl                     1画像ごとの更新記録
    metrics.json                    損失・件数・出力重みハッシュ（成功時）
    model/                          新しい重み・config・tokenizer（成功時）
```

- デコードしたRGB画素と寸法をSHA-256化。可逆圧縮の違い、ファイル名変更、白い余白追加でも同じ画像は1件にまとめる。教師や筆者が食い違う同一画像は隔離し、承認済みでも以後の学習から外す。
- JPEG再圧縮・リサイズ・別の線色・類似した書き直しは画素が異なるため、完全一致判定では保証できない。類似候補と目視レビューを併用する。任意の加工・別PCの独立台帳・管理外の学習スクリプトまで絶対に検出するものではない。
- SQLiteの一意制約と排他トランザクションで画像の二重予約を禁止。学習実行中は次の実行を禁止。
- 消費台帳への予約はforwardより前に確定し、成功・例外・中断で消費を取り消さない。検証画像の反復評価は勾配更新なしであり、学習用画像へ転用しない。
- 台帳と実行記録を突き合わせ、台帳欠損・新旧バックアップの混在・改ざん・不整合時は実行拒否。原メタデータの変更（同意撤回・教師変更を含む）や候補PNG変更も学習前に拒否。
- このディレクトリ全体は手書き・教師を含む機微な運用データでGit対象外。`git pull` しても消えない。**空き容量整理のため台帳だけ消す、data/trainingを再作成して再投入する行為は禁止。**

<a id="adoption"></a>

## 結果の評価・モデルの採用と戻し方

`completed` は学習処理と保存の完了であり、精度改善や展示採用の承認ではない。`metrics.json` のvalidation損失だけで採用しない。学習に未使用のtest筆者と既存の公開評価セットで元モデルと比較し、正答一致率・認識失敗・処理時間・以前の分野の劣化を確認する。test画像は学習処理では使用しない。

採用する場合だけ、現在のサーバーを止め、新しいPowerShellで指定する（RUN_IDは成功runのID）。通常のモデルディレクトリは上書きしない。

```powershell
$env:TEXTELLER_MODEL_DIR = (Resolve-Path ".\data\training\runs\RUN_ID\model").Path
# セットアップし直さず、CPUならこちら
.\scripts\start_festival_cpu.ps1
# GPUなら start_festival_gpu.ps1
```

元モデルへ戻すにはそのサーバーを止め、新しいシェルで通常起動するか、この環境変数を解除して再起動する。

```powershell
Remove-Item Env:TEXTELLER_MODEL_DIR -ErrorAction SilentlyContinue
.\scripts\start_festival_cpu.ps1
```

本学習CLIの次回実行は「直近の成功学習モデル」を引き継ぐ。展示で元モデルへ戻しても学習履歴は消さず、同じデータを初めから再利用しない。

<a id="recovery"></a>

## 失敗・中断・PC移動

- 通常の例外は `failed`。そのrunの画像は再投入しない。新しいデータを収集して次のrunへ進む。
- 強制終了・停電で `running` が残った場合は自動解除・自動resumeしない。まずプロセス停止、ログ、全体バックアップを確認し、管理者による個別復旧が必要。本版には安易な解除コマンドを設けていない。
- DBだけ古い状態へ戻さない。サーバーと学習を停止した状態で `data/custom` と `data/training` を**全体で**バックアップする。SQLiteファイルを実行中に単体コピーしない。
- 別PCで同じ収集原本を新規の空台帳へ入れて学習する運用は禁止。学習する管理PC・リポジトリは1つに固定する。移行時も元の学習運用を止め、全履歴・objects・runsを一緒に移し、元メタデータの絶対パスが台帳と一致することを確認する。パスが変わる移行は本版の自動対応外で、整合性確認を伴う管理者対応が必要。
- すべての履歴とバックアップを人が削除した場合、過去の利用を復元して検知することはできない。台帳とバックアップの保全はこの保証の前提。

<a id="validation"></a>

## 検証済みの範囲

台帳の重複・同意・筆者分割・変更検出・二重起動・失敗後再投入禁止・台帳不整合を一時データでテスト。小型VisionEncoderDecoderモデルで、実際のTexTeller前処理 → 1回の勾配更新 → frozen encoderの不変確認 → safetensors保存・再読み込みをCPUで検証した。加えて本番のrun関数で2回の追加学習を通し、使用済み再実行の拒否、新規画像だけの選定、前回重みの継承と台帳整合性を確認した（モデルとtokenizerのローダーのみ小型ローカル版へ差し替え）。

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_training_registry.py
.\.venv-texteller-cpu\Scripts\python.exe scripts/verify_training_engine.py
```

後者は合成画像とランダム初期化の小型モデルだけを使い、収集データ・元モデル・台帳を変更しない。実サイズTexTellerでの学習時間・RAM/VRAM・精度改善・GPU学習はまだ検証していない。承認できる実データと独立した検証筆者を確保後に測定する。
