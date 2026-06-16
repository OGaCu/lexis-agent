import logging
import os

import httpx
from apscheduler.schedulers.blocking import BlockingScheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

INVEST_SERVICE_URL = os.getenv("INVEST_SERVICE_URL", "http://invest-service:8002")
GENERATE_URL = f"{INVEST_SERVICE_URL}/briefings/generate"
LATEST_URL = f"{INVEST_SERVICE_URL}/briefings/latest"


def generate_briefing():
    log.info("Triggering briefing generation...")
    try:
        resp = httpx.post(GENERATE_URL, timeout=120.0)
        resp.raise_for_status()
        log.info("Briefing generated successfully.")
    except Exception as e:
        log.error(f"Failed to generate briefing: {e}")


def maybe_bootstrap():
    try:
        resp = httpx.get(LATEST_URL, timeout=10.0)
        if resp.status_code == 200 and resp.json() is None:
            log.info("No existing briefing found — generating initial briefing.")
            generate_briefing()
        else:
            log.info("Existing briefing found — skipping initial generation.")
    except Exception as e:
        log.error(f"Bootstrap check failed: {e}")


if __name__ == "__main__":
    maybe_bootstrap()

    scheduler = BlockingScheduler()
    scheduler.add_job(generate_briefing, "interval", hours=48)
    log.info("Scheduler started — briefing runs every 48 hours.")
    scheduler.start()
