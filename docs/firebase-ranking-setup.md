# Firebaseランキングの安全な準備

この手順はランキング機能の開発・検証用です。現在のゲームはFirebase未設定でも動作し、問題管理、テストプレイ、問題報告、筆跡、学習データをFirebaseへ送りません。

## 必要なもの

- Node.js 22（Cloud Functionsの指定ランタイム）
- Java 21以上（Firebase Emulator用。Java 8では起動できません）
- pnpm 11
- テスト用と本番用を分けたFirebaseプロジェクト

## Gitに入れない値

実際のFirebase設定値、App Check debug token、Firebase CLIのログイン情報、サービスアカウントJSONはGit、文書、画面写真、チャットへ載せません。Admin SDKの秘密鍵をゲームPCへ置く運用はしません。

1. `game/.env.example`を`game/.env.local`へコピーします。
2. 管理者から口頭またはオフラインで受け取った値を、対応する`REPLACE_WITH_LOCAL_VALUE`へ入力します。
3. `.firebaserc.example`を`.firebaserc`へコピーし、ローカルでプロジェクトIDを入力します。
4. `git status --short`に`.env.local`と`.firebaserc`が出ないことを確認します。

`VITE_*`はビルド後のブラウザーから確認できる公開設定です。Gitへ実値を入れない運用は誤掲載防止であり、認可の代わりではありません。認可はApp Check、Anonymous Auth、Callable Functions、IAMで行います。

## ローカル検証

PowerShellで次を実行します。

```powershell
pnpm --dir firebase/functions install
pnpm --dir firebase/functions run build
pnpm --dir firebase/functions test
pnpm --dir firebase/functions run test:rules
```

`pnpm test`は、余分なフィールド、重複問題、実現不可能な時間、制御文字を拒否し、サーバー側で得点を再計算することを確認します。`test:rules`はFirestoreへのブラウザーからの直接読取・書込が、認証の有無にかかわらず拒否されることをEmulatorで確認します。

## 実装済みの安全境界

- `firebase/firestore.rules`は直接アクセスをすべて拒否します。
- `submitScore`と`getLeaderboard`はApp CheckとFirebase Authを必須にします。
- 送信スキーマを固定し、10問、難易度、制限時間、ID、表示名を検証します。
- クライアントの合計点は受け取らず、Functionが得点を再計算します。
- UIDとrun IDで重複登録を防ぎ、UIDごとに短時間の連投を拒否します。
- ランキング応答は上位10件と表示に必要な項目だけです。

## 本番へ切り替える前に必要なこと

1. テストプロジェクトでAnonymous AuthとWeb App Checkを設定し、最初はApp Checkの監視結果を確認します。
2. Emulatorテスト、改ざんpayload、重複run、回線断と再送を確認します。
3. 2〜3台で合計100プレイ相当を行い、書込回数、読取回数、通信量、重複の有無を記録します。
4. Blazeプランの担当者と予算アラートを決めます。
5. 問題文、正答、認識結果、画像、筆跡、問題報告が送信payloadに入っていないことを開発者ツールで確認します。

本番値がない状態でデプロイしないでください。値を誤ってcommitした場合は、ファイルを削除するだけでなく該当資格情報を失効・交換します。
