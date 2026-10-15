"""Synthetic tiny-model gradient/save/reload smoke test; never touches collected data."""
from pathlib import Path
import json
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    import torch
    from PIL import Image, ImageDraw
    from transformers import BartConfig, ViTConfig, VisionEncoderDecoderConfig, VisionEncoderDecoderModel
    from texteller.utils import transform
    from backend.training.texteller import prepare_head, single_pass

    torch.manual_seed(7); torch.set_num_threads(2)
    encoder = ViTConfig(image_size=448, patch_size=32, num_channels=1, hidden_size=16,
                        num_hidden_layers=1, num_attention_heads=2, intermediate_size=32)
    decoder = BartConfig(vocab_size=32, d_model=16, decoder_layers=1, decoder_attention_heads=2,
                         decoder_ffn_dim=32, encoder_layers=1, encoder_attention_heads=2,
                         encoder_ffn_dim=32, max_position_embeddings=32, is_decoder=True, add_cross_attention=True)
    config = VisionEncoderDecoderConfig.from_encoder_decoder_configs(encoder, decoder)
    config.decoder_start_token_id = 2; config.pad_token_id = 1
    model = VisionEncoderDecoderModel(config)
    params = prepare_head(model)
    before_head = params[0].detach().clone()
    before_encoder = next(model.encoder.parameters()).detach().clone()
    image = Image.new("RGB", (100, 100), "white"); ImageDraw.Draw(image).line((20, 20, 60, 70), fill="black", width=5)
    pixels = torch.stack(transform([image]))
    def batch(_):
        return {"pixel_values": pixels, "labels": torch.tensor([[0, 5, 2]])}
    steps = []
    metrics = single_pass(model, torch.optim.AdamW(params, lr=1e-3), [{"hash": "synthetic-one"}], [{"hash": "validation"}], batch, steps.append)
    assert len(steps) == 1 and metrics["optimizer_steps"] == 1
    assert not torch.equal(before_head, params[0])
    assert torch.equal(before_encoder, next(model.encoder.parameters()))
    with tempfile.TemporaryDirectory(prefix="math-go-tiny-training-") as directory:
        model.save_pretrained(directory, safe_serialization=True)
        restored = VisionEncoderDecoderModel.from_pretrained(directory)
        assert torch.equal(model.decoder.get_output_embeddings().weight, restored.decoder.get_output_embeddings().weight)
        assert restored.config.decoder.tie_word_embeddings is False
        # Exercise the ENTIRE production orchestration with a tiny local model and
        # synthetic candidates, while retaining the real TexTeller preprocessing.
        import texteller
        from tokenizers import Tokenizer, models, processors
        from transformers import PreTrainedTokenizerFast
        from backend.training.registry import Registry
        from backend.training.texteller import run
        raw = Tokenizer(models.WordLevel({"<s>": 0, "<pad>": 1, "</s>": 2, "<unk>": 3, "3": 4}, unk_token="<unk>"))
        raw.post_processor = processors.TemplateProcessing(single="<s> $A </s>", special_tokens=[("<s>", 0), ("</s>", 2)])
        tokenizer = PreTrainedTokenizerFast(tokenizer_object=raw, bos_token="<s>", eos_token="</s>", pad_token="<pad>", unk_token="<unk>")
        tokenizer.save_pretrained(directory)
        root = Path(directory); source = root / "source"
        (source / "images").mkdir(parents=True); (source / "metadata").mkdir()
        def candidate(name, number, writer):
            ink = Image.new("RGB", (100, 100), "white")
            ImageDraw.Draw(ink).line((20, 20, 40 + number * 5, 70), fill="black", width=5)
            path = source / "images" / f"{name}.png"; ink.save(path)
            (source / "metadata" / f"{name}.json").write_text(json.dumps({"sample_id": name, "image_path": str(path), "ground_truth_latex": "3", "writer_id": writer, "consent": True, "human_verified": True}))
        candidate("training-one", 1, "writer-train"); candidate("validation", 2, "writer-validation")
        ledger = Registry(root / "training")
        original_model_loader, original_tokenizer_loader = texteller.load_model, texteller.load_tokenizer
        texteller.load_model = lambda model_dir, use_onnx: VisionEncoderDecoderModel.from_pretrained(model_dir)
        texteller.load_tokenizer = lambda tokenizer_dir: PreTrainedTokenizerFast.from_pretrained(tokenizer_dir)
        try:
            assert ledger.scan(source, root)["imported"] == 2
            ledger.review("training-one", "train", "smoke-reviewer", True)
            ledger.review("validation", "validation", "smoke-reviewer", True)
            first = run(ledger, root, "cpu", 1e-3)
            assert first["optimizer_steps"] == 1
            try:
                run(ledger, root, "cpu", 1e-3)
                raise AssertionError("Replayed consumed data")
            except ValueError as error:
                assert "No unused" in str(error)
            candidate("training-two", 3, "writer-train")
            assert ledger.scan(source, root)["imported"] == 1
            ledger.review("training-two", "train", "smoke-reviewer", True)
            second = run(ledger, root, "cpu", 1e-3)
            assert second["optimizer_steps"] == 1
            second_plan = json.loads((ledger.root / "runs" / second["run_id"] / "reservation.json").read_text())
            assert second_plan["config"]["base_model"] == str(ledger.root / "runs" / first["run_id"] / "model")
            assert ledger.db.execute("SELECT count(*) FROM uses").fetchone()[0] == 2
            ledger.audit()
        finally:
            texteller.load_model, texteller.load_tokenizer = original_model_loader, original_tokenizer_loader
            ledger.close()
    print(json.dumps({"synthetic_smoke": "passed", "real_texteller_preprocessing": True,
                      "encoder_unchanged": True, "head_updated_and_reloaded": True,
                      "full_pipeline_two_incremental_runs": True, "replay_refused": True, **metrics}))


if __name__ == "__main__":
    main()
