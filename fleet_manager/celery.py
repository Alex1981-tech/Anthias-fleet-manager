import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fleet_manager.settings')

app = Celery('fleet_manager')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    # Check CCTV schedules every 30 seconds
    sender.add_periodic_task(
        30.0,
        check_cctv_schedules_task.s(),
        name='check-cctv-schedules',
    )


@app.task
def check_cctv_schedules_task():
    from deploy.tasks import check_cctv_schedules
    check_cctv_schedules()
