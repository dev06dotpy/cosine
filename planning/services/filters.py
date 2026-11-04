"""Build filtered Backlog and Billings querysets for planning views.

Backlog is the lineage source for filters that Billings cannot answer directly.
Customer ID intentionally searches both IFS Customer and End Customer IDs.
Region and Business Opportunity are resolved through trimmed order numbers.
"""

from datetime import date

from django.db.models import Count, Q, Subquery
from django.db.models.functions import Trim

from ..models import Backlog, BillingsOriginal, BusinessOpportunity


FY21_START = date(2021, 4, 1)

ALLOWED_CONTRACTS = [
    "120-1",
    "130-1",
    "110=1",
    "160-1",
]

def get_base_querysets():
    """Return the app's contract- and history-bounded source querysets."""

    backlog = Backlog.objects.filter(
        contract__in=ALLOWED_CONTRACTS,
        planned_delivery_date__gte=FY21_START,
    )

    billings = BillingsOriginal.objects.filter(
        contract__in=ALLOWED_CONTRACTS,
        invoice_date__gte=FY21_START,
    )

    return backlog, billings


def get_backlog_queryset():
    return Backlog.objects.filter(
        planned_delivery_date__gte=FY21_START
    )


def get_billings_queryset():
    return BillingsOriginal.objects.filter(
        invoice_date__gte=FY21_START
    )


# Rule 1
def filter_by_product_id(backlog, billings, product_id):
    if not product_id:
        return backlog, billings

    product_id = product_id.strip()

    backlog = backlog.filter(
        catalog_no__icontains=product_id
    )

    billings = billings.filter(
        catalog_no__icontains=product_id
    )

    return backlog, billings


# Rule 2
def filter_by_customer_id(backlog, billings, customer_id):
    """Filter both IFS Customer ID and End Customer ID source fields.

    The UI intentionally exposes one Customer ID search rather than a separate
    user-facing End Customer filter.
    """

    if not customer_id:
        return backlog, billings

    customer_id = customer_id.strip()

    backlog = backlog.filter(
        Q(customer_no__icontains=customer_id)
        |
        Q(cf_end_customer__icontains=customer_id)
    )

    billings = billings.filter(
        Q(customer_id__icontains=customer_id)
        |
        Q(end_customer__icontains=customer_id)
    )

    return backlog, billings


# Rule 3
def filter_by_customer_name(backlog, billings, customer_name):
    if not customer_name:
        return backlog, billings

    customer_name = customer_name.strip()

    backlog = backlog.filter(
        Q(customer_name__icontains=customer_name)
        |
        Q(cf_end_customer__icontains=customer_name)
    )

    billings = billings.filter(
        Q(customer_name__icontains=customer_name)
        |
        Q(end_customer__icontains=customer_name)
    )

    return backlog, billings


#Rule 4
def filter_by_country(backlog, billings, country):
    if not country:
        return backlog, billings

    country = country.strip()

    backlog = backlog.filter(
        invoice_country__iexact=country
    )

    billings = billings.filter(
        delivery_country_code__iexact=country
    )

    return backlog, billings


# Rule 6
def filter_by_fiscal_year(backlog, billings, fiscal_year):
    if fiscal_year is None:
        return backlog, billings

    fiscal_year = int(fiscal_year)

    start_date = date(fiscal_year, 4, 1)
    end_date = date(fiscal_year + 1, 4, 1)

    backlog = backlog.filter(
        planned_delivery_date__gte=start_date,
        planned_delivery_date__lt=end_date,
    )

    billings = billings.filter(
        invoice_date__gte=start_date,
        invoice_date__lt=end_date,
    )

    return backlog, billings


def _filter_backlog_by_business_values(
    backlog,
    *,
    region=None,
    business_opportunity=None,
):
    """Restrict Backlog through BusinessOpportunity order enrichment.

    Both sides are trimmed at query time because source order numbers may
    contain whitespace. Matching deliberately uses ``order_no`` alone, not
    site or contract. When both filters are supplied, conditional counts allow
    Region and Opportunity Type to be satisfied by different enrichment rows
    for the same order while avoiding nested per-filter subqueries.
    """

    business_rows = BusinessOpportunity.objects.annotate(
        clean_order_no=Trim("order_no")
    )

    if region is not None and business_opportunity is not None:
        matching_orders = (
            business_rows
            .filter(
                Q(line_region__iexact=region)
                | Q(opportunity_type__iexact=business_opportunity)
            )
            .values("clean_order_no")
            .annotate(
                region_matches=Count(
                    "s_id",
                    filter=Q(line_region__iexact=region),
                ),
                opportunity_matches=Count(
                    "s_id",
                    filter=Q(
                        opportunity_type__iexact=business_opportunity
                    ),
                ),
            )
            .filter(
                region_matches__gt=0,
                opportunity_matches__gt=0,
            )
            .values("clean_order_no")
        )
    elif region is not None:
        matching_orders = (
            business_rows
            .filter(line_region__iexact=region)
            .values("clean_order_no")
            .distinct()
        )
    else:
        matching_orders = (
            business_rows
            .filter(
                opportunity_type__iexact=business_opportunity
            )
            .values("clean_order_no")
            .distinct()
        )

    return (
        backlog
        .annotate(clean_order_no=Trim("order_no"))
        .filter(
            clean_order_no__in=Subquery(matching_orders)
        )
    )

def reset_filters():
    return get_backlog_queryset(), get_billings_queryset()


def search_records(
    product_id=None,
    customer_id=None,
    customer_name=None,
    country=None,
    fiscal_year=None,
    region=None,
    business_opportunity=None,
):
    """Return Backlog and Billings querysets matching planning filters.

    Backlog-side filters are composed first. Filters derived from Backlog
    identity (Country, Region, or Business Opportunity) then restrict Billings
    once by the remaining ``record_key`` lineage. That restriction intentionally
    precedes fiscal-year filtering so Billings retains its independent invoice-
    date interpretation of the selected fiscal year.
    """

    backlog, billings = get_base_querysets()

    # Product
    if product_id:
        backlog = backlog.filter(
            catalog_no__icontains=product_id
        )

        billings = billings.filter(
            catalog_no__icontains=product_id
        )

    # Customer ID
    if customer_id:
        backlog, billings = filter_by_customer_id(
            backlog,
            billings,
            customer_id,
        )

    # Customer Name
    if customer_name:
        backlog = backlog.filter(
            Q(customer_name__icontains=customer_name)
            | Q(cf_end_customer__icontains=customer_name)
        )

        billings = billings.filter(
            Q(customer_name__icontains=customer_name)
            | Q(end_customer__icontains=customer_name)
        )

    restrict_billings_to_backlog = False

    # Country
    if country:
        backlog = backlog.filter(
            invoice_country=country
        )
        restrict_billings_to_backlog = True

    # Region / Business Opportunity
    if region or business_opportunity:
        backlog = _filter_backlog_by_business_values(
            backlog,
            region=region.strip() if region else None,
            business_opportunity=(
                business_opportunity.strip()
                if business_opportunity
                else None
            ),
        )
        restrict_billings_to_backlog = True

    # Apply Backlog lineage once after all lineage-based filters.
    # This remains before fiscal-year filtering to preserve the
    # existing independent Billings invoice-year behavior.
    if restrict_billings_to_backlog:
        billings = billings.filter(
            record_key__in=Subquery(
                backlog.values("record_key")
            )
        )

    # Fiscal Year
    if fiscal_year:
        backlog = backlog.filter(
            planned_delivery_date__gte=date(
                fiscal_year,
                4,
                1,
            ),
            planned_delivery_date__lt=date(
                fiscal_year + 1,
                4,
                1,
            ),
        )

        billings = billings.filter(
            invoice_date__gte=date(
                fiscal_year,
                4,
                1,
            ),
            invoice_date__lt=date(
                fiscal_year + 1,
                4,
                1,
            ),
        )

    return backlog, billings


def filter_by_selected_records(backlog, billings, record_keys):
    """Restrict both sources to the lineage keys behind selected Main rows."""

    if not record_keys:
        return backlog, billings

    record_keys = [
        key.strip()
        for key in record_keys
        if key and key.strip()
    ]

    return (
        backlog.filter(record_key__in=record_keys),
        billings.filter(record_key__in=record_keys),
    )

