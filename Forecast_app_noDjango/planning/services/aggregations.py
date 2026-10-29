"""Aggregate classified planning populations into KPI response totals."""

from datetime import date

from django.db.models import F, FloatField, Sum
from django.db.models.functions import Coalesce

from .classification import split_by_status
from .filters import filter_by_selected_records


def get_kpi_totals(
    backlog,
    billings,
    as_of_date=None,
):
    """
    Calculate KPI totals from the currently filtered data.

    Classification is dynamic based on the as_of_date:

    - Closed quarter + billing -> Billings
    - Current quarter -> Backlog
    - Future quarter -> Forecast

    Plan remains undefined until its source/formula is established.
    """

    as_of_date = as_of_date or date.today()

    classified = split_by_status(
        backlog,
        billings,
        as_of_date,
    )

    billing_rows = classified["billings"]
    backlog_rows = classified["backlog"]
    forecast_rows = classified["forecast"]

    # -------------------------
    # Billings
    # -------------------------

    billings_units = (
        billing_rows.aggregate(
            total=Sum("invoiced_qty")
        )["total"]
        or 0
    )

    billings_usd = (
        billing_rows.aggregate(
            total=Sum("total_usd_value")
        )["total"]
        or 0
    )

    # -------------------------
    # Backlog
    # -------------------------

    backlog_units = (
        backlog_rows.aggregate(
            total=Sum("buy_qty_due")
        )["total"]
        or 0
    )

    backlog_usd = backlog_rows.aggregate(
        total=Coalesce(
            Sum(
                F("sale_unit_price")
                * F("buy_qty_due"),
                output_field=FloatField(),
            ),
            0.0,
        )
    )["total"]

    # -------------------------
    # Forecast
    # -------------------------

    forecast_units = (
        forecast_rows.aggregate(
            total=Sum("buy_qty_due")
        )["total"]
        or 0
    )

    forecast_usd = forecast_rows.aggregate(
        total=Coalesce(
            Sum(
                F("sale_unit_price")
                * F("buy_qty_due"),
                output_field=FloatField(),
            ),
            0.0,
        )
    )["total"]

    return {
        "plan": {
            "units": None,
            "usd": None,
        },

        "billings": {
            "units": billings_units,
            "usd": billings_usd,
        },

        "backlog": {
            "units": backlog_units,
            "usd": backlog_usd,
        },

        "forecast": {
            "units": forecast_units,
            "usd": forecast_usd,
        },
    }


def get_selected_kpi_totals(
    backlog,
    billings,
    record_keys,
    as_of_date=None,
):
    """Calculate the standard KPIs for selected Backlog lineage keys only."""

    backlog, billings = filter_by_selected_records(
        backlog,
        billings,
        record_keys,
    )

    return get_kpi_totals(
        backlog,
        billings,
        as_of_date=as_of_date,
    )


def get_main_row_kpi_totals(rows):
    """Sum values already classified while constructing Main Page rows.

    Reusing row totals keeps the unselected KPI response aligned with the
    exact grouped rows returned to the browser and avoids repeating the
    classification aggregates.
    """

    return {
        "plan": {
            "units": None,
            "usd": None,
        },
        "billings": {
            "units": sum(row["billings_units"] for row in rows),
            "usd": sum(row["billings_usd"] for row in rows),
        },
        "backlog": {
            "units": sum(row["backlog_units"] for row in rows),
            "usd": sum(row["backlog_usd"] for row in rows),
        },
        "forecast": {
            "units": sum(row["forecast_units"] for row in rows),
            "usd": sum(row["forecast_usd"] for row in rows),
        },
    }
