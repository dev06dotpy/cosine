"""Construct Main Page rows, lineage totals, and detail-panel payloads.

Backlog establishes row identity and connects Billings to each group by
``record_key``. BusinessOpportunity contributes Region and Opportunity Type by
trimmed ``order_no`` only, with all distinct non-empty values retained.
"""

from datetime import date
from django.db.models.functions import Trim
from .classification import split_by_status
from ..models import BusinessOpportunity


def _parse_end_customer(value):
    """
    Split the combined end-customer field.

    Expected format:
        "end_customer_id - end_customer_name"

    Returns:
        tuple[str, str]:
            (end_customer_id, end_customer_name)
    """

    if not value:
        return "", ""

    parts = value.split(" - ", 1)

    end_customer_id = parts[0].strip()

    end_customer_name = (
        parts[1].strip()
        if len(parts) > 1
        else ""
    )

    return end_customer_id, end_customer_name


def _empty_main_row(
    product_id,
    customer_id,
    customer_name,
    end_customer_id,
    end_customer_name,
):
    """Create an accumulator at Product + Customer + End Customer grain."""

    return {
        "product_id": product_id,
        "customer_id": customer_id,
        "customer_name": customer_name,

        "end_customer_id": end_customer_id,
        "end_customer_name": end_customer_name,

        "record_keys": set(),

        "billings_units": 0,
        "billings_usd": 0.0,

        "backlog_units": 0,
        "backlog_usd": 0.0,

        "forecast_units": 0,
        "forecast_usd": 0.0,

        "last_updated": None,

        "countries": set(),

        "order_numbers": set(),

        "regions": set(),

        "opportunity_types": set(),
    }


def _update_last_updated(main_row, date_entered):
    """
    Keep the latest date_entered found across Backlog/Billings.
    """

    if not date_entered:
        return

    if (
        main_row["last_updated"] is None
        or date_entered > main_row["last_updated"]
    ):
        main_row["last_updated"] = date_entered


def get_main_page_rows(
    backlog,
    billings,
    as_of_date=None,
):
    """
    Build annual main-page rows.

    Row grain:
        Product
        + Customer
        + End Customer ID

    Backlog is used as the identity source. Its record keys remain attached so
    selected-row KPI and Forecast requests can preserve exact source lineage.

    Region and Opportunity Type are enriched by trimmed order number. Site and
    contract are deliberately excluded from that match, and multiple values for
    an order are deduplicated without discarding meaningful alternatives.

    Billings:
        Units     = invoiced_qty
        USD Value = total_usd_value

    Backlog / Forecast:
        Units     = buy_qty_due
        USD Value = sale_unit_price * buy_qty_due
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

    rows = {}

    # Each source lineage maps back to one displayed row so classified
    # Billings/Backlog/Forecast values reach the same identity accumulator.
    lineage_groups = {}

    # -------------------------------------------------
    # Establish row identity from Backlog
    # -------------------------------------------------
    base_rows = backlog.values(
        "record_key",
        "order_no",
        "catalog_no",
        "customer_no",
        "customer_name",
        "cf_end_customer",
        "invoice_country",
        "date_entered",
    )

    order_numbers = (
        base_rows
        .annotate(
            clean_order_no=Trim(
                "order_no"
            )
        )
        .exclude(
            clean_order_no=""
        )
        .values_list(
            "clean_order_no",
            flat=True,
        )
        .distinct()
    )

    business_rows = (
        BusinessOpportunity.objects
        .annotate(
            clean_order_no=Trim(
                "order_no"
            )
        )
        .filter(
            clean_order_no__in=
                order_numbers
        )
        .values(
            "clean_order_no",
            "line_region",
            "opportunity_type",
        )
    )

    # One order can have multiple enrichment rows; retain distinct values from
    # every trimmed order-number match rather than selecting an arbitrary row.
    bo_by_order = {}

    for business_row in business_rows:
        order_no = (
            business_row[
                "clean_order_no"
            ]
            or ""
        ).strip()

        if order_no not in bo_by_order:
            bo_by_order[order_no] = {
                "regions": set(),
                "opportunity_types": set(),
            }

        region = str(business_row["line_region"] or "").strip()
        opportunity_type = str(
            business_row["opportunity_type"] or ""
        ).strip()

        if region:
            bo_by_order[
                order_no
            ]["regions"].add(region)

        if opportunity_type:
            bo_by_order[
                order_no
            ]["opportunity_types"].add(opportunity_type)

    for base_row in base_rows:
        end_customer_id, end_customer_name = _parse_end_customer(
            base_row["cf_end_customer"]
        )
        group = (
            base_row["catalog_no"] or "",
            base_row["customer_no"] or "",
            end_customer_id,
        )

        if group not in rows:
            rows[group] = _empty_main_row(
                group[0],
                group[1],
                base_row["customer_name"] or "",
                end_customer_id,
                end_customer_name,
            )

        main_row = rows[group]
        lineage_groups[base_row["record_key"]] = group
        main_row["record_keys"].add(base_row["record_key"])

        if base_row["invoice_country"]:
            main_row["countries"].add(base_row["invoice_country"].strip())

        order_no = str(base_row["order_no"] or "").strip()
        if order_no:
            main_row["order_numbers"].add(order_no)
            business_values = bo_by_order.get(order_no, {})
            main_row["regions"].update(
                business_values.get("regions", set())
            )
            main_row["opportunity_types"].update(
                business_values.get("opportunity_types", set())
            )

        _update_last_updated(main_row, base_row["date_entered"])

    # -------------------------------------------------
    # Billings
    # -------------------------------------------------

    for row in billing_rows.values(
        "record_key",
        "invoiced_qty",
        "total_usd_value",
        "date_entered",
    ):
        group = lineage_groups.get(
            row["record_key"]
        )

        if group is None:
            continue

        main_row = rows[group]

        main_row["billings_units"] += (
            row["invoiced_qty"] or 0
        )

        main_row["billings_usd"] += (
            row["total_usd_value"] or 0
        )

        _update_last_updated(
            main_row,
            row["date_entered"],
        )

    # -------------------------------------------------
    # Backlog
    # -------------------------------------------------

    for row in backlog_rows.values(
        "record_key",
        "buy_qty_due",
        "sale_unit_price",
        "date_entered",
    ):
        group = lineage_groups.get(
            row["record_key"]
        )

        if group is None:
            continue

        main_row = rows[group]

        units = row["buy_qty_due"] or 0
        asp = row["sale_unit_price"] or 0

        main_row["backlog_units"] += units

        main_row["backlog_usd"] += (
            units * asp
        )

        _update_last_updated(
            main_row,
            row["date_entered"],
        )

    # -------------------------------------------------
    # Forecast
    # -------------------------------------------------

    for row in forecast_rows.values(
        "record_key",
        "buy_qty_due",
        "sale_unit_price",
        "date_entered",
    ):
        group = lineage_groups.get(
            row["record_key"]
        )

        if group is None:
            continue

        main_row = rows[group]

        units = row["buy_qty_due"] or 0
        asp = row["sale_unit_price"] or 0

        main_row["forecast_units"] += units

        main_row["forecast_usd"] += (
            units * asp
        )

        _update_last_updated(
            main_row,
            row["date_entered"],
        )

    # -------------------------------------------------
    # Convert non-JSON-friendly sets
    # -------------------------------------------------

    results = []

    for row in rows.values():
        row["record_keys"] = sorted(
            row["record_keys"]
        )

        row["countries"] = sorted(
            row["countries"]
        )

        row["order_numbers"] = sorted(
            row["order_numbers"]
        )


        row["regions"] = sorted(
            row["regions"]
        )


        row["opportunity_types"] = sorted(
            row["opportunity_types"]
        )

        results.append(row)

    return results


def get_main_row_detail(main_row):
    """
    Convert a main-page row into the structure used by the
    selected-item / hover detail panel.
    """

    return {
        "product_id": main_row["product_id"],

        "ifs_customer": {
            "id": main_row["customer_id"],
            "name": main_row["customer_name"],
        },

        "ifs_end_customer": {
            "id": main_row["end_customer_id"],
            "name": main_row["end_customer_name"],
        },

        "plan": {
            "units": None,
            "usd": None,
        },

        "billings": {
            "units": main_row["billings_units"],
            "usd": main_row["billings_usd"],
        },

        "backlog": {
            "units": main_row["backlog_units"],
            "usd": main_row["backlog_usd"],
        },

        "forecast": {
            "units": main_row["forecast_units"],
            "usd": main_row["forecast_usd"],
        },

        "variance": {
            "units": None,
            "usd": None,
        },

        "last_updated": main_row["last_updated"],

        "countries": main_row["countries"],

        "region": ( 
            ", ".join( main_row["regions"] ) if main_row["regions"] 
            else None 
            ),
        "opportunity_type": ( 
            ", ".join( main_row[ "opportunity_types" ] ) if main_row[ "opportunity_types" ] 
            else None 
            ),
        "c_d": None,
        "notes": None,

        # Used for selection and selected KPI filtering.
        "record_keys": main_row["record_keys"],
    }
