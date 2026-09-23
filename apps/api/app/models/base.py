from datetime import UTC, datetime

from sqlalchemy.orm import DeclarativeBase

# Row ids are Python-side uuid4() stored as MySQL CHAR(36), not BINARY(16) — trades a few
# bytes of index size for ids that are readable in logs and the MySQL CLI without a
# UUID_TO_BIN/BIN_TO_UUID round trip, which matters more at this project's scale.


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Naive UTC timestamp — MySQL DATETIME has no timezone, so tzinfo is stripped here
    rather than left for the driver to silently drop."""
    return datetime.now(UTC).replace(tzinfo=None)
