import pytest
from backend.model_workers.settings import cpu_thread_count


@pytest.mark.parametrize("value,expected", [("", None), ("  ", None), ("1", 1), (" 6 ", 6), ("256", 256)])
def test_cpu_thread_configuration(value, expected):
    assert cpu_thread_count(value) == expected


@pytest.mark.parametrize("value", ["0", "-1", "257", "1.5", "auto", "nan", "²", "9" * 5000])
def test_invalid_cpu_thread_configuration_fails_before_model_loading(value):
    with pytest.raises(ValueError):
        cpu_thread_count(value)
