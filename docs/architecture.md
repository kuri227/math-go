# アーキテクチャ（現行）

更新日：2026-10-21。ゲーム仕様は [2モード仕様](two-mode-exhibition.md)、運用手順は [展示運用](festival-operation.md) を正とする。
以前のPhaser / GameCoordinator構成は [履歴資料](history/architecture-before-2026-10-21.md) に保全した。

## 全体構成

```text
同一PC / 同一ブラウザー・プロファイル / 同一Origin
  Display: Session（唯一の進行正本） + App
                  ↕ BroadcastChannel（状態 / 操作 / heartbeat）
  Controller: HandwritingPad + App → PNGをAPIへ直接送信
  Single: 同じSessionとAppを1画面で利用
                  ↓ HTTP
  FastAPI: 問題 / 採点 / 画像検証 / 保存
                  ↓ 小さいJSON Lines + 一時画像パス
  TexTeller worker（展示認識） / UniMERNet worker（任意比較）
```

画像・筆跡はBroadcastChannelへ載せない。Controllerがcrop PNGをAPIへ送り、認識結果だけをDisplayへ通知する。
Displayが採点・タイマー・残機を確定し、Controllerは受信状態を表示する。別PC間の同期は提供しない。

## フロントエンドの責務

| モジュール | 責務 |
|---|---|
| `exhibition/Session.ts` | 進行・時計・残機・重複回答拒否。DOMを参照しない |
| `exhibition/App.ts` | 3役割共通の操作・通信・表示の組み立て |
| `exhibition/view.ts` | 静的な意味構造とラベル |
| `exhibition/catalog.ts` | 問題検索の事前インデックス・ID選択・難易度名 |
| `exhibition/dom.ts` | 静的要素の参照と同値テキスト更新の抑制 |
| `api/http.ts`, `RecognitionClient.ts` | HTTP・応答検証・エラー整形・タイムアウト |
| `dual-screen/StatePublisher.ts` | 同じ状態の再送抑制。新規接続へは強制送信 |
| `dual-screen/DualScreenChannel.ts` | 接続ID・通し番号・heartbeat・通信版の検証 |
| `ui/HandwritingPad.ts` | Pointer Events・undo・clear・resize・PNGと筆跡の生成 |
| `ui/renderMath.ts`, `mathFit.ts` | KaTeX・文字列フォールバック・実寸による枠内調整 |

認識は30秒、保存は15秒、通常の採点・正答・問題取得等は10秒で応答を待つ。ページ全体のモデル準備監視は最大3分。
時間切れ後にPOSTが処理済みの場合もあるため、保存再試行には同じ認識要求IDを使い、サーバーが同じ画像・転記・筆者・筆跡であることを検証する。

状態が変わらない結果画面やガイドは再送しない。時計が動く間の100ms更新と1秒ごとの接続heartbeatは継続する。
画面遷移では適切な見出しへフォーカスを移す。手書きそのものの完全なキーボード代替・スクリーンリーダー実機確認は未提供／未検証。

## APIとモデル処理

- `GET /api/v1/questions` は正答を含めない。採点と正答公開は別API。
- `POST /api/v1/recognitions` は選択モデル1つの認識・前処理・待ち行列・推論時間を返す。
- `uploads.py` でPNG/JPEG/WebP、10MiB、1600万画素を共通検証。一時ファイルは処理後に削除する。
- モデルごとのasync lockで同時推論を直列化し、推論・比較・保存の重い同期処理はthreadpoolへ逃がす。
- 比較用の `/recognize/compare` は同一PNGをモデルへ順番に渡す。イベントループは塞がないが、同一モデルの待ち行列は発生する。
- `recognizers/protocol.py` がプロセスごとの受信箱と読取スレッドを担当。準備180秒・推論25秒を上限とし、`worker.py` は単一の再入可能lockで起動・要求・破棄を直列化する。
- 要求IDを両モデルが応答へ返す。不一致・壊れた結果・無応答・EOFではワーカーと受信箱を破棄し、次の読取で再起動する。Windowsではvenvランチャーの実子プロセスも終了する。認識結果の無断自動再提出はしない。
- `recognizers/input_image.py` は背景除去で空になる画像をモデル開始前に拒否する。Canvasの同一点列は点として描画し、白紙PNGにならないようにする。
- ブラウザー側30秒とワーカーの推論25秒は異なる。初回／再起動のモデル準備は最大180秒なので、準備中にブラウザーが先に待ち上限に達する場合がある。
- 公開先は既定127.0.0.1。管理APIに認証はない。インターネットへ公開せず、LAN利用も信頼できる範囲に限定する。

## データと問題

`config/paths.toml` と `HMER_DATA_ROOT` が収集先・評価データを決める。
問題バンクは既定 `config/game_questions.json`。隔離検証用に `HMER_QUESTION_BANK` で別ファイルを指定でき、読む・登録・レビュー・採点が同じ設定を参照する。
問題キャッシュはmtime/ctime/sizeで無効化。書込時に全体検証し、プロセス内lockで直列化する。単一サーバープロセス運用を前提とし、複数workersは推奨しない。

`POST /api/v1/test-samples` は同意と人の転記確認を要求する。候補PNG・筆跡・メタデータ・CSVを保存するが、自動学習しない。
学習用台帳は `data/training` の一箇所。1回通過・未使用画像だけの追加学習、失敗時の再投入禁止、筆者別分割は [再学習手順](texteller-training.md) を参照。
公開HWEは評価用であり、学習に使わない。元モデル・運用データ・台帳はGit対象外。

## 検証と履歴

自動テスト、ビルド、実API、ブラウザー操作の証拠は [2026-10-21検証](../reports/refactor_playtest_2026-10-21.md) に記録する。
過去のレポートはその時点の仕様・環境の結果として扱い、現在の全機能の保証へ読み替えない。
