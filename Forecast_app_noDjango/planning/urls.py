"""App-level JSON API routes for planning and Forecast pages."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from planning.views import forecast_data, forecast_update, kpi_totals, main_summary


router = DefaultRouter()

urlpatterns = [
    path("", include(router.urls)),

    path("kpis/", kpi_totals, name="kpi-totals"),
    path("main-summary/", main_summary, name="main-summary"),

    path("forecast/", forecast_data, name="forecast-data"),
    path("forecast/month/", forecast_update, name="forecast-update"),
]
