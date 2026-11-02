# 第三者ライセンス一覧

確認日：2026-11-02。この文書は、数学でGOが使用・取得・任意評価する外部要素と、配布時に残すべき表示をまとめたものです。数学でGO自身のライセンスを定める文書ではありません。

## 配布ZIPへ直接含まれるもの

| 外部要素 | 固定版 | ライセンス | 用途 | 対応 |
|---|---:|---|---|---|
| [KaTeX](https://github.com/KaTeX/KaTeX) | 0.19.0 | MIT | ブラウザー内の数式表示 | 著作権表示とMIT本文を `licenses/third-party/KaTeX-MIT.txt` に同梱 |
| [M PLUS 1](https://github.com/coz-m/MPLUS_FONTS)（Fontsource経由） | Fontsource 5.3.0 / font v16 | SIL OFL 1.1 | 画面の日本語フォント | 著作権表示とOFL本文を `licenses/third-party/M-PLUS-1-OFL-1.1.txt` に同梱。フォント単体販売や予約名を使った改変版配布は行わない |

`game/public/audio`のWAVはリポジトリ内の生成スクリプトで作成した独自素材で、外部音源・生成AIモデルは使用していません。

## セットアップ時に公式配布元から取得するもの

これらはGitや配布ZIPへ実体を入れず、利用者のPCへ各配布元から取得します。各パッケージに含まれるライセンス表示を削除しません。

| 外部要素 | 固定版 | ライセンス | 公式確認先 |
|---|---:|---|---|
| TexTeller Python package | 1.0.2 | Apache-2.0, Copyright OleehyO | [TexTeller repository](https://github.com/OleehyO/TexTeller) |
| TexTeller model | revision `7b96df0…` | Apache-2.0 | [OleehyO/TexTeller](https://huggingface.co/OleehyO/TexTeller) |
| PyTorch | 2.14.0 | Apache-2.0を中心とする複数の許容ライセンス | インストールされたwheel内の`LICENSE`とthird-party notices |
| torchvision | 0.29.0 | BSD系 | [pytorch/vision](https://github.com/pytorch/vision) |
| Transformers | 4.47.0 | Apache-2.0 | [huggingface/transformers](https://github.com/huggingface/transformers) |
| huggingface-hub | 0.36.2 | Apache-2.0 | [huggingface/huggingface_hub](https://github.com/huggingface/huggingface_hub) |

TexTellerなどApache-2.0対象物を再配布する場合は、Apache-2.0本文、著作権・帰属表示、変更したファイルの変更表示、元配布物にNOTICEがある場合はそのNOTICEを保持します。Apache-2.0本文はリポジトリルートの`LICENSE`に同梱しています。

## アプリと開発環境の依存

固定版は `requirements/festival.txt`、`requirements/test.txt`、`game/pnpm-lock.yaml` を正とします。

| 依存 | 確認したライセンス |
|---|---|
| FastAPI / Pydantic / tomli | MIT |
| Uvicorn / HTTPX | BSD-3-Clause |
| python-multipart / pytest-asyncio | Apache-2.0 |
| Pillow | MIT-CMU |
| pytest | MIT |
| TypeScript | Apache-2.0 |
| Vite / Vitestと主要なNode依存 | MITを中心に、Apache-2.0、BSD-3-Clause、ISCを含む |
| lightningcss | MPL-2.0 |

Pythonパッケージは各wheel、Nodeパッケージは各npm packageにライセンス文書を含みます。開発依存を再配布物へ直接コピーする場合は、コピー対象のライセンス文書も併せて再確認します。

2026-11-02の監査では、基本venvとTexTeller venvの全インストール済みdistributionを確認しました。metadataが空だったColorama、exceptiongroup、setuptools、colorful、ItsDangerous、Jinja2、NetworkX、py-spy、safetensors、smart-open、tokenizersは、公式PyPI JSONのlicense classifierでBSD、MIT、Apache-2.0のいずれかであることを補完確認しました。GPL／AGPLおよび非商用限定の依存は検出していません。

## 任意のモデル比較・公開評価

通常ゲームはTexTellerだけを使用します。以下は開発者が比較評価を明示的に実行した場合だけ取得します。

| 外部要素 | ライセンス | 公式確認先 |
|---|---|---|
| UniMERNet source | Apache-2.0 | [opendatalab/UniMERNet](https://github.com/opendatalab/UniMERNet) |
| UniMERNet tiny model | Apache-2.0 | [wanderkid/unimernet_tiny](https://huggingface.co/wanderkid/unimernet_tiny) |
| UniMER Dataset / UniMER-Test | Apache-2.0 | [wanderkid/UniMER_Dataset](https://huggingface.co/datasets/wanderkid/UniMER_Dataset) |

公開評価画像の実体はGitへ含めません。追跡しているmanifest、正解文字列、評価結果を別用途で再配布・改変する場合も、データセットのApache-2.0条件と論文の引用案内を確認します。

## 数学でGO自身のライセンス

数学でGOはApache License 2.0で公開します。Copyright 2026 kuri227。第三者は、ライセンス条件を守ることで商用利用、改変、再配布、特許利用ができます。配布時は`LICENSE`と`NOTICE`を保持し、変更したファイルには変更したことが分かる表示を残してください。外部要素にはこのプロジェクトのApache-2.0ではなく、それぞれ上記のライセンスが引き続き適用されます。
