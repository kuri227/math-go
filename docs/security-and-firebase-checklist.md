# セキュリティ監査とFirebase導入チェックリスト

最終更新: 2026-11-03  
対象: 現行の数学でGO、将来のランキング実装  
状態: **監査・設計のみ。ここに書かれた対策は、明記がない限り未実装です。**

## 1. 守る範囲とデータ境界

- 展示用PCは2〜3台、当日合計100プレイ以下を想定する。
- 各PCのゲーム、数式認識、問題管理、テストプレイ、問題報告、筆跡候補は原則localhostで動かす。
- **問題管理とテストプレイはこのPCだけで行う。Firebaseへ共有しない。**
- Firebaseへ送る候補は、本番プレイのランキングに必要な最小データだけとする。問題文、正答、認識LaTeX、手書き画像、筆跡、writer ID、問題報告、学習データを送らない。
- ランキング表示名を導入する場合は個人情報を入力しない案内を出し、文字数・文字種・制御文字を制限する。
- Firebase停止時もローカルゲームは継続させる。未送信スコアは端末内キューへ置き、問題データとは別にする。

## 2. 今回の結論

### 本番前に止める条件（P0）

- [ ] **Pillowを安全な版へ更新し、許可した画像デコーダーだけを開く。** 現在の実機環境はPillow 11.3.0で、`pip-audit`がメモリー破壊、過大メモリー消費、無限ループなどを含む既知問題を検出した。修正版には12.1.1〜12.3.0以上を要求する項目がある一方、`pyproject.toml`は`pillow>=10.4,<12`のため修正版へ上げられない。
- [ ] `Image.open()`へ`formats=("PNG", "JPEG", "WEBP")`相当の明示的な制限を渡し、検出後の形式確認だけに頼らない。現在は自動判別してから`opened.format`を確認するため、拡張子を偽装した不正形式が不要なデコーダーへ先に到達し得る。
- [ ] 上記を直すまで、信頼できない校内LANへ`-Lan`で公開しない。通常起動の`127.0.0.1`だけを使う。
- [ ] LAN利用が必要なら、認識、比較、モデル読込、評価データ保存を含む高負荷・書込みAPIを認証または端末許可で保護し、レート制限と同時実行上限を設ける。

### Firebase実装前に止める条件（P0）

- [ ] Firestoreをブラウザーから直接書き込ませず、スコア登録はApp Check検証済みHTTPS Functionを経由する。
- [ ] Function側で難易度、正解数、回答時間、連続正解、最終スコアを再検証し、クライアントが送った合計点をそのまま信用しない。
- [ ] Firestore Security Rulesは既定拒否から始め、ランキング読取とサーバー経由登録に必要な範囲だけ許可する。`allow read, write: if true`を本番で使わない。
- [ ] 端末IDとrun IDによる冪等性、1プレイ1登録、短時間の連投制限を入れる。
- [ ] App Checkは監視モードで正規端末を確認してから強制を有効化する。ローカル開発用debug tokenは秘密として扱い、Git・画面写真・ログへ載せない。

## 3. Firebaseパラメーターと秘密情報の運用

FirebaseのWeb API keyはFirebase公式上「プロジェクト識別子であり、認可用の秘密ではない」とされています。ただし数学でGOでは、より厳しい運用として**実際のFirebase設定値をGitへ入れません**。アクセス制御は値の秘匿ではなく、Security Rules、App Check、Functions、IAMで行います。

`VITE_*`の値はビルド時にブラウザー用JavaScriptへ埋め込まれるため、`.env.local`へ置いても利用者のブラウザーから確認できます。Git非掲載は誤commitや文書・検索結果への残留を防ぐ運用であり、秘密化や認可の代わりではありません。ブラウザーに渡してはいけない秘密は`VITE_*`へ入れず、FunctionsのSecret Manager側だけで扱います。

### Gitへ入れるもの（将来の実装時）

- [ ] `game/.env.example`を追跡し、次のようなキー名と明確なダミー値だけを置く。実在しそうな値を例示しない。

```dotenv
VITE_FIREBASE_API_KEY=REPLACE_WITH_LOCAL_VALUE
VITE_FIREBASE_AUTH_DOMAIN=REPLACE_WITH_LOCAL_VALUE
VITE_FIREBASE_PROJECT_ID=REPLACE_WITH_LOCAL_VALUE
VITE_FIREBASE_APP_ID=REPLACE_WITH_LOCAL_VALUE
VITE_FIREBASE_FUNCTIONS_REGION=REPLACE_WITH_LOCAL_VALUE
VITE_FIREBASE_APP_CHECK_SITE_KEY=REPLACE_WITH_LOCAL_VALUE
```

- [ ] Functionsにも設定例が必要なら、値なしの`.env.example`またはパラメーター名一覧だけを追跡する。
- [ ] Firestore Rules、Rulesテスト、Firebase Emulator設定はGitで管理する。

### Gitへ入れないもの

- [ ] 実値は口頭またはオフラインの安全な手段で受け取り、各PCの`game/.env.local`へだけ入力する。
- [ ] 実装より先に`.gitignore`へ`.env.local`、`.env.*.local`、`.firebase/`、`firebase-debug.log*`、サービスアカウントJSONのパターンを追加する。現在の`.gitignore`は`.env`だけで、`.env.local`を除外できていない。
- [ ] Admin SDKのサービスアカウント秘密鍵をブラウザー、ゲームPC、Gitへ置かない。Cloud Functionsの実行資格情報を使う。
- [ ] Functionsが本当に秘密を必要とする場合は、dotenvではなくGoogle Cloud Secret Managerと`firebase functions:secrets:set`を使う。値は手順書に記載しない。
- [ ] App Check debug token、管理者認証情報、Firebase CLIのログイン情報をGitへ置かない。
- [ ] 画面写真、障害報告、ログ、チャットへ設定値を貼らない。共有時はキー名だけ残して値を`REDACTED`へ置換する。

### 新しいPCでの設定手順（実装後）

- [ ] リポジトリをcloneし、`game/.env.example`を`game/.env.local`へコピーする。
- [ ] 管理者から口頭またはオフラインで受け取った値を、対応する行へローカルで入力する。
- [ ] `git status --short`で`.env.local`が表示されないことを確認する。
- [ ] ダミー値が残っている場合は起動を失敗させ、どのキー名が未設定かだけを表示する。実値はログへ出さない。
- [ ] Firebaseのテストプロジェクトで送信・取得・オフライン再送を確認してから本番プロジェクトへ切り替える。
- [ ] コミット前に秘密情報スキャンを実行する。誤って実値をcommitした場合は、ファイルを消すだけで済ませず、資格情報を失効・交換する。

参考: [Firebase API keyの扱い](https://firebase.google.com/docs/projects/api-keys)、[Functionsの環境変数とSecret Manager](https://firebase.google.com/docs/functions/config-env)、[Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)、[Web App Check](https://firebase.google.com/docs/app-check/web/recaptcha-provider)

## 4. 現行コードで確認できた防御

- [x] 動的な問題文、解説、認識結果、エラー表示の大半は`textContent`、`createTextNode`、`replaceChildren`で描画している。
- [x] KaTeX描画はゲーム側で`trust: false`を指定し、失敗時は`textContent`へ戻している。
- [x] `innerHTML`の使用は起動時の静的な`appMarkup(role)`に限られ、ユーザー入力を連結していない。
- [x] 問題管理APIと問題登録画面は、接続元とHostがloopbackであり、ブラウザーOriginが同一の場合だけ許可する。異なるOriginからの実機GETは403になった。
- [x] 問題管理画面は`X-Frame-Options: DENY`と`frame-ancestors 'none'`を返す。
- [x] 画像アップロードは10MiB、1600万画素、PNG/JPEG/WebPの上限を設け、保存名はサーバー生成IDを使う。
- [x] `/api/v1/test-samples`は筆跡JSONを2MB、LaTeXを4000文字に制限し、点座標の有限値を確認する。
- [x] 2画面WebSocketはloopback・同一Origin限定で、メッセージ上限、型、接続ID、有限数、筆跡点数を検証する。
- [x] 現在の追跡ファイル名から、`.env`、Firebase設定、サービスアカウント、PEM/KEYに該当する秘密ファイルは見つからなかった。
- [x] `pnpm audit --prod`は本番依存3件について既知脆弱性0件だった。
- [x] `pip check`は依存関係の破損を検出しなかった。

## 5. XSS監査

### 2026-11-03の実機確認

Computer Useで`/questions/editor`を開き、問題数式、指示、正答、解説へ次の文字列を入力しました。保存はしていません。

```text
<img src=x onerror=alert("xss")>
```

結果:

- [x] プレビューは`&lt;img ...&gt;`として表示され、文字列のままだった。
- [x] プレビュー内の`img`・`script`要素は0件だった。
- [x] DOM全体の`onerror`・`onload`・`onclick`属性は0件だった。
- [x] JavaScriptダイアログは発生しなかった。

これは確認した経路についての結果であり、将来のランキング名表示や新しい管理画面まで自動的に安全だという意味ではありません。

### 実装時の回帰チェック

- [ ] 問題文、指示、解説、正答、認識LaTeX、問題報告、ランキング表示名へ、HTML・SVG・閉じタグ・イベント属性の攻撃文字列を入れる。
- [ ] `innerHTML`へユーザー入力を渡さず、テキスト表示を既定にする。
- [ ] KaTeXで`\\href{javascript:...}`、`\\htmlClass`、`\\includegraphics`等を試し、`trust: false`で実行・外部取得されないことを自動テストする。
- [ ] 保存型XSSとして、保存後の再読込、ランキング一覧、管理画面、CSV/JSON再取込まで確認する。
- [ ] エラーメッセージにサーバーの絶対パス、スタックトレース、秘密値を含めない。
- [ ] CSPを追加してもKaTeX、フォント、音声、Workerが動く構成を作り、report-onlyで違反を確認してから強制する。

参考: [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet)

## 6. 未対策または追加確認が必要な項目

### P1: localhostサービスの境界

- [ ] `LocalAdminMiddleware`の保護対象を問題管理だけでなく、ローカル専用の書込み・高負荷APIへ広げる。現在の`/samples`、`/api/v1/test-samples`、モデルpreload、比較認識は保護対象外である。
- [ ] 悪意あるWebサイトからlocalhostへ送られるcross-origin POSTを拒否する。OriginがないCLIを許可する場合は、loopback、専用トークン、用途別APIを組み合わせる。
- [ ] `scripts/start_festival.ps1 -Lan`の用途を再検討する。ランキングは各PCからFirebaseへ外向きHTTPS送信するため、通常はゲームサーバーをLAN公開する必要がない。
- [ ] LANを使う場合はWindows Firewallで許可端末・ネットワークを限定し、校内Wi-Fi全体へ公開しない。

### P1: 入力上限と負荷制御

- [ ] `/samples`にも`/api/v1/test-samples`と同等の筆跡構造・2MB上限を適用する。現在は空でないlistの確認に留まり、大きなJSONを保存できる。
- [ ] `JudgementRequest`の`question_id`と`recognized_latex`へ長さ上限を付ける。
- [ ] `GameQuestionCreateRequest`のID、問題文、LaTeX、指示、解説、カテゴリ、正答候補数と各候補の長さへ上限を付ける。ローカル限定でも誤操作による巨大ファイルを防ぐ。
- [ ] JSON、multipart、WebSocketの総受信サイズをアプリ入口で制限する。
- [ ] 認識・比較・preloadへ端末別レート制限、同時実行数、キュー上限、タイムアウトを設ける。
- [ ] WebSocketの1MB上限を実測値に合わせて縮小し、接続数・送信頻度・アイドル時間を制限する。`ink-snapshot`以外の本文構造もサーバー側で型別に検証する。

参考: [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

### P1: HTTP防御

- [ ] 全HTML/APIへ適切な`Content-Security-Policy`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`等を追加する。現在は問題管理画面のframe制限以外、確認対象レスポンスに防御ヘッダーがない。
- [ ] `server: uvicorn`の製品情報露出を必要に応じて抑える。
- [ ] 将来インターネットへ出すFirebase通信はHTTPSのみとし、ローカルHTTPと混同しない。

### P1: 画像アップロード

- [ ] Pillow更新後に、不正PNG/JPEG/WebP、形式偽装、切断ファイル、巨大寸法、メタデータ、繰り返し送信のテストを行う。
- [ ] 画像はWebルート外へ保存し、保存前にデコード・RGB再エンコードする現行方針を維持する。
- [ ] 外部ウイルススキャンへ手書き画像を送らない。必要ならオフライン検査を選ぶ。

参考: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### P2: 依存関係と再現性

- [ ] Pillowの上限を見直し、修正版へ更新後、画像認識と保存の回帰テストを行う。
- [ ] 実機環境の`certifi 2026.7.22`を2026.10.18以上へ更新する。現行版には失効対象ルートCAに関する警告がある。
- [ ] ビルド専用`setuptools 58.1.0`を更新する。展示ランタイムの直接経路ではないが、古いPackageIndex関連の既知問題がある。
- [ ] `pytest 8.4.2`の警告はUNIX一時ディレクトリを使うローカル攻撃が主対象で、Windows展示ランタイムの直接経路ではない。テスト環境更新時に9.0.3以上を確認する。
- [ ] CIまたは本番前手順へ`pip-audit`と`pnpm audit --prod`を追加し、結果の日付・環境・例外理由を残す。
- [ ] `pip-audit`の「86件」はエイリアスや重複記録を含む4パッケージの合計であり、86個の独立した実用攻撃経路とは数えない。ただしPillowはユーザー入力画像を処理する直接依存なので最優先とする。

## 7. Firebaseランキングのセキュリティ受入条件

- [ ] Firestoreには`leaderboardEntries`等のランキング専用コレクションだけを用意し、問題・テスト・学習用コレクションを作らない。
- [ ] 送信項目をスキーマで固定し、余分なフィールドを拒否する。
- [ ] 表示名は例として1〜20文字、改行・制御文字なし、HTMLとして解釈しない。禁止語対応は運営方針を別途決める。
- [ ] スコアは整数範囲、難易度は列挙値、各内訳は問題数と制限時間から到達可能な範囲だけ許可する。
- [ ] Functionはサーバー時刻を保存し、クライアント時刻を順位の根拠にしない。
- [ ] Anonymous AuthのUID、端末ID、run IDを役割別に扱い、表示画面へ露出するIDは別のランダムIDにする。
- [ ] 管理操作はゲーム端末の匿名認証へ許可しない。管理者Authとcustom claimsを使い、全削除はバックアップと再確認を要求する。
- [ ] ログへ表示名全文、App Check token、Auth token、設定値を出さない。
- [ ] Emulator Suiteで、未認証、匿名端末、管理者、改ざんpayload、重複run、過大値、直接Firestore書込をテストする。
- [ ] 2〜3台で同時登録、100プレイ、回線断、再接続、重複再送、Firebase停止をリハーサルする。

## 8. 検証記録と限界

2026-11-03時点の確認結果:

| 検証 | 結果 |
|---|---|
| Computer Useによる問題登録プレビューXSS | 攻撃文字列はテキスト化。実行要素・イベント属性・dialogなし |
| 異なるOriginから問題管理画面へGET | 403 |
| 通常画面・問題APIの防御ヘッダー | `server: uvicorn`のみ。全体CSP等は未設定 |
| 問題管理画面の防御ヘッダー | `DENY`と`frame-ancestors 'none'`あり |
| Git追跡対象の秘密らしいファイル名 | 検出なし |
| `pnpm audit --prod` | 本番依存3件、既知脆弱性0 |
| `pip check` | 破損なし |
| `pip-audit` | 4パッケージに既知問題。Pillowは実行経路上のためP0 |
| 文書リンク検査 | 変更前の現行21文書は成功 |
| Vitest | 603件成功、5スイートはsandbox一時ファイルENOENTで読込失敗 |
| Pytest | この実行環境では出力前に停止状態となり、全体・絞込とも中断 |

VitestとPytestの未完了は「テスト失敗がない」証拠ではありません。修正実装時は通常のPowerShell環境で全テストを再実行し、sandbox固有かを切り分けます。また、今回の監査は侵入テストや未知の脆弱性を保証するものではありません。

監査内容を更新するときは、少なくとも次の現行ファイルを再確認します。

| 境界 | 根拠ファイル |
|---|---|
| localhost・Origin・管理画面ヘッダー | [`backend/app/local_admin.py`](../backend/app/local_admin.py) |
| HTTP APIと保護対象 | [`backend/app/main.py`](../backend/app/main.py) |
| 画像サイズ・形式・一時ファイル | [`backend/app/uploads.py`](../backend/app/uploads.py) |
| JSON入力スキーマ | [`backend/app/schemas.py`](../backend/app/schemas.py) |
| 2画面WebSocket検証 | [`backend/app/pairing.py`](../backend/app/pairing.py) |
| 動的テキスト・KaTeX・入力保存 | [`game/src/exhibition/App.ts`](../game/src/exhibition/App.ts)、[`game/src/exhibition/richText.ts`](../game/src/exhibition/richText.ts)、[`game/src/ui/renderMath.ts`](../game/src/ui/renderMath.ts) |
| Firebaseランキング方針 | [ランキングシステム技術選定](ranking-system-proposal.md) |

## 9. 実装順序

1. [ ] Pillowと画像デコーダー制限を修正し、不正画像テストを追加する。
2. [ ] localhost専用APIの境界、Origin検証、入力上限、負荷制御を整理する。
3. [ ] 全体HTTPヘッダーとXSS回帰テストを追加する。
4. [ ] Firebase用ignore規則とダミー設定ファイルを追加する。
5. [ ] Functions、Rules、App Check、Emulatorテストを実装する。
6. [ ] 2〜3台・100プレイの回線断込みリハーサルを行う。
7. [ ] 監査チェックを全て閉じた後に本番Firebaseプロジェクトへ切り替える。

