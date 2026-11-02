# Git構成・ライセンス・ソース可読性監査（2026-11-02）

## 対象

- Git追跡247ファイルと43コミットの履歴
- Python、Node、フォント、認識モデル、任意評価モデル、公開評価データ
- Python／TypeScript／JavaScript／PowerShell／CSSの主要ソース
- Windows配布ZIP

## Git構成

- モデル、venv、Node依存、ビルド成果物、収集筆跡、学習データ、ログはGit対象外で、追跡済みignore対象や未追跡ソースはなかった。
- 秘密鍵・一般的なAPIキー形式は現在ツリーと全履歴で検出されなかった。
- ルート`HANDOFF.md`、旧エージェント引継ぎ、廃止済みアーキテクチャ資料はローカル継続用としてignoreし、Gitと配布ZIPから外した。
- 旧設計資料、ADR、固定評価ベースラインは、判断根拠と再現性が現行文書から参照されるため保持した。

## ライセンス監査

詳細は `THIRD_PARTY_NOTICES.md`。公式リポジトリ、Hugging Face API／モデルカード、インストール済み全Python distributionのmetadata、metadataが空だったpackageの公式PyPI JSON、npm registry、npm package内のライセンス本文を照合した。

- TexTeller source/model: Apache-2.0
- UniMERNet source/model: Apache-2.0
- UniMER Dataset / UniMER-Test: Apache-2.0
- KaTeX: MIT
- M PLUS 1: SIL OFL-1.1
- Python実行依存: MIT、BSD-3-Clause、Apache-2.0、MIT-CMU
- Node依存: MITを中心にApache-2.0、MPL-2.0、ISC、BSD-3-Clauseを含む
- GPL系・AGPL系・非商用限定は、現行環境の全Python distribution、Node lockfile、公式モデル／データでは確認されなかった。

直接配布するKaTeXとM PLUS 1のライセンス本文、およびApache-2.0参照本文を`licenses/third-party`へ追加し、配布ZIPの必須ファイルとして検査する。

数学でGO自身はMITまたはApache-2.0を選択できる。第一候補は、主要な認識資産と揃い、明示的特許許諾があるApache-2.0。権利者名、公開年、商用利用・改変・再配布を許可する意思を確認してからルート`LICENSE`を追加する。

## ソース可読性

- 最大ファイルは`App.ts` 560行、`main.py` 416行、`app.css` 323行。状態機械、表示計算、2画面通信、Canvas、問題処理は既に責務別ファイルへ分離されている。
- 大規模な再分割は行わず、`docs/source-code-guide.md`へ読む順番、ディレクトリ責務、目的別の変更箇所、検証方法を整理した。
- `App.ts`、`main.py`、スタッフ評価画面、CSSへ責務と処理区切りを追加した。機能、API、DOM、スタイル値は変更していない。
- 今後も`App.ts`にはゲーム規則を増やさず`Session`へ、`main.py`にはファイル処理を増やさず責務別モジュールへ置く。

## 検証

変更後はPython 1313件、TypeScript 617件、本番ビルド、現行19文書と全追跡54 Markdownのローカルリンク、文書・配布・PowerShell対象14件、`git diff --check`が成功した。Pythonの警告2件はFastAPI／Starlette TestClient依存の非推奨APIで、今回の変更による失敗ではない。

Windows配布ZIPも再生成し、第三者notice、Apache-2.0、KaTeX MIT、M PLUS 1 OFL、ソースコード案内、主要効果音を含むことを確認した。ローカルに残したHANDOFF、旧引継ぎ、廃止済みアーキテクチャ資料は含まれない。
