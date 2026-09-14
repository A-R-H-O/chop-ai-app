from worker.pipeline.errors import GENERIC, ChopError, user_message


def test_chop_error_reaches_the_producer():
    assert (
        user_message(ChopError("that track is longer than ten minutes"))
        == "that track is longer than ten minutes"
    )


def test_library_exceptions_do_not():
    # The exact shape that leaked onto the failure screen: supabase-py
    # raises with the storage API's json body stringified.
    leaked = Exception(
        "{'statusCode': 404, 'error': not_found, 'message': Object not found}"
    )
    assert user_message(leaked) == GENERIC


def test_value_error_is_not_special_cased():
    # librosa and soundfile raise ValueError for their own reasons, so it
    # cannot be the signal for "safe to show".
    assert user_message(ValueError("Input signal length=0 is too small")) == GENERIC


def test_generic_line_promises_the_refund():
    # The refund is the only thing the producer actually cares about when
    # we cannot tell them what broke.
    assert "credits have been returned" in GENERIC
