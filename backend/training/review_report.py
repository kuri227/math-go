"""Offline, read-only comparison sheet; never approves or consumes training data."""
import base64
from html import escape
from pathlib import Path


def write_near_duplicate_report(registry, destination: Path) -> int:
    rows = registry.status()["samples"]
    by_id = {row["sample_id"]: row for row in rows}
    pairs = {tuple(sorted((row["sample_id"], other))) for row in rows for other in row["near_duplicates"]}
    def figure(sample_id):
        row = by_id[sample_id]
        image = (registry.root / "objects" / f"{row['hash']}.png").read_bytes()
        source = base64.b64encode(image).decode("ascii")
        caption = escape(f"{sample_id} / writer {row['writer']} / {row['split'] or '未承認'} / {'使用済み' if row['run_id'] else '未使用'}")
        return f'<figure><img alt="比較する手書き画像" src="data:image/png;base64,{source}"><figcaption>{caption}</figcaption><pre>{escape(row["label"])}</pre></figure>'
    content = ''.join('<section>' + ''.join(figure(item) for item in pair) + '</section>' for pair in sorted(pairs))
    document = '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>近似画像の確認</title><style>body{font-family:sans-serif;max-width:1000px;margin:auto;padding:24px}section{display:flex;flex-wrap:wrap;border-top:1px solid #888}figure{margin:20px;flex:1;min-width:240px}img{width:100%;height:160px;object-fit:contain}pre,figcaption{white-space:pre-wrap;overflow-wrap:anywhere}</style><main><h1>近似画像の確認</h1><p>自動承認は行いません。同じ筆跡のコピー・再撮影は承認せず、新しい独立した筆跡のみレビューしてください。類似度は完全な同一性を保証しません。このファイルには手書きデータが含まれるため公開しないでください。</p>' + (content or '<p>近似候補なし。</p>') + '</main></html>'
    with destination.open("x", encoding="utf-8") as handle:
        handle.write(document)
    return len(pairs)
