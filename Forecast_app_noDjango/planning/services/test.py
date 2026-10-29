from datetime import date

from django.db.models import Subquery, Sum

from planning.models import Backlog, BillingsOriginal
from planning.services.classification import split_by_status

backlog = Backlog.objects.filter(
    planned_delivery_date__gte=date(2024, 4, 1),
    planned_delivery_date__lt=date(2026, 4, 1),
)

record_keys = backlog.values(
    "record_key"
)

billings = BillingsOriginal.objects.filter(
    record_key__in=Subquery(record_keys)
)

dates = [
    date(2024, 4, 1),
    date(2024, 7, 1),
    date(2024, 10, 1),
    date(2025, 1, 1),

    date(2025, 4, 1),
    date(2025, 7, 1),
    date(2025, 10, 1),
    date(2026, 1, 1),
]

for as_of_date in dates:
    result = split_by_status(
        backlog,
        billings,
        as_of_date,
    )

    billing_count = (
        result["billings"]
        .values("record_key")
        .distinct()
        .count()
    )

    backlog_count = result["backlog"].count()
    forecast_count = result["forecast"].count()

    print()
    print("AS OF:", as_of_date)
    print("Billings:", billing_count)
    print("Backlog:", backlog_count)
    print("Forecast:", forecast_count)