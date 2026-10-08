"""全站共用的 API 回應格式。

成功：{"success": true,  "data": ...,  "error": null}
失敗：{"success": false, "data": null, "error": {"code", "message", "details"}}
"""
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response


class EnvelopeRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = (renderer_context or {}).get("response")
        if response is not None and response.status_code == status.HTTP_204_NO_CONTENT:
            return b""
        if response is not None and response.exception:
            body = {"success": False, "data": None, "error": data}
        else:
            body = {"success": True, "data": data, "error": None}
        return super().render(body, accepted_media_type, renderer_context)


def exception_handler(exc, context):
    # 延後匯入：這個模組會在 rest_framework.views 初始化途中被設定檔載入
    from rest_framework.views import exception_handler as drf_exception_handler

    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # 非預期錯誤交給 Django 回 500，不外洩細節
    if isinstance(exc, ValidationError):
        code, message, details = "validation_error", "輸入資料有誤", response.data
    else:
        code = getattr(exc, "default_code", "error")
        if isinstance(exc, APIException) and not isinstance(exc.detail, (list, dict)):
            code = exc.detail.code or code
        message, details = str(getattr(exc, "detail", exc)), None
    response.data = {"code": code, "message": message, "details": details}
    return response


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"
    default_detail = "目前狀態無法執行此操作"


class Pagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            "count": self.page.paginator.count,
            "page": self.page.number,
            "pages": self.page.paginator.num_pages,
            "results": data,
        })
