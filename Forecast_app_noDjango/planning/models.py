"""Read-only source models and the writable manual planning model.

Backlog, BillingsOriginal, and BusinessOpportunity mirror externally managed
tables. ForecastPlanning is the separate store for manual month-by-month input;
Forecast saves must not mutate either external commercial-data source.
"""

# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class Backlog(models.Model):
    """Externally sourced order lines keyed by their lineage record key."""

    order_no = models.CharField(max_length=50, blank=True, null=True)
    line_no = models.CharField(max_length=10, blank=True, null=True)
    rel_no = models.CharField(max_length=10, blank=True, null=True)
    line_item_no = models.CharField(max_length=10, blank=True, null=True)
    contract = models.CharField(max_length=10, blank=True, null=True)
    customer_no = models.CharField(max_length=50, blank=True, null=True)
    customer_name = models.CharField(max_length=250, blank=True, null=True)
    customer_po_no = models.CharField(max_length=250, blank=True, null=True)
    invoice_country = models.CharField(max_length=10, blank=True, null=True)
    currency_code = models.CharField(max_length=10, blank=True, null=True)
    ship_country = models.CharField(max_length=10, blank=True, null=True)
    ship_addr_no = models.CharField(max_length=250, blank=True, null=True)
    wanted_delivery_date = models.DateField(blank=True, null=True)
    planned_delivery_date = models.DateField(blank=True, null=True)
    promised_delivery_date = models.DateField(blank=True, null=True)
    planned_month = models.DateField(blank=True, null=True)
    catalog_no = models.CharField(max_length=50, blank=True, null=True)
    buy_qty_due = models.IntegerField(blank=True, null=True)
    base_sale_unit_price = models.FloatField(blank=True, null=True)
    line_delivery_type = models.CharField(max_length=50, blank=True, null=True)
    currency_rate = models.FloatField(blank=True, null=True)
    sale_unit_price = models.FloatField(blank=True, null=True)
    objstate = models.CharField(max_length=50, blank=True, null=True)
    application_code = models.CharField(max_length=250, blank=True, null=True)
    baked = models.CharField(max_length=10, blank=True, null=True)
    family_group = models.CharField(max_length=50, blank=True, null=True)
    oem = models.CharField(max_length=10, blank=True, null=True)
    project_code = models.CharField(max_length=50, blank=True, null=True)
    sales_group = models.CharField(max_length=50, blank=True, null=True)
    project_group = models.CharField(max_length=50, blank=True, null=True)
    function_category = models.CharField(max_length=50, blank=True, null=True)
    market_category = models.CharField(max_length=50, blank=True, null=True)
    num_reels = models.CharField(max_length=10, blank=True, null=True)
    tr_notes = models.CharField(max_length=500, blank=True, null=True)
    bake_notes = models.CharField(max_length=500, blank=True, null=True)
    end_customer_unit_price = models.FloatField(blank=True, null=True)
    cf_end_customer = models.CharField(max_length=250, blank=True, null=True)
    cost = models.FloatField(blank=True, null=True)
    curr_rate = models.FloatField(blank=True, null=True)
    real_value = models.FloatField(blank=True, null=True)
    cml_company = models.CharField(max_length=10, blank=True, null=True)
    date_entered = models.DateTimeField(blank=True, null=True)
    record_key = models.CharField(unique=True, max_length=64, primary_key=True)

    class Meta:
        managed = False
        db_table = 'backlog'


class BillingsOriginal(models.Model):
    """Externally sourced invoice lines linked to Backlog by record_key."""

    billing_id = models.BigAutoField(primary_key=True)
    company = models.CharField(max_length=50, blank=True, null=True)
    contract = models.CharField(max_length=50, blank=True, null=True)
    customer_id = models.CharField(max_length=50, blank=True, null=True)
    customer_name = models.CharField(max_length=250, blank=True, null=True)
    invoice_type = models.CharField(max_length=50, blank=True, null=True)
    invoice_id = models.CharField(max_length=100, blank=True, null=True)
    item_id = models.CharField(max_length=100, blank=True, null=True)
    invoice_no = models.CharField(max_length=100, blank=True, null=True)
    invoice_date = models.DateField(blank=True, null=True)
    currency = models.CharField(max_length=10, blank=True, null=True)
    order_no = models.CharField(max_length=100, blank=True, null=True)
    line_no = models.CharField(max_length=50, blank=True, null=True)
    release_no = models.CharField(max_length=50, blank=True, null=True)
    line_item_no = models.CharField(max_length=50, blank=True, null=True)
    catalog_no = models.CharField(max_length=100, blank=True, null=True)
    description = models.CharField(max_length=500, blank=True, null=True)
    customer_po_no = models.CharField(max_length=150, blank=True, null=True)
    rma_no = models.CharField(max_length=100, blank=True, null=True)
    rma_line_no = models.CharField(max_length=50, blank=True, null=True)
    delivery_customer = models.CharField(max_length=100, blank=True, null=True)
    delivery_address_id = models.CharField(max_length=100, blank=True, null=True)
    customer_country = models.CharField(max_length=100, blank=True, null=True)
    end_customer = models.CharField(max_length=500, blank=True, null=True)
    invoiced_qty = models.FloatField(blank=True, null=True)
    unit_price = models.FloatField(blank=True, null=True)
    end_customer_unit_price = models.FloatField(blank=True, null=True)
    currency_rate = models.FloatField(blank=True, null=True)
    currency_value = models.FloatField(blank=True, null=True)
    base_value = models.FloatField(blank=True, null=True)
    usd_unit_price = models.FloatField(blank=True, null=True)
    total_usd_value = models.FloatField(blank=True, null=True)
    end_customer_total = models.FloatField(blank=True, null=True)
    delivery_type = models.CharField(max_length=100, blank=True, null=True)
    invoice_address_id = models.CharField(max_length=100, blank=True, null=True)
    shipment_id = models.CharField(max_length=100, blank=True, null=True)
    sales_region_code = models.CharField(max_length=100, blank=True, null=True)
    sales_country = models.CharField(max_length=100, blank=True, null=True)
    delivery_country_code = models.CharField(max_length=50, blank=True, null=True)
    delivery_country = models.CharField(max_length=100, blank=True, null=True)
    cost = models.FloatField(blank=True, null=True)
    total_cost = models.FloatField(blank=True, null=True)
    sales_group = models.CharField(max_length=100, blank=True, null=True)
    ic_category = models.CharField(max_length=100, blank=True, null=True)
    market_category = models.CharField(max_length=100, blank=True, null=True)
    product_group = models.CharField(max_length=100, blank=True, null=True)
    function_category = models.CharField(max_length=100, blank=True, null=True)
    packaging = models.CharField(max_length=100, blank=True, null=True)
    application = models.CharField(max_length=250, blank=True, null=True)
    baked = models.CharField(max_length=100, blank=True, null=True)
    family_group = models.CharField(max_length=100, blank=True, null=True)
    date_entered = models.DateTimeField(blank=True, null=True)
    wanted_delivery_date = models.DateField(blank=True, null=True)
    planned_delivery_date = models.DateField(blank=True, null=True)
    promised_delivery_date = models.DateField(blank=True, null=True)
    original_order_price = models.FloatField(blank=True, null=True)
    cml_company = models.CharField(max_length=100, blank=True, null=True)
    record_key = models.CharField(max_length=64)

    class Meta:
        managed = False
        db_table = 'billings_original'

class BusinessOpportunity(models.Model):
    """Order enrichment used for Region and Business Opportunity values.

    Services match trimmed ``order_no`` values only; ``site`` and contract are
    deliberately not part of the enrichment relationship. ``line_region`` is
    exposed as Region and ``opportunity_type`` as Business Opportunity.
    """

    s_id = models.BigAutoField( primary_key=True )
    order_no = models.CharField( max_length=20, blank=True, null=True, )
    application = models.CharField( max_length=100, blank=True, null=True, ) 
    line_region = models.CharField( max_length=50, blank=True, null=True, ) 
    opportunity_type = models.CharField( max_length=100, blank=True, null=True, ) 
    date_entered = models.DateTimeField( blank=True, null=True, ) 
    rel_no = models.IntegerField( blank=True, null=True, ) 
    site = models.CharField( max_length=10, blank=True, null=True, )

    class Meta:
        managed = False
        db_table = "business_opportunities"


class ForecastPlanning(models.Model):
    """Manual Forecast values stored by row identity and calendar month.

    The End Customer component keeps Main Page rows with the same Product and
    IFS Customer distinguishable without coupling a forecast to Backlog rows.
    """

    s_id = models.BigAutoField( primary_key=True ) 
    product_id = models.CharField( max_length=50 ) 
    customer_id = models.CharField( max_length=50 ) 
    end_customer_id = models.CharField( max_length=100, default="", ) 
    forecast_month = models.DateField() 
    units = models.IntegerField( default=0 ) 
    asp = models.DecimalField( max_digits=18, decimal_places=4, default=0, ) 
    created_at = models.DateTimeField() 
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "forecast_planning"
