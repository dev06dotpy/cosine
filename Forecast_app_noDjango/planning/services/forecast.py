"""Build monthly Forecast data and persist manual planning values.

External Backlog and Billings remain read-only inputs. Their monthly values are
classified for display, while user-entered Forecast values are loaded from and
saved only to ForecastPlanning using Product, IFS Customer, End Customer, and
month identity.
"""

from datetime import date

from django.core.exceptions import ValidationError
from django.db.models import F, FloatField, Sum
from django.db.models.functions import ExtractMonth, ExtractYear
from django.utils import timezone

from ..date_utils import get_data_type, is_editable
from ..models import ForecastPlanning
from .classification import split_by_status


def get_fiscal_months(fiscal_year):
    """Return the twelve month starts in an April-to-March fiscal year."""

    return [
        date(fiscal_year, 4, 1),
        date(fiscal_year, 5, 1),
        date(fiscal_year, 6, 1),
        date(fiscal_year, 7, 1),
        date(fiscal_year, 8, 1),
        date(fiscal_year, 9, 1),
        date(fiscal_year, 10, 1),
        date(fiscal_year, 11, 1),
        date(fiscal_year, 12, 1),
        date(fiscal_year + 1, 1, 1),
        date(fiscal_year + 1, 2, 1),
        date(fiscal_year + 1, 3, 1),
    ]


def _get_monthly_source_totals(
    queryset,
    *,
    date_field,
    units_field,
    usd_expression,
):
    """Aggregate one classified source queryset by calendar year and month."""

    grouped_rows = (
        queryset
        .annotate(
            source_year=ExtractYear(date_field),
            source_month=ExtractMonth(date_field),
        )
        .values("source_year", "source_month")
        .annotate(
            units=Sum(units_field),
            usd_value=Sum(
                usd_expression,
                output_field=FloatField(),
            ),
        )
    )

    return {
        (row["source_year"], row["source_month"]): {
            "units": row["units"] or 0,
            "usd_value": row["usd_value"] or 0,
        }
        for row in grouped_rows
    }


def get_monthly_status_totals(
    backlog,
    billings,
    fiscal_year,
    as_of_date,
    *,
    product_id=None,
    customer_id=None,
    end_customer_id="",
):
    """
    Build Forecast-page monthly rows.

    ``split_by_status`` determines how external source rows are displayed:
    future-quarter Backlog is Forecast, current-quarter Backlog is Backlog,
    closed billed lineages are Billings, and closed unbilled lineages remain
    Backlog. Manual ForecastPlanning values remain stored independently and
    take precedence in Forecast-classified months; future Backlog provides the
    Forecast fallback when no manual value exists.

    A complete Product and IFS Customer identity is required to load or edit
    manual planning. End Customer is the hidden identity component that keeps
    otherwise identical Main Page groups distinct.
    """

    fy_start = date(
        fiscal_year,
        4,
        1,
    )

    fy_end = date(
        fiscal_year + 1,
        4,
        1,
    )

    forecast_rows = (
        ForecastPlanning.objects.none()
    )

    identity_available = bool(
        product_id
        and customer_id
    )

    if identity_available:
        forecast_rows = (
            ForecastPlanning.objects
            .filter(
                product_id=product_id,
                customer_id=customer_id,
                end_customer_id=
                    end_customer_id or "",
                forecast_month__gte=fy_start,
                forecast_month__lt=fy_end,
            )
        )

    forecasts_by_month = {
        row.forecast_month: row
        for row in forecast_rows
    }

    classified = split_by_status(
        backlog,
        billings,
        as_of_date,
    )

    billings_by_month = _get_monthly_source_totals(
        classified["billings"].filter(
            invoice_date__gte=fy_start,
            invoice_date__lt=fy_end,
        ),
        date_field="invoice_date",
        units_field="invoiced_qty",
        usd_expression="total_usd_value",
    )

    backlog_value = (
        F("buy_qty_due") * F("sale_unit_price")
    )

    backlog_by_month = _get_monthly_source_totals(
        classified["backlog"].filter(
            planned_delivery_date__gte=fy_start,
            planned_delivery_date__lt=fy_end,
        ),
        date_field="planned_delivery_date",
        units_field="buy_qty_due",
        usd_expression=backlog_value,
    )

    forecast_by_month = _get_monthly_source_totals(
        classified["forecast"].filter(
            planned_delivery_date__gte=fy_start,
            planned_delivery_date__lt=fy_end,
        ),
        date_field="planned_delivery_date",
        units_field="buy_qty_due",
        usd_expression=backlog_value,
    )

    results = []

    for month_start in get_fiscal_months(
        fiscal_year
    ):
        month_key = (month_start.year, month_start.month)
        month_billings = billings_by_month.get(month_key)
        month_backlog = backlog_by_month.get(month_key)
        month_forecast = forecast_by_month.get(month_key)
        manual_forecast = forecasts_by_month.get(month_start)

        if month_billings is not None:
            month_type = "billings"
            units = month_billings["units"]
            usd_value = month_billings["usd_value"]
            asp = float(usd_value) / float(units) if units else 0
            editable = False
        elif month_backlog is not None:
            month_type = "backlog"
            units = month_backlog["units"]
            usd_value = month_backlog["usd_value"]
            asp = float(usd_value) / float(units) if units else 0
            editable = False
        else:
            if manual_forecast:
                month_type = "forecast"
                units = manual_forecast.units
                asp = float(manual_forecast.asp)
                usd_value = float(units) * asp
            elif month_forecast is not None:
                month_type = "forecast"
                units = month_forecast["units"]
                usd_value = month_forecast["usd_value"]
                asp = float(usd_value) / float(units) if units else 0
            else:
                month_type = get_data_type(
                    month_start,
                    as_of_date,
                )
                units = 0
                asp = 0
                usd_value = 0

            editable = (
                month_type == "forecast"
                and identity_available
                and is_editable(
                    month_start,
                    as_of_date,
                )
            )

        results.append({ 
            "month": month_start.strftime( "%B" ), 
            "year": month_start.year, 
            "month_start": month_start, 
            "type": month_type, 
            "status_label": { "billings": "Billings", "backlog": "Backlog", "forecast": "Forecast", }[month_type], 
            "editable": editable, "units": units, "asp": asp, "usd_value": usd_value, 
            "forecast_id": ( manual_forecast.s_id if manual_forecast else None ),
            })

    return results


def save_forecast_month(
    *,
    product_id,
    customer_id,
    end_customer_id,
    forecast_month,
    units,
    asp,
    as_of_date=None,
):
    """Insert or update one editable month in ForecastPlanning.

    The upsert is keyed by Product, IFS Customer, End Customer, and month and
    is independent of Backlog ``record_key``. No Backlog or Billings field is
    updated by this save path.
    """

    as_of_date = (
        as_of_date
        or date.today()
    )

    if not product_id:
        raise ValidationError(
            "Product ID is required."
        )

    if not customer_id:
        raise ValidationError(
            "Customer ID is required."
        )

    if not is_editable(
        forecast_month,
        as_of_date,
    ):
        raise ValidationError(
            "This forecast month is locked."
        )

    if units < 0:
        raise ValidationError(
            "Units cannot be negative."
        )

    if asp < 0:
        raise ValidationError(
            "ASP cannot be negative."
        )

    now = timezone.now()

    row, created = (
        ForecastPlanning.objects
        .update_or_create(
            product_id=
                product_id,

            customer_id=
                customer_id,

            end_customer_id=
                end_customer_id or "",

            forecast_month=
                forecast_month,

            create_defaults={
                "units": units,
                "asp": asp,
                "created_at": now,
                "updated_at": now,
            },

            defaults={
                "units":
                    units,

                "asp":
                    asp,

                "updated_at":
                    now,
            },
        )
    )

    return {
        "s_id":
            row.s_id,

        "created":
            created,

        "product_id":
            row.product_id,

        "customer_id":
            row.customer_id,

        "end_customer_id":
            row.end_customer_id,

        "forecast_month":
            row.forecast_month,

        "units":
            row.units,

        "asp":
            float(row.asp),

        "usd_value":
            float(row.units)
            * float(row.asp),
    }
