import logging
import sys

from app.core.request_context import get_request_id


class _RequestIdFilter(logging.Filter):
    """Injects the current request's correlation ID (see app/core/request_context.py) into every
    log record so production logs can be grepped/joined by it. "-" outside a request (startup,
    background scripts) rather than an empty string, so the format string never prints a bare
    trailing space."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s [%(request_id)s]: %(message)s",
            "%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root.addHandler(handler)
    root.setLevel(level)
