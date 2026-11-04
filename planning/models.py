# This is an auto-generated Django model module. 
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table 
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class Billings(models.Model):
    objkey = models.CharField(db_column='OBJKEY', max_length=50, primary_key=True)  # Field name made lowercase.
    company = models.CharField(db_column='Company', max_length=20)  # Field name made lowercase.
    product_id = models.CharField(db_column='Product_ID', max_length=2000, blank=True, null=True)  # Field name made lowercase.
    customer_id = models.CharField(db_column='Customer_ID', max_length=20)  # Field name made lowercase.
    customer_name = models.CharField(db_column='Customer_Name', max_length=4000, blank=True, null=True)  # Field name made lowercase.
    end_customer_id = models.CharField(max_length=4000, blank=True, null=True)
    end_customer_name = models.CharField(max_length=4000, blank=True, null=True)
    country = models.CharField(db_column='Country', max_length=4000, blank=True, null=True)  # Field name made lowercase.
    region = models.CharField(db_column='Region', max_length=4000, blank=True, null=True)  # Field name made lowercase.
    invoiced_unit = models.FloatField(db_column='Invoiced_Unit', blank=True, null=True)  # Field name made lowercase.
    unit_price = models.FloatField(db_column='Unit_Price', blank=True, null=True)  # Field name made lowercase.
    invoiced = models.FloatField(db_column='Invoiced')  # Field name made lowercase.
    currency = models.CharField(db_column='Currency', max_length=3, blank=True, null=True)  # Field name made lowercase.
    exchange_rate = models.FloatField(db_column='Exchange_Rate')  # Field name made lowercase.
    invoice_date = models.DateTimeField(db_column='INVOICE_DATE')  # Field name made lowercase.

    class Meta:
        managed = False  # Created from a view. Don't remove.
        db_table = 'billings'