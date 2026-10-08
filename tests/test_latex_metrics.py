from benchmark.latex_metrics import exact_match, normalize_latex, normalized_match
from benchmark.prepare_unimer import classify_latex


def test_exact_match_is_strict():
    assert exact_match(r"\frac{x}{2}", r"\frac{x}{2}")
    assert not exact_match(r"\dfrac{x}{2}", r"\frac{x}{2}")


def test_normalize_safe_formatting_variants():
    assert normalize_latex(r" \left( \dfrac{x}{2} \right) ") == r"(\frac{x}{2})"
    assert normalized_match(r"{ x ^ 2 }", r"x^2")
    assert normalized_match(r"\[b_{n+1}-b_n=-1\]", r"b _ { n + 1 } - b _ { n } = - 1")


def test_normalize_preserves_latex_control_word_boundaries():
    assert normalize_latex(r"\[\cos x\]") == r"\cos x"
    assert normalize_latex(r"\sin   x") == r"\sin x"
    assert normalized_match(r"\[\cos x\]", r"\cos x")


def test_normalization_does_not_claim_algebraic_equivalence():
    assert not normalized_match(r"x(x+1)", r"x^2+x")


def test_public_dataset_category_classification():
    assert classify_latex(r"\frac{x+1}{2}")[0] == "fraction"
    assert classify_latex(r"\int_0^1 x dx")[0] == "integral"
    assert classify_latex(r"x^2+1=0")[0] == "equation"
