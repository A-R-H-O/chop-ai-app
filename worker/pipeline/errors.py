"""What a failed job is allowed to say to the person who paid for it.

The `error` column on `jobs` is rendered verbatim on the failure screen,
so anything that lands in it is user-facing copy whether we meant it or
not. Without a boundary a storage 404 reaches the producer as
`{'statusCode': 404, 'error': not_found, ...}`.

So: raise ChopError when the message is written for them, let everything
else fall through to the generic line, and keep the real exception in the
logs where it is useful.
"""

from __future__ import annotations

GENERIC = "something went wrong on our side. your credits have been returned."


class ChopError(Exception):
    """A failure the producer can act on: too long, nothing to chop."""


def user_message(error: BaseException) -> str:
    """The line to store on the job."""
    if isinstance(error, ChopError):
        return str(error)
    return GENERIC
