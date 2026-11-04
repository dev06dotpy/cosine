"""
Serializers for the planning API.

Serializers convert Django model instances into JSON-compatible data
and define which database fields are exposed through the API.
"""

from rest_framework import serializers
# from .models import BacklogApp, BillingsApp


# class BacklogAppSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = BacklogApp
#         fields = '__all__'


# class BillingsAppSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = BillingsApp
#         fields = '__all__'