# はじめての導入ガイド（Windows 11）

この文書は、「数学でGO」を別のWindows PCへ初めて入れる人向けです。プログラミングの知識は必要ありません。表示されたコマンドを順番にコピーして実行してください。

## 1. 導入前に用意するもの

- Windows 11の64bit PC
- 空き容量20GB以上
- 初回導入中に使えるインターネット接続
- ChromeまたはEdge
- 2画面で遊ぶ場合は、外部モニターと液タブ
- 作業中にPCを再起動しなくてよい時間

GPUは必須ではありません。NVIDIA製GPUがあるPCはGPU版を、分からない場合やNVIDIA製GPUがない場合はCPU版を選んでください。CPU版は認識に少し時間がかかることがありますが、ゲームの機能は同じです。

## 2. 必要なアプリを入れる

次の3つを公式サイトから入れます。すでに入っている場合は、次の「正しく入ったか確認する」へ進んでください。

1. [Git for Windows](https://git-scm.com/download/win)
   - 通常は表示された初期設定のまま進めて構いません。
2. [Python 3.10.11（64bit）](https://www.python.org/downloads/release/python-31011/)
   - インストール開始画面で **Add python.exe to PATH** にチェックを入れてください。
   - ページの「Windows installer (64-bit)」を選びます。
3. [Node.js 22.17.1（64bit）](https://nodejs.org/dist/v22.17.1/node-v22.17.1-x64.msi)
   - 通常は表示された初期設定のまま進めて構いません。

インストール後、スタートメニューで「PowerShell」を検索して開きます。以下を1行ずつ貼り付け、Enterを押してください。

```powershell
git --version
python --version
node --version
```

3つともバージョン番号が出れば準備完了です。「見つかりません」と表示された場合は、PCを一度再起動してからもう一度確認してください。

目安として、Pythonは`Python 3.10.11`、Node.jsは`v22.17.1`と表示されます。Gitは表示されたバージョン番号が異なっていても構いません。

最後に、画面の準備に使うpnpmを入れます。

```powershell
npm install -g pnpm@11.25.0
pnpm --version
```

`11.25.0`と表示されれば成功です。この操作はPCのpnpmを更新します。他の開発作業にも使っているPCでは、担当者へ確認してから実行してください。

## 3. 数学でGOを取得する

保存したい場所をエクスプローラーで開きます。アドレス欄へ`powershell`と入力してEnterを押すと、その場所でPowerShellが開きます。

以下を順番に実行します。

```powershell
git clone https://github.com/kuri227/math-go.git
cd math-go
Set-ExecutionPolicy -Scope Process Bypass
```

最後のコマンドは、今開いているPowerShellでだけ導入スクリプトを実行できるようにします。PC全体の設定は変更しません。

以後は、`README.md`が見える`math-go`フォルダーで操作します。

## 4. CPU版かGPU版を選んで初回セットアップする

### CPU版（迷った場合はこちら）

```powershell
.\scripts\setup_festival_cpu.ps1 -Python python
.\scripts\check_environment.ps1 -RequireReady -Device cpu
```

### NVIDIA GPU版

NVIDIA製GPUと、正常に動作しているNVIDIAドライバーが必要です。CUDA Toolkitを別に入れる必要はありません。

```powershell
.\scripts\setup_festival_gpu.ps1 -Python python
.\scripts\check_environment.ps1 -RequireReady -Device cuda
```

セットアップ中は、次の処理が自動で行われます。

- 数学でGO専用のPython環境を作る
- 必要なライブラリを入れる
- TexTellerのモデル（約1.2GB）を取得する
- ゲーム画面を準備する
- 必要なファイルとCPU／GPUの状態を確認する

赤い文字で止まった場合は、後続のコマンドを続けず、最初に表示されたエラーを確認してください。既存のPythonや他のプロジェクトへライブラリを直接追加する処理ではありません。

## 5. 初めて起動する

CPU版を入れた場合：

```powershell
.\scripts\start_festival_cpu.ps1
```

GPU版を入れた場合：

```powershell
.\scripts\start_festival_gpu.ps1
```

「Loading TexTeller」と表示されたら、そのまま待ちます。検証したGPU PCでは約20秒でしたが、PCや初回の状態によって長くなることがあります。準備が終わるとブラウザーが開きます。

3分以上待っても開かない場合は、同じ起動スクリプトを重ねて実行しないでください。PowerShellに表示された内容と`results/logs/texteller.log`を確認し、[トラブル対処](festival-operation.md#トラブル対処)へ進みます。

## 6. 最初の動作確認をする

1. タイトル画面が表示されることを確認します。
2. まず「1画面でスタート」を選びます。
3. 難易度を選び、ゲームスタートまで進みます。
4. 回答欄へ数字や式を書き、「読み取りを確認」を押します。
5. 手書き画像と読み取られた答えが表示されることを確認します。
6. 結果画面からタイトルへ戻れることを確認します。

スタッフ用の「問題テスト・学習データ整備」では時間制限なしで1問ずつ確認できます。認識速度や液タブのペンを確認するときはこちらを使ってください。

## 7. 2画面を準備する

1. Windowsのディスプレイ設定で、表示方法を「表示画面を拡張する」にします。
2. タイトル画面で「2画面でスタート」を選びます。
3. モニター用画面にある「液タブ用画面を開く」を押します。
4. 新しく開いた入力画面を液タブへ移動します。
5. 問題がモニター、回答用紙とメモ用紙が液タブに表示されることを確認します。
6. 両方の画面で「2画面接続済み」と表示されることを確認します。

ブラウザーが新しい画面を開かなかった場合は、アドレスバー付近に表示されるポップアップ許可を確認してください。2画面は同じPC・同じブラウザーで使用します。

## 8. 2回目以降の起動

毎回セットアップする必要はありません。`math-go`フォルダーでPowerShellを開き、使用する方の起動コマンドだけを実行します。

```powershell
Set-ExecutionPolicy -Scope Process Bypass
# CPU版
.\scripts\start_festival_cpu.ps1
# GPU版を使う場合は、上の代わりにこちら
# .\scripts\start_festival_gpu.ps1
```

停止するときは、起動に使ったPowerShellを選び、`Ctrl+C`を押します。PowerShellを閉じるとゲームも停止します。

## 9. 最新版へ更新する

ゲームを停止し、`math-go`フォルダーで次を実行します。

```powershell
git status
git pull --ff-only
```

`git status`で変更ファイルが表示された場合は、問題や収集データを上書きしないため、先に開発担当者へ確認してください。`git reset --hard`は使いません。

更新後は、使用している方の初回セットアップをもう一度実行します。更新されたライブラリと画面だけが準備されます。

```powershell
# CPU版
.\scripts\setup_festival_cpu.ps1 -Python python
.\scripts\check_environment.ps1 -RequireReady -Device cpu

# GPU版の場合は上の2行ではなくこちら
# .\scripts\setup_festival_gpu.ps1 -Python python
# .\scripts\check_environment.ps1 -RequireReady -Device cuda
```

## 10. オフライン会場へ持っていく前の確認

- 会場へ行く前にセットアップとモデル取得を完了する
- 一度インターネット接続を切り、起動と1問の認識を確認する
- 実際のモニターと液タブで2画面プレイを確認する
- Windowsのスリープ、通知、更新による中断を担当者が確認する
- 起動用PowerShellを閉じない

当日のチェックリスト、ログの場所、詳しい復旧方法は [展示PCの運用マニュアル](festival-operation.md) にあります。

## 11. この導入でPCへ追加されるもの

主なファイルは、取得した`math-go`フォルダーの中へ保存されます。

| 保存場所 | 内容 |
| --- | --- |
| `.venv` | ゲームサーバー専用のPython環境 |
| `.venv-texteller` | GPU認識専用のPython環境 |
| `.venv-texteller-cpu` | CPU認識専用のPython環境 |
| `.model-cache` | TexTellerのモデル |
| `game/node_modules` | ゲーム画面に必要な部品 |
| `game/dist` | 準備済みのゲーム画面 |

NVIDIAドライバーやWindowsのCUDA Toolkitは、導入スクリプトではインストール・更新しません。Pythonの追加ライブラリも数学でGO専用フォルダーへ入ります。

## 12. 対応環境と未検証環境

- 検証済みの中心環境：Windows 11 x64、Python 3.10、Node.js 22、pnpm 11.25.0
- セットアップが受け付けるPython：64bit版3.10～3.12
- GPU版の検証機：NVIDIA RTX 3050 Laptop（VRAM 4GB）
- CPU版の検証機：AMD Ryzen 5 5600H、RAM 16GB
- macOS、Windows ARM、WSLは未検証
- AMD／Intel GPUでのGPU認識は対象外。CPU版を使用してください

Linux向けの参考手順は [展示PCの運用マニュアル](festival-operation.md#linux-x64手順提供実機未検証) にありますが、実機検証済みの導入方法はWindows版です。

## 13. 途中で分からなくなったとき

次の3点を控えて開発担当者へ渡してください。画面全体の写真より、文字としてコピーした方が原因を確認しやすくなります。

1. 実行したコマンド
2. PowerShellに最初に表示された赤いエラー
3. CPU版とGPU版のどちらを選んだか

セットアップや起動を何度も重ねて実行せず、エラーが出たPowerShellは閉じずに残してください。既存データを守るため、案内のないファイル削除や`git reset --hard`は行いません。
