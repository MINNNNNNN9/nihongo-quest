"""透過 Brevo 的 HTTPS API 寄信。

Render 等平台的免費方案會擋掉 SMTP 連線埠（25／465／587），所以不能用一般的 SMTP 後端。
設定環境變數 BREVO_API_KEY 後自動啟用；寄件者（DEFAULT_FROM_EMAIL）必須是在 Brevo 驗證過的信箱。
"""
import json
import logging
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)
API_URL = "https://api.brevo.com/v3/smtp/email"


class BrevoBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages:
            name, address = parseaddr(message.from_email or settings.DEFAULT_FROM_EMAIL)
            payload = {
                "sender": {"email": address, **({"name": name} if name else {})},
                "to": [{"email": recipient} for recipient in message.to],
                "subject": message.subject,
                "textContent": message.body,
            }
            request = urllib.request.Request(
                API_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"api-key": settings.BREVO_API_KEY, "content-type": "application/json", "accept": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=10):
                    sent += 1
            except Exception:
                # 不把收件者或金鑰寫進記錄
                logger.exception("Brevo 寄信失敗")
                if not self.fail_silently:
                    raise
        return sent
