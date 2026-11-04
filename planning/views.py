"""HTTP orchestration for planning pages and JSON endpoints.

Views parse request values and assemble service responses. Filtering,
fiscal-quarter classification, row construction, and manual Forecast saves
remain owned by their respective service modules.
"""

from django.http import request
from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .services.filters import search_records
from .services.aggregations import (
    get_kpi_totals,
    get_main_row_kpi_totals,
    get_selected_kpi_totals,
)
from datetime import date
from django.db.models import Subquery
from .services.forecast import get_monthly_status_totals, save_forecast_month
from django.core.exceptions import ValidationError
from .models import BusinessOpportunity
from .services.main_page import get_main_page_rows, get_main_row_detail
from django.db.models.functions import Trim

def main_page(request):
    """Render the Main Page shell populated by ``main_summary`` in JavaScript."""

    return render(request, "main.html")

def forecast_page(request):
    """Render the Forecast shell populated by the Forecast API endpoints."""

    return render(request, "forecast.html")


def _get_business_filter_options(backlog):
    """Return enrichment options reachable from the filtered Backlog orders.

    Runtime trimming mirrors filtering and row enrichment because order numbers
    may contain source whitespace. Site and contract are intentionally not part
    of the BusinessOpportunity relationship.
    """

    order_numbers = (
        backlog
        .annotate(clean_order_no=Trim("order_no"))
        .exclude(clean_order_no="")
        .values("clean_order_no")
        .distinct()
    )

    option_rows = (
        BusinessOpportunity.objects
        .annotate(clean_order_no=Trim("order_no"))
        .filter(
            clean_order_no__in=Subquery(order_numbers)
        )
        .values_list(
            "line_region",
            "opportunity_type",
        )
        .distinct()
    )

    regions = set()
    opportunity_types = set()

    for region, opportunity_type in option_rows:
        if region:
            regions.add(region)
        if opportunity_type:
            opportunity_types.add(opportunity_type)

    return sorted(regions), sorted(opportunity_types)

@api_view(["GET"])
def kpi_totals(request):
    """Return classified KPI totals for the supplied planning filters."""

    backlog, billings = search_records(
        product_id=request.query_params.get("product_id"),
        customer_id=request.query_params.get("customer_id"),
        customer_name=request.query_params.get("customer_name"),
        business_opportunity=request.query_params.get( "business_opportunity" ),
        region=request.query_params.get("region"),
        country=request.query_params.get("country"),
        fiscal_year=request.query_params.get("fiscal_year"),
    )

    totals = get_kpi_totals( backlog, billings, )

    return Response(totals)

@api_view(["GET"])
def forecast_data(request):
    """Return monthly Forecast data, selected-row detail, and filter options.

    Backlog establishes the selected Product/Customer/End Customer row and its
    ``record_key`` lineage. The monthly service then combines classified
    external values with independent manual ForecastPlanning values.
    """

    fiscal_year = request.query_params.get(
        "fiscal_year"
    )

    if not fiscal_year:
        return Response(
            {
                "error":
                    "fiscal_year is required."
            },
            status=400,
        )

    try:
        fiscal_year = int(
            fiscal_year
        )

    except ValueError:
        return Response(
            {
                "error":
                    "Invalid fiscal_year."
            },
            status=400,
        )

    # -----------------------------------------
    # As-of date
    # -----------------------------------------

    as_of_value = (
        request.query_params.get(
            "as_of_date"
        )
    )

    try:
        as_of_date = (
            date.fromisoformat(
                as_of_value
            )
            if as_of_value
            else date.today()
        )

    except ValueError:
        return Response(
            {
                "error":
                    "Invalid as_of_date."
            },
            status=400,
        )

    product_id = (
        request.query_params.get(
            "product_id"
        )
    )

    customer_id = (
        request.query_params.get(
            "customer_id"
        )
    )

    customer_name = (
        request.query_params.get(
            "customer_name"
        )
    )

    country = (
        request.query_params.get(
            "country"
        )
    )

    # -----------------------------------------
    # Country options
    #
    # Deliberately exclude the current country
    # filter so dropdown options do not collapse.
    # -----------------------------------------

    option_backlog, _ = search_records(
        product_id=product_id,
        customer_id=customer_id,
        customer_name=customer_name,
        country=None,
    )

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

    option_backlog = (
        option_backlog.filter(
            planned_delivery_date__gte=
                fy_start,

            planned_delivery_date__lt=
                fy_end,
        )
    )

    country_options = sorted(
        set(
            option_backlog
            .exclude(
                invoice_country__isnull=True
            )
            .exclude(
                invoice_country=""
            )
            .values_list(
                "invoice_country",
                flat=True,
            )
            .distinct()
        )
    )

    region_options, opportunity_options = (
        _get_business_filter_options(option_backlog)
    )

    # -----------------------------------------
    # Actual Forecast selection
    # -----------------------------------------

    backlog, billings = search_records(
        product_id=request.query_params.get( "product_id" ), 
        customer_id=request.query_params.get( "customer_id" ), 
        customer_name=request.query_params.get( "customer_name" ), 
        country=request.query_params.get( "country" ), 
        region=request.query_params.get( "region" ), 
        business_opportunity= request.query_params.get( "business_opportunity" ), 
    )
    backlog = backlog.filter(
        planned_delivery_date__gte=
            fy_start,

        planned_delivery_date__lt=
            fy_end,
    )

    # Backlog remains the identity source.
    billings = billings.filter(
        record_key__in=Subquery(
            backlog.values(
                "record_key"
            )
        )
    )

    # -----------------------------------------
    # Resolve selected Main Page identity
    # -----------------------------------------

    main_rows = get_main_page_rows(
        backlog,
        billings,
        as_of_date=as_of_date,
    )

    selected_end_customer_id = (
        request.query_params.get(
            "end_customer_id"
        )
    )

    selected_row = None

    if selected_end_customer_id:
        selected_row = next(
            (
                row
                for row in main_rows
                if str(
                    row["end_customer_id"] or ""
                ).strip()
                == selected_end_customer_id.strip()
            ),
            None,
        )

    elif len(main_rows) == 1:
        selected_row = main_rows[0]


    # -----------------------------------------
    # Restrict to selected row lineage
    # -----------------------------------------

    months = []
    detail = None

    if selected_row:
        selected_record_keys = (
            selected_row["record_keys"]
        )

        backlog = backlog.filter(
            record_key__in=
                selected_record_keys
        )

        billings = billings.filter(
            record_key__in=
                selected_record_keys
        )


        # -----------------------------------------
        # Monthly Forecast table
        # -----------------------------------------

        months = get_monthly_status_totals(
            backlog,
            billings,
            fiscal_year=fiscal_year,
            as_of_date=as_of_date,

            product_id=(
                selected_row["product_id"]
                if selected_row
                else None
            ),

            customer_id=(
                selected_row["customer_id"]
                if selected_row
                else None
            ),

            end_customer_id=(
                selected_row["end_customer_id"]
                if selected_row
                else ""
            ),
        )


        # -----------------------------------------
        # Selected detail panel
        # -----------------------------------------

        detail = (
            get_main_row_detail(
                selected_row
            )
            if selected_row
            else None
        )

    return Response({
        "fiscal_year": fiscal_year,
        "as_of_date": as_of_date,
        "months": months,
        "detail": detail,
        "filter_options": {
            "countries": country_options,
            "regions": region_options,
            "opportunity_types": opportunity_options,
        },
    })

@api_view(["PATCH"])
def forecast_update(request):
    """Validate and persist one manual ForecastPlanning month from a PATCH."""

    product_id = request.data.get(
        "product_id"
    )

    customer_id = request.data.get(
        "customer_id"
    )

    end_customer_id = (
        request.data.get(
            "end_customer_id"
        )
        or ""
    )

    month_value = request.data.get(
        "forecast_month"
    )

    units = request.data.get(
        "units"
    )

    asp = request.data.get(
        "asp"
    )

    as_of_value = request.data.get(
        "as_of_date"
    )

    try:
        forecast_month = (
            date.fromisoformat(
                month_value
            )
        )

        units = int(units)
        asp = float(asp)

        as_of_date = (
            date.fromisoformat(
                as_of_value
            )
            if as_of_value
            else date.today()
        )

    except (
        TypeError,
        ValueError,
    ):
        return Response(
            {
                "error":
                    "Invalid forecast values."
            },
            status=400,
        )

    try:
        result = save_forecast_month(
            product_id=product_id,
            customer_id=customer_id,
            end_customer_id=
                end_customer_id,
            forecast_month=
                forecast_month,
            units=units,
            asp=asp,
            as_of_date=as_of_date,
        )

    except ValidationError as exc:
        return Response(
            {
                "error":
                    exc.messages[0]
            },
            status=400,
        )

    return Response(result)

@api_view(["GET"])
def main_summary(request):
    """Return grouped Main Page rows, KPIs, and shared filter options."""

    fiscal_year = request.query_params.get("fiscal_year")

    try:
        fiscal_year = int(fiscal_year) if fiscal_year else None
    except ValueError:
        return Response(
            {"error": "Invalid fiscal_year."},
            status=400,
        )

    as_of_value = request.query_params.get("as_of_date")

    try:
        as_of_date = (
            date.fromisoformat(as_of_value)
            if as_of_value
            else date.today()
        )
    except ValueError:
        return Response(
            {"error": "Invalid as_of_date."},
            status=400,
        )
    
    option_backlog, _ = search_records(
        product_id=request.query_params.get(
            "product_id"
        ),
        customer_id=request.query_params.get(
            "customer_id"
        ),
        customer_name=request.query_params.get(
            "customer_name"
        ),
        fiscal_year=fiscal_year,

        # Deliberately don't filter by country.
        country=None,
    )

    region_options, opportunity_options = (
        _get_business_filter_options(option_backlog)
    )

    backlog_countries = (
        option_backlog
        .exclude(invoice_country__isnull=True)
        .exclude(invoice_country="")
        .values_list(   
            "invoice_country",
            flat=True,
        )
        .distinct()
    )

    country_options = sorted(
        set(backlog_countries)
    )

    backlog, billings = search_records(
        product_id=request.query_params.get("product_id"),
        customer_id=request.query_params.get("customer_id"),
        customer_name=request.query_params.get("customer_name"),
        country=request.query_params.get("country"),
        fiscal_year=fiscal_year,
        region=request.query_params.get( "region" ),
        business_opportunity= request.query_params.get( "business_opportunity" ),
    )

    rows = get_main_page_rows(
        backlog,
        billings,
        as_of_date=as_of_date,
    )

    selected_value = request.query_params.get("selected")

    if selected_value:
        record_keys = [
            key.strip()
            for key in selected_value.split(",")
            if key.strip()
        ]

        kpis = get_selected_kpi_totals(
            backlog,
            billings,
            record_keys,
            as_of_date=as_of_date,
        )
    else:
        kpis = get_main_row_kpi_totals(rows)

    return Response({
        "kpis": kpis,
        "rows": rows,
        "filter_options": {
            "countries": country_options,
            "regions": region_options,
            "opportunity_types": opportunity_options,
            },
    })
