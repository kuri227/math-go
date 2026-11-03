# セキュリティ監査とFirebase導入チェックリスト

最終更新: 2026-11-03  
対象: 現行の数学でGO、将来のランキング実装  
状態: **ローカルWebアプリのP0/P1対策とFirebaseの安全な基盤を実装済み。本番Firebase接続と会場リハーサルは未完了。**

チェックは、コード・自動テスト・実機確認の根拠がある項目だけを完了にしています。

## 1. 守る範囲とデータ境界

- [x] 展示用ゲーム、認識、問題管理、テストプレイ、問題報告、筆跡候補はlocalhostで動かす。
- [x] 問題管理とテストプレイはこのPCだけで扱い、Firebaseのスキーマへ含めない。
- [x] Firebaseの雛形は本番ランキングの最小データだけを受け、問題文、正答、認識LaTeX、画像、筆跡、writer ID、問題報告を受け取らない。
- [ ] 回線断時のローカル再送キューをゲームへ実装し、Firebase停止時もプレイが継続することを実機確認する。

## 2. ローカルWebアプリ

### 画像と依存関係

- [x] Pillowを現時点の最新版12.3.0へ更新し、`pyproject.toml`を`pillow>=12.3,<13`へ変更した。
- [x] ブラウザーcanvasが生成する非インターレース8-bit PNGだけを許可し、形式偽装、JPEG/WebP/BMP、APNG、EXIF、ICC、テキスト、未知チャンクをPillowより前に拒否する。
- [x] PNGの署名、チャンク長、CRC、IHDR、寸法、IENDを検証し、10MiB・1600万画素を上限とする。
- [x] Pillowへ`formats=("PNG",)`を渡し、不要なデコーダーを開かない。一時名は利用者のファイル名から決めない。
- [x] 不正形式、形式偽装、APNG、EXIF、ICC、巨大寸法のAPI回帰テストを追加した。
- [x] `certifi`を2026.10.23、`setuptools`を84.2.1へ更新し、`pip check`で破損なしを確認した。
- [ ] Pillow 12.3.0にも次期13.0.0で修正予定の公開アドバイザリが残る。13系公開後に互換性を確認して更新する。それまでは上記PNG限定プリパーサーを必須とする。
- [x] `pytest`の一時ディレクトリ警告はUNIXが対象で、Windows展示環境の直接経路ではないと切り分けた。互換性上、現時点では`pytest<9`を維持する。

### localhost境界と負荷制御

- [x] 問題管理、認識、比較、model preload、サンプル保存、テストサンプル、認識履歴をloopback接続・loopback Host・同一Originに限定した。
- [x] 悪意あるWebサイトからlocalhostへのcross-origin要求を拒否する。
- [x] POSTは接続元とpath単位で毎分90回、Content-Lengthは12MiBに制限する。
- [x] `/samples`にも筆跡JSON 2MB、最大1万stroke・合計1万2千点、有限座標の検証を適用した。
- [x] 問題、正答候補、説明、カテゴリ、判定LaTeX、各IDへ件数・文字数上限を付けた。
- [x] 2画面WebSocketは最大32 session、毎分1200 message、単調増加sequence、JSON深さ・要素数・文字列長、型別payloadを検証する。
- [x] 問題数の上限は現在の516へ固定せず、将来の問題追加に備えた保守用定数へ分離した。
- [x] `start_festival.ps1 -Lan`を無効化し、展示サーバーを常に`127.0.0.1`へ限定した。複数PCランキングは将来の外向きHTTPSだけを使う。
- [ ] 認識処理そのものの同時実行キュー上限は、実機GPU負荷試験に基づき別途設定する。

### HTTP・XSS・情報露出

- [x] 全レスポンスへCSP、`nosniff`、`DENY`、`no-referrer`、Permissions Policy、COOPを追加した。
- [x] 起動スクリプトへ`--no-server-header`を追加した。
- [x] 公開エラーは一般化し、内部例外はサーバーログだけへ残す。
- [x] 問題文等は`textContent`等で描画し、KaTeXは明示的に`trust:false`とする。
- [x] `javascript:` href、`htmlClass`、`includegraphics`、イベント属性が実行要素にならない自動テストを追加した。
- [x] Computer Useで問題登録プレビューへ`<img src=x onerror=alert("xss")>`を入力し、テキスト表示、実行要素0、イベント属性0、dialogなしを確認した。
- [ ] 将来ランキング名を画面へ実装するとき、保存後再読込・一覧・管理画面・CSV再取込まで保存型XSSを再検査する。

## 3. Firebaseの設定値と秘密情報

Firebase Web設定は認可用の秘密ではありませんが、このプロジェクトでは誤commit防止のため実値をGitへ入れません。`VITE_*`はブラウザーから見えるため、アクセス制御はApp Check、Auth、Functions、Rules、IAMで行います。

- [x] `game/.env.example`はキー名と`REPLACE_WITH_LOCAL_VALUE`だけを追跡する。
- [x] `.firebaserc.example`はダミープロジェクトIDだけを追跡する。
- [x] `.env.local`、`.env.*.local`、`.firebaserc`、`.firebase/`、debug log、サービスアカウントJSONをignoreした。
- [x] Admin SDK秘密鍵をコード、ブラウザー、ゲームPCへ置かず、Functionsの実行資格情報を使う設計にした。
- [x] 実値を載せない設定・検証手順を[Firebaseランキングの安全な準備](firebase-ranking-setup.md)へ記載した。
- [ ] 各PCで実値を口頭またはオフラインで受け取り、`game/.env.local`へ設定する。
- [ ] コミット前の自動秘密情報スキャンをCIへ追加する。

## 4. Firebaseランキングの安全な基盤

- [x] `firebase.json`、Firestore Rules、複合index、Functions、Emulator設定をGit管理する。
- [x] Firestore Rulesはブラウザーの直接read/writeを認証の有無にかかわらず既定拒否する。
- [x] `submitScore`と`getLeaderboard`をApp Check必須のCallable Functionとして実装した。
- [x] Anonymous Authを必須とし、UIDとrun IDで冪等化し、UIDごとの短時間連投を拒否する。
- [x] 送信スキーマの余分なfield、ID、表示名1〜20文字・制御文字、難易度1〜7、固定10問、重複問題、実現不能な時間を拒否する。
- [x] クライアントの合計点を受け取らず、Functionが1000点＋速度メダル＋パーフェクトを再計算する。
- [x] Functionはserver timestampを保存し、上位10件に必要な公開項目だけを返す。
- [x] 得点改ざん・余分なfield・重複問題・不正時間・表示名制御文字の単体テストを追加し、3件成功した。
- [ ] 現PCはJava 8のため、Java 21必須のFirestore Emulatorテストは未実行。テスト自体は追加済みで、Java 21導入後に直接read/write拒否4経路を実行する。
- [ ] App Checkをテストプロジェクトで監視モードから確認し、正規端末確認後に強制する。debug tokenはGitや画面写真へ載せない。
- [ ] ゲーム側へAnonymous Auth、送信、上位10件表示、IndexedDB再送キューを接続する。
- [ ] 管理者Authとcustom claimsによる表示名編集・非表示・個別削除・全削除を実装する。全削除はバックアップと再確認を必須にする。

## 5. 本番受入試験

- [x] Python全体テスト、フロント625件、production build、Functions build・得点検証を実行した。
- [ ] Java 21環境でRules Emulatorテストを成功させる。
- [ ] テストFirebaseで未認証、App Checkなし、改ざんpayload、重複run、過大値、直接Firestoreアクセスを確認する。
- [ ] 2〜3台・合計100プレイで同時登録、回線断、再接続、重複再送、Firebase停止をリハーサルする。
- [ ] ブラウザー開発者ツールで、問題・正答・画像・筆跡・認識結果・問題報告が送信されないことを確認する。
- [ ] Blazeプラン、予算アラート、運用担当者を決めてから本番プロジェクトへ切り替える。

## 6. 監査記録と残るリスク

| 検証 | 2026-11-03の結果 |
|---|---|
| Python tests | 全体実行（結果件数はテスト完了ログを参照） |
| Game Vitest | 18 files / 625 tests 成功 |
| Game production build | 成功 |
| Functions TypeScript build | 成功（本番はNode 22指定。確認PCはNode 24） |
| Functions score tests | 3 tests 成功 |
| Firestore Rules Emulator | Java 8のため未実行。Java 21以上が必要 |
| `pip check` | 破損なし |
| `pnpm audit --prod` | ゲーム側・Functions側とも既知脆弱性0 |
| XSS実機確認 | 問題登録プレビューで実行要素・イベント属性・dialogなし |

Pillow 13.0.0未公開、Firebase実値未設定、Rules Emulator未完了、複数PCリハーサル未実施のため、「未知の脆弱性がない」「ランキングが本番投入可能」とはまだ判定しません。現時点で本番投入できる範囲は、localhost限定の既存ゲームです。

## 7. 根拠ファイル

| 境界 | ファイル |
|---|---|
| localhost・Origin・ヘッダー・rate limit | [`backend/app/local_admin.py`](../backend/app/local_admin.py) |
| 画像コンテナとdecoder制限 | [`backend/app/uploads.py`](../backend/app/uploads.py) |
| JSON入力 | [`backend/app/schemas.py`](../backend/app/schemas.py)、[`backend/app/sample_validation.py`](../backend/app/sample_validation.py) |
| 2画面WebSocket | [`backend/app/pairing.py`](../backend/app/pairing.py) |
| XSS回帰 | [`game/src/ui/security.test.ts`](../game/src/ui/security.test.ts) |
| Firestore既定拒否 | [`firebase/firestore.rules`](../firebase/firestore.rules) |
| Functionと得点検証 | [`firebase/functions/src/index.ts`](../firebase/functions/src/index.ts)、[`firebase/functions/src/scoring.ts`](../firebase/functions/src/scoring.ts) |
| 導入手順 | [Firebaseランキングの安全な準備](firebase-ranking-setup.md) |

参考: [Firebase callable Functions](https://firebase.google.com/docs/functions/callable)、[App Check enforcement](https://firebase.google.com/docs/app-check/cloud-functions)、[Firestore Rules](https://firebase.google.com/docs/firestore/security/get-started)、[Rules unit tests](https://firebase.google.com/docs/rules/unit-tests)、[OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/XSS_Prevention_Cheat_Sheet.html)、[OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
