from django.db import migrations
from django.db.models import Max


def fix_end_times(apps, schema_editor):
    """舊資料修正：中途離開的局原本把「下一次開局的時間」當成結束時間，學習時間因此被灌水。"""
    GameSession = apps.get_model("learning", "GameSession")
    QuestionAttempt = apps.get_model("learning", "QuestionAttempt")
    for session in GameSession.objects.filter(status="abandoned"):
        times = [session.started_at]
        for started_at, completed_at in session.records.values_list("started_at", "completed_at"):
            times += [started_at, completed_at]
        times.append(QuestionAttempt.objects.filter(record__session=session).aggregate(last=Max("created_at"))["last"])
        last_activity = max(t for t in times if t)
        if session.ended_at != last_activity:
            session.ended_at = last_activity
            session.save(update_fields=["ended_at"])


class Migration(migrations.Migration):
    dependencies = [("learning", "0002_reviewattempt")]

    operations = [migrations.RunPython(fix_end_times, migrations.RunPython.noop)]
