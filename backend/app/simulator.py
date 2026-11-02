"""Live transaction simulator.

Plays the role of an external banking system: it POSTs transactions to the
public ingest endpoint over HTTP, exactly like a real integration would.

    python -m app.simulator --api http://localhost:8000 --rate 1.5
"""

import argparse
import asyncio
import logging
import random
import uuid
from datetime import UTC, datetime

import httpx

from app.db.models import AccountKind, RiskLevel
from app.services.generator import AccountSeed, scenario

log = logging.getLogger("simulator")


async def load_accounts(client: httpx.AsyncClient) -> list[AccountSeed]:
    for attempt in range(60):
        try:
            r = await client.get("/api/v1/accounts", params={"limit": 500})
            r.raise_for_status()
            rows = r.json()
            if rows:
                return [
                    AccountSeed(
                        id=a["id"],
                        name=a["name"],
                        kind=AccountKind(a["kind"]),
                        tax_id="",
                        bank=a["bank"],
                        country=a["country"],
                        city=a["city"],
                        risk_level=RiskLevel(a["risk_level"]),
                        is_pep=a["is_pep"],
                        opened_at=datetime.fromisoformat(a["opened_at"]),
                    )
                    for a in rows
                ]
        except httpx.HTTPError as exc:
            log.info("API not ready (%s), retry %d", exc.__class__.__name__, attempt + 1)
        await asyncio.sleep(2)
    raise RuntimeError("API did not become ready")


async def run(api: str, rate: float, threshold: int, seed: int | None = None) -> None:
    rng = random.Random(seed)
    async with httpx.AsyncClient(base_url=api, timeout=10) as client:
        accounts = await load_accounts(client)
        log.info("Simulator started: %d accounts, %.1f tx/s", len(accounts), rate)
        while True:
            for payload in scenario(rng, accounts, threshold, datetime.now(UTC)):
                payload["ts"] = datetime.now(UTC).isoformat()
                payload["external_id"] = f"SIM-{uuid.uuid4().hex[:16]}"
                try:
                    r = await client.post("/api/v1/transactions", json=payload)
                    r.raise_for_status()
                except httpx.HTTPError as exc:
                    log.warning("ingest failed: %s", exc)
                await asyncio.sleep(rng.uniform(0.05, 0.4))
            await asyncio.sleep(rng.expovariate(rate))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--rate", type=float, default=1.5)
    parser.add_argument("--threshold", type=int, default=7_000_000)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    asyncio.run(run(args.api, args.rate, args.threshold))


async def run_embedded(settings, bus) -> None:
    """In-process simulator for runs without Docker: calls the service layer directly."""
    from sqlalchemy import select

    from app.db.models import Account
    from app.db.session import SessionLocal
    from app.schemas import TransactionIn
    from app.services.transactions import submit

    rng = random.Random()
    async with SessionLocal() as session:
        rows = list(await session.scalars(select(Account)))
    accounts = [
        AccountSeed(
            id=a.id,
            name=a.name,
            kind=a.kind,
            tax_id="",
            bank=a.bank,
            country=a.country,
            city=a.city,
            risk_level=a.risk_level,
            is_pep=a.is_pep,
            opened_at=a.opened_at,
        )
        for a in rows
    ]
    log.info("Embedded simulator started: %.1f tx/s", settings.simulator_rate)
    while True:
        for payload in scenario(rng, accounts, settings.reporting_threshold, datetime.now(UTC)):
            payload["ts"] = datetime.now(UTC)
            try:
                async with SessionLocal() as session:
                    await submit(session, TransactionIn(**payload), bus, settings)
            except Exception:  # noqa: BLE001 - keep simulating
                log.exception("embedded ingest failed")
            await asyncio.sleep(rng.uniform(0.05, 0.4))
        await asyncio.sleep(rng.expovariate(settings.simulator_rate))


if __name__ == "__main__":
    main()
