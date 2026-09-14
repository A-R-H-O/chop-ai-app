"""The transformers-version boundary in tag.py.

These do not load CLAP. They pin the two API shapes the real call has to
survive, because transformers 5 changed both and we only found out by
running it.
"""

from worker.pipeline import tag


class Pooled:
    """What transformers 5 returns from get_*_features."""

    def __init__(self, pooler_output):
        self.pooler_output = pooler_output


def test_unwraps_a_model_output():
    assert tag._embedding(Pooled("the tensor")) == "the tensor"


def test_passes_a_bare_tensor_through():
    # transformers 4 returned the tensor itself. Both have to work,
    # because the Modal image resolves its own version.
    assert tag._embedding("the tensor") == "the tensor"


def test_normalises_to_unit_length():
    import torch

    vectors = torch.tensor([[3.0, 4.0], [0.0, 2.0]])
    lengths = tag._unit(vectors).norm(dim=-1)

    assert torch.allclose(lengths, torch.ones(2))


def test_unit_vectors_make_the_dot_product_a_cosine():
    import torch

    # Two vectors 90 degrees apart score 0, identical ones score 1. This
    # is the property the tag scores are read as.
    a = tag._unit(torch.tensor([[2.0, 0.0]]))
    b = tag._unit(torch.tensor([[0.0, 5.0]]))

    assert torch.allclose(a @ a.T, torch.tensor([[1.0]]))
    assert torch.allclose(a @ b.T, torch.tensor([[0.0]]), atol=1e-6)


def test_vocabulary_is_opposing_pairs():
    # The scores are only meaningful relative to each other, so a word
    # without an opposite in the list cannot be interpreted.
    for word, opposite in [
        ("bright", "dark"),
        ("clean", "distorted"),
        ("sparse", "dense"),
        ("vintage", "modern"),
        ("urgent", "relaxed"),
    ]:
        assert word in tag.CLAP_TAGS
        assert opposite in tag.CLAP_TAGS


def test_vocabulary_has_no_duplicates():
    assert len(tag.CLAP_TAGS) == len(set(tag.CLAP_TAGS))
