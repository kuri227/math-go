# 数学でGO 効果音

このディレクトリ直下のWAVは、`scripts/audio/generate_game_sfx.mjs`で事前生成したプロジェクト専用の効果音です。ゲーム中に音を合成する処理はありません。WAV効果音には外部素材・生成AIモデル・第三者ライセンスを使用していません。

`bgm-menu.ogg`と`bgm-play.ogg`は、CC0 1.0で公開されたFupi「Empacotatron」のmenu版・loop版を本番向けに-18 LUFSへ正規化したものです。タイトル・難易度選択ではmenu版、プレイ中はloop版を約420msで切り替えます。原音、出典、比較記録は`assets/audio-candidates/`とルートの`THIRD_PARTY_NOTICES.md`を参照してください。

全8音を、展示会場で繰り返し聞いても驚きにくい柔らかなマレット音として統一しています。角の立つ矩形波・のこぎり波は使わず、正弦波と控えめな三角波、緩やかな減衰、用途ごとの低いピーク値で生成します。残り5秒の`tick.wav`と残り2秒の`tick-urgent.wav`も同じ音色に揃え、緊急音だけが急に鋭くならない設計です。
