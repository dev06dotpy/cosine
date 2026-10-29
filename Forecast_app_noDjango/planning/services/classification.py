"""Classify external commercial data for planning display.

The physical source table does not alone determine the displayed status.
Orders in a future fiscal quarter is Forecast, current-quarter Orders remain
Backlog, and only closed-quarter lineages with invoices become Billings.
"""

from django.db.models import Subquery

from ..date_utils import get_fiscal_quarter_start
from ..date_utils import get_next_fiscal_quarter_start


def get_backlog_only_queryset(backlog, billings, as_of_date=None):
    """Return unbilled Backlog rows dated before the next fiscal quarter.

    This narrower helper removes every lineage represented by the supplied
    Billings queryset. ``split_by_status`` is the full lifecycle classifier
    used where current-quarter billed lineages must remain Backlog.
    """

    billed_record_keys = billings.values(
        "record_key"
    ).distinct()

    next_quarter_start = get_next_fiscal_quarter_start(
        as_of_date
    )

    return (
        backlog
        .exclude(
            record_key__in=Subquery(billed_record_keys)
        )
        .filter(
            planned_delivery_date__lt=next_quarter_start
        )
    )


def split_by_status(
    backlog,
    billings,
    as_of_date,
):
    """Split source querysets into their planning display populations.

    Args:
        backlog: Already-filtered external order-line queryset.
        billings: Already-filtered external invoice-line queryset sharing
            Backlog ``record_key`` lineage.
        as_of_date: Effective date for fiscal-quarter and invoice cutoffs.

    Returns:
        dict: Querysets keyed by ``billings``, ``backlog``, and ``forecast``.

    Future-quarter Backlog is displayed as Forecast. Current-quarter Backlog
    stays Backlog even when a billing exists. In closed quarters, billed
    lineages are represented by Billings and unbilled Backlog remains Backlog.
    """

    current_quarter_start = get_fiscal_quarter_start(
        as_of_date
    )

    next_quarter_start = get_next_fiscal_quarter_start(
        as_of_date
    )

    # Billing transactions must have happened by the
    # simulated date.
    billings_as_of = billings.filter(
        invoice_date__lte=as_of_date
    )

    billed_keys = billings_as_of.values(
        "record_key"
    ).distinct()

    # -------------------------
    # FORECAST
    # -------------------------

    forecast = backlog.filter(
        planned_delivery_date__gte=next_quarter_start
    )

    # -------------------------
    # CURRENT QUARTER BACKLOG
    # -------------------------

    current_backlog = backlog.filter(
        planned_delivery_date__gte=current_quarter_start,
        planned_delivery_date__lt=next_quarter_start,
    )

    # Even if billing exists, these remain Backlog.

    # -------------------------
    # CLOSED QUARTERS
    # -------------------------

    historical = backlog.filter(
        planned_delivery_date__lt=current_quarter_start
    )

    historical_billed = historical.filter(
        record_key__in=Subquery(billed_keys)
    )

    historical_unbilled = historical.exclude(
        record_key__in=Subquery(billed_keys)
    )

    backlog_only = (
        current_backlog
        | historical_unbilled
    )

    # Only billing rows belonging to closed-quarter
    # Backlog lineages should be represented as Billings.
    closed_billed_keys = historical_billed.values(
        "record_key"
    )

    billings_only = billings_as_of.filter(
        record_key__in=Subquery(closed_billed_keys)
    )

    return {
        "billings": billings_only,
        "backlog": backlog_only,
        "forecast": forecast,
    }
