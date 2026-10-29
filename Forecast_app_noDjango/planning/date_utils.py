"""Fiscal-calendar classification and editability helpers.

The planning fiscal year runs from April through March. Display classification
uses fiscal quarters, while editability uses calendar months; those concepts
are intentionally calculated separately.
"""

from datetime import date


def get_fiscal_info(as_of_date: date):
    """
    Return fiscal-year information for a given date.

    The fiscal year begins on 1 April and ends on 31 March.

    Quarter mapping:
        Q1: April - June
        Q2: July - September
        Q3: October - December
        Q4: January - March

    For example:
        1 October 2025 -> FY2025, Q3
        1 January 2026 -> FY2025, Q4
        1 April 2026   -> FY2026, Q1

    Args:
        as_of_date (date):
            The date for which fiscal information should be calculated.

    Returns:
        dict:
            A dictionary containing:
            - as_of_date: The supplied date.
            - fiscal_year: The year in which the fiscal year began.
            - quarter: The fiscal quarter number (1-4).
            - current_month: The calendar month number (1-12).
    """

    month = as_of_date.month
    year = as_of_date.year

    # January-March belong to the fiscal year that started
    # in the previous calendar year.
    if month >= 4:
        fiscal_year = year
    else:
        fiscal_year = year - 1

    # Determine the fiscal quarter from the calendar month.
    if 4 <= month <= 6:
        quarter = 1
    elif 7 <= month <= 9:
        quarter = 2
    elif 10 <= month <= 12:
        quarter = 3
    else:
        quarter = 4

    return {
        "as_of_date": as_of_date,
        "fiscal_year": fiscal_year,
        "quarter": quarter,
        "current_month": month,
    }


def get_fiscal_quarter(target_date: date):
    """
    Return the fiscal year and fiscal quarter for a given date.

    This is a lightweight helper used when comparing the fiscal
    position of two dates.

    The fiscal year runs from April to March:
        Q1: April - June
        Q2: July - September
        Q3: October - December
        Q4: January - March

    Args:
        target_date (date):
            The date whose fiscal year and quarter should be determined.

    Returns:
        tuple[int, int]:
            A tuple containing:
            (fiscal_year, fiscal_quarter)

    Example:
        get_fiscal_quarter(date(2026, 1, 1))
        -> (2025, 4)
    """

    month = target_date.month
    year = target_date.year

    fiscal_year = year if month >= 4 else year - 1

    if 4 <= month <= 6:
        quarter = 1
    elif 7 <= month <= 9:
        quarter = 2
    elif 10 <= month <= 12:
        quarter = 3
    else:
        quarter = 4

    return fiscal_year, quarter


def get_data_type(
    target_date: date,
    as_of_date: date,
    has_billing: bool = False,
):
    """Return the date-driven display type for a target period.

    This helper supplies the fallback status for months without classified
    source rows: future fiscal quarters are Forecast, the current quarter is
    Backlog, and closed quarters use the Billings display state. Source-backed
    closed-quarter Backlog without Billings is preserved separately by
    ``services.classification.split_by_status``.
    """

    target_fy, target_quarter = get_fiscal_quarter(target_date)
    current_fy, current_quarter = get_fiscal_quarter(as_of_date)

    target_position = (target_fy, target_quarter)
    current_position = (current_fy, current_quarter)

    # Future quarters are forecast.
    if target_position > current_position:
        return "forecast"

    # Current quarter ALWAYS remains backlog.
    if target_position == current_position:
        return "backlog"

    # The quarter has closed.
    if has_billing:
        return "billings"

    # Closed with 0 billings.
    return "billings"


def is_editable(target_date: date, as_of_date: date):
    """
    Determine whether data for a target month can be edited.

    Editing is controlled by month rather than fiscal quarter.

    Rules:
        Months before the current month -> Locked
        Current month                   -> Editable
        Future months                   -> Editable

    This means a previous month within the current quarter can still
    be classified as backlog while being locked against further edits.

    For example, with an as-of date of 1 November 2025:
        October 2025  -> False
        November 2025 -> True
        December 2025 -> True
        January 2026  -> True

    Args:
        target_date (date):
            The month whose edit status should be checked.

        as_of_date (date):
            The application's effective current date.

    Returns:
        bool:
            True if the target month can be edited.
            False if the target month is locked.
    """

    # Comparing (year, month) tuples ensures the comparison also
    # works correctly across calendar-year boundaries.
    target_month = (target_date.year, target_date.month)
    current_month = (as_of_date.year, as_of_date.month)

    return target_month >= current_month


def get_month_status(
    target_date: date,
    as_of_date: date,
    has_billing: bool = False,
):
    """Return independent display-classification and editability decisions."""

    return {
        "type": get_data_type(
            target_date,
            as_of_date,
            has_billing,
        ),
        "editable": is_editable(
            target_date,
            as_of_date,
        ),
    }

def get_fiscal_quarter_start(target_date: date):
    """Return the first calendar day of ``target_date``'s fiscal quarter."""

    year = target_date.year
    month = target_date.month

    if 4 <= month <= 6:
        return date(year, 4, 1)

    if 7 <= month <= 9:
        return date(year, 7, 1)

    if 10 <= month <= 12:
        return date(year, 10, 1)

    return date(year, 1, 1)


def get_next_fiscal_quarter_start(as_of_date: date):
    """Return the first day of the fiscal quarter after ``as_of_date``."""

    year = as_of_date.year
    month = as_of_date.month

    if 1 <= month <= 3:
        return date(year, 4, 1)

    if 4 <= month <= 6:
        return date(year, 7, 1)

    if 7 <= month <= 9:
        return date(year, 10, 1)

    return date(year + 1, 1, 1)
