# Surface brief: ゲームプロトタイプ

- Mode: Experience / Operate
- Audience: 文化祭で初見利用するプレイヤー
- Job: コースを選び、問題を見て、手書きし、提出して正誤を確認し、結果まで完了する
- Primary action: 回答を提出
- Constraints: 入力欄と問題を最初の画面内に置く。モデル準備・認識・失敗状態を明示する。モデル誤認識を即座に失点へ変換しない。

## Direction contract

THESIS: 黒板や答案用紙の再現ではなく、問題が舞台の中央に現れ、手書きの一筆がそのままゲーム進行になる一画面体験にする。一般的な設定カードやダッシュボードの並びは使わない。

OWN-WORLD: 深い藍の舞台、明るい紙色の入力面、朱色の提出操作、青緑の準備完了状態で構成する。角は小さく、境界は明確にし、文字と数式が主役になる。

STORY: プレイヤーはタイトルで練習／チャレンジを選び、短いステージ導入からプレイへ入る。現在の問題、進行、スコア、残機、残り時間を一目で理解し、すぐ書き始める。提出後は短い正誤演出を受け、認識結果と正答を比較し、書き直すか次へ進む。最後に結果を見て、同じコースへの再挑戦またはコース選択へ戻れる。

FIRST VIEWPORT: プレイ前はタイトル、ゲーム説明、コース選択、モデル状態、開始操作を一画面に置く。プレイ中はPhaserの舞台が上半分で問題を大きく提示し、その直下に横長の手書きCanvasを置く。ヘッダーにスコア・連続・残機・残り時間・モデル状態を固定する。提出は最も強い操作とし、認識中はタイマーを止める。判定演出後、結果を入力欄の下から一度だけ展開する。

EXTENSION BOUNDARY: プレイ前後の要件は未確定である。タイトル／コース選択、`CourseConfig`、ステージ導入、終了結果を独立した境界として維持し、今後のオンボーディング、難易度、報酬、復習、ランキング要件をゲームループや認識APIから切り離して変更できるようにする。

FORM: ユーザーが指定したPhaser + TypeScript + Viteを採用し、コード主導で狭いプロトタイプを実装する。seed key: user-pinned-phaser-game-prototype。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
