# BGM試聴候補

比較用の原音です。この場所のファイルはゲームから直接読み込みません。Empacotatronの2本だけは正規化した派生物を本番BGMとして採用しています。すべてOpenGameArtでCC0 1.0と明示された音源で、展示・改変・Gitでの再配布にクレジット必須の条件はありません。出典と作者名は第三者ライセンス一覧へ残します。

| ファイル | 作者・原題 | 長さ／形式 | 想定する場面 | 確認した条件 |
|---|---|---:|---|---|
| `the-arplands.ogg` | LordZintick「The Arplands」 | 144秒・OGG・ステレオ | 回答中。長く展開する冒険的な候補 | [配布ページ](https://opengameart.org/content/the-arplands)でCC0、loopable、upbeatと明示 |
| `overworld-original.ogg` | Louswan「Overworld Theme」 | 33秒・OGG・ステレオ | 難易度選択または低難易度。明るい候補 | [配布ページ](https://opengameart.org/content/overworld-theme-0)でCC0、cheerful、loopableと明示 |
| `overworld-alternate.ogg` | Louswan「Overworld Theme」alternate | 41秒・OGG・ステレオ | 上記の比較案 | 同上 |
| `chiptune-chops-loop.wav` | Eldritch Grim「Chiptune Chops」loop | 14秒・WAV・モノラル | 回答中。短くゲーム感を強くする候補 | [配布ページ](https://opengameart.org/content/chiptune-chops)でCC0、loop同梱、帰属不要と明示 |
| `empacotatron-menu.ogg` | Fupi「Empacotatron」menu | 12秒・OGG・ステレオ | **採用**。難易度選択用の原音 | [配布ページ](https://opengameart.org/content/empacotatron)でCC0、energetic、arcade、menu variationと明示 |
| `empacotatron-loop.ogg` | Fupi「Empacotatron」loop | 80秒・OGG・ステレオ | **採用**。回答中用の原音 | 同上 |
| `sci-fi-puzzle-138bpm.ogg` | MintoDog「Sci-fi Puzzle In-Game 1」 | 139秒・OGG・ステレオ | 回答中。数学・パズル感と長い展開を両立する候補 | [配布ページ](https://opengameart.org/content/sci-fi-puzzle-in-game-1)でCC0、138 BPM、puzzle、loopableと明示 |
| `shine-blitz-140bpm.ogg` | zesona / Chris Murphy「Shine Blitz」 | 62秒・OGG・ステレオ | 回答中。明るさと疾走感を強める候補 | [配布ページ](https://opengameart.org/content/shine-blitz)でCC0、140 BPM、upbeat、happy、loopableと明示 |
| `upbeat-chiptune-theme.ogg` | nihilocrat「Upbeat Chiptune Theme」 | 57秒・OGG・ステレオ | 難易度選択。レトロゲーム感を強める候補 | [配布ページ](https://opengameart.org/content/upbeat-chiptune-theme)でCC0、menu music由来と明示 |
| `charge.ogg` | Centurion_of_war「Charge!」 | 32秒・OGG・ステレオ | 高連続正解・短いボーナス区間の比較候補 | [配布ページ](https://opengameart.org/content/charge)でCC0、upbeat、energetic、loopableと明示 |

CC0 1.0: <https://creativecommons.org/publicdomain/zero/1.0/>

## 試聴時の注意

- 元音源の音量差が大きいため、音量の大小ではなく曲調と反復の疲れにくさを比較します。
- `chiptune-chops-loop.wav`はピークが0 dBに達するため、採用時は少なくとも6 dB下げてOGGへ変換します。
- `charge.ogg`、`shine-blitz-140bpm.ogg`、`upbeat-chiptune-theme.ogg`もピークが0 dB付近です。候補間で音量を揃えずに優劣を決めません。
- 最終候補は同じラウドネスへ揃え、会場のスピーカーで10問通しプレイを行います。
- 連続正解の盛り上がりは、BGM自体を高速化せず、既存の正解音と追加レイヤーで表現します。

## 現時点の比較セット

1. バランス型：`overworld-original.ogg` → `the-arplands.ogg`
2. アーケード型：`empacotatron-menu.ogg` → `empacotatron-loop.ogg`
3. 数学パズル型：`upbeat-chiptune-theme.ogg` → `sci-fi-puzzle-138bpm.ogg`
4. 高揚感型：選択画面は1または3、回答中は`shine-blitz-140bpm.ogg`

矢印の左が選択画面、右が回答中です。`charge.ogg`は常時BGMではなく、高連続正解時の短い盛り上がり候補として比較します。

採用したEmpacotatronの原音はこの場所に保持し、-18 LUFS・True Peak -2 dBへ正規化した本番用ファイルを`game/public/audio/bgm-*.ogg`に配置しています。
