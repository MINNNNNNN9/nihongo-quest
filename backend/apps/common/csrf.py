"""CSRF 驗證失敗時的處理。

後台登入頁最常見的失敗原因是「頁面放太久」：開著登入頁的同時在別的分頁登入或登出，
安全驗證碼就會換新，舊頁面送出的表單因此被拒絕。與其顯示一頁看不懂的 403，
不如把人帶回同一頁（會拿到新的驗證碼）並說明原因。API 請求維持原本的 403。
"""
from django.contrib import messages
from django.shortcuts import redirect
from django.views.csrf import csrf_failure as default_csrf_failure


def csrf_failure(request, reason=""):
    if request.path.startswith("/admin/") and request.method == "POST":
        messages.warning(
            request,
            "這個頁面的安全驗證已經過期（通常是頁面開太久，或在別的分頁登入／登出過），請再送出一次。"
            "如果一直出現這則訊息，請確認瀏覽器沒有封鎖 Cookie，並且使用的是 https 網址。",
        )
        return redirect(request.get_full_path())
    return default_csrf_failure(request, reason=reason)
