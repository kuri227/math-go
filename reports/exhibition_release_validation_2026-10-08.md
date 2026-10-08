# 展示PC向け検証（2026-10-08）

## 結果

Windows上のビルド、API、ゲーム状態遷移、clean cloneの新規API環境とフロント依存導入、実GPUの連続認識、配布ZIP検査が通過。
展示PCそのもの・実液タブ・会場ネットワーク・長時間耐久試験は未実施であり、当日の実機リハーサルは必要。

環境: Windows 11 Home x64、Python 3.10.5、Node 22.17.1、pnpm 11.25.0、RAM 16GB、RTX 3050 Laptop 4GB、torch 2.14.0+cu132、torchvision 0.29.0+cu132、TexTeller 1.0.2。
ソース機能の検証対象: `8351299`（後続の文書コミットは手順・記録の整理）。

## 自動検証

| 対象 | 結果・範囲 |
| --- | --- |
| Python | 173件通過。API正常/異常、JSON問題管理、正規化、ワーカー復旧、導入失敗時停止 |
| TypeScript | 9ファイル110件通過。Coordinator、二重提出、終了理由、同期、説明内容、レイアウト |
| 問題バンク | 全50問の正答・全登録許容表記・解説取得・不正解入力とKaTeXレンダリング |
| 連続プレイ | 3モード×7難易度×100回=2,100セッション。完走と残機切れを交互に検証（モデルはモック） |
| サイズ計算 | 幅320/390/640/957/1280、領域高4種、式寸法50種、時間20段階の20,000組。有限値・領域内への収まり |
| ビルド | frozen lockfile導入、TypeScript型検査、Viteの3ページとローカル数式/フォント生成 |
| PowerShell | 全スクリプトの構文解析が成功 |
| 依存 | 既存API/モデルvenvとclean clone APIvenvのpip checkが成功 |
| 配布 | alpha.2 ZIPを生成・展開し、3画面/問題JSON/requirements/起動Python/マニュアルの存在とモデル・個人筆跡・ログ・pycの非混入を検査 |

ViteのPhaserを含む大きなチャンクの警告、Starlette TestClient/httpxの非推奨警告が残る。ビルド・テストの失敗ではないが、今後の依存更新時に対応する。

## 実モデル・ビルド済み画面

`start_festival.ps1 -NoBrowser -Port 8012 -Device cuda` でTexTeller準備完了後の起動を確認。
合成筆跡画像を実モデルに30回送信、同時要求2件: エラー0、中央値284.35ms、最大936.9ms。
clean clone側の8013でも30回・同時2件: エラー0、中央値252.55ms、最大1235.0ms。
これらは同一の単純な画像によるAPI安定性確認で、認識精度の代表値・任意の問題の応答保証ではない。

本番用FastAPIから配信したDisplayとController各1タブで、接続→練習説明→開始→Canvas入力→提出→認識/採点→不正解表示→次問→未回答→残機切れを確認。
実際に「1」と認識され、不正解の正答12を表示した。終了時は「残機が0になったため、3問目で終了しました（全5問）」、0/3問正解、正解率0%を確認。
Displayのブラウザーコンソールにerror/warnなし。自動ポインタードラッグは途中で操作ツールがタイムアウトし、複雑な筆跡入力の今回の再検証には制限がある。
過去の5問完走・戻す/消去/書き直し・全画面の実操作記録は `dual_screen_user_flow_test_2026-10-08.md`、サイズ別検証は `formula_resize_validation_2026-10-08.md` に残す（旧スコア表示は当時の仕様）。

## clean cloneの再現性

ローカルGitの所有者制約があるため、グローバルsafe.directoryを変更せずGit bundleから新規cloneを作成。
追跡対象だけを含むcloneに新しい `.venv` を作り、`pip install -r requirements/test.txt -e .` と新規 `pnpm install --frozen-lockfile` を実施。
新しく解決された推移的依存（Starlette 1.7.0等）でもPython173件・TS110件・ビルド・pip checkが通過した。
修正後のセットアップは元のPCで最後まで再実行し、固定revisionの9ファイル取得とCUDA利用可否・起動前検査を確認。

clone側の実モデル起動は `TEXTELLER_PYTHON` / `TEXTELLER_MODEL_DIR` を明示して既存モデルvenvと重みだけを再利用した。
したがって、新PCへのモデル依存全量のゼロからの導入、CPU/Linux、ネットワークなしの物理環境までは検証していない。

## 今回見つけて修正した問題

- セットアップの外部コマンド失敗を成功扱いで続行しうる: Pythonのcheck=TrueとPowerShellの終了コード検査へ統一。
- GPU専用導入: CPU wheelと明示的なCPU起動を追加。
- サーバー生存確認とモデル準備完了の混同: 起動時はTexTeller readinessを確認。
- 配布ZIPに新しいセットアップPython/requirements/Controller等が不足: 必須ファイル検査と梱包を拡張。
- cloneでpip constraintsにextrasを渡すと失敗: exact requirementsとeditable packageを同時に解決するよう修正し、回帰テスト追加。
- 旧稼働サーバーで認識503が発生。最新コードを新規起動した8012/8013では計60要求成功。旧プロセスの状態が原因かコード差かは断定せず、更新時は再起動必須とした。

## 再実行

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements/test.txt
.\.venv\Scripts\python.exe scripts/verify_exhibition.py
.\scripts\check_environment.ps1 -RequireReady -Device cuda
# サーバーを別PowerShellで起動してから
.\.venv\Scripts\python.exe scripts/smoke_exhibition.py --requests 30 --concurrency 2
.\scripts\package_release.ps1 -Version 0.1.0-alpha.2
```

モデル重み、参加者の筆跡、実行ログ、生成テスト出力、venv、ビルド済み資産はGitへ入れない。READMEと運用マニュアルの当日チェックを実機で実施すること。
