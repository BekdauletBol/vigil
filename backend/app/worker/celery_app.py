"""Celery application. Run with: celery -A app.worker.celery_app worker -l info"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("vigil", broker=settings.redis_url, include=["app.worker.tasks"])
celery_app.conf.update(
    task_default_queue="scoring",
    task_acks_late=True,  # a crashed worker does not lose the transaction
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=8,
    task_ignore_result=True,
    broker_connection_retry_on_startup=True,
    timezone="Asia/Almaty",
    beat_schedule={
        "auto-close-stale-low-alerts": {
            "task": "vigil.close_stale_alerts",
            "schedule": 600.0,
        },
    },
)
