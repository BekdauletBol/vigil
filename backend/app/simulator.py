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
                        workspace_id=1,
                        code=a["code"],
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


def _seed_from(a) -> AccountSeed:
    return AccountSeed(
        id=a.id,
        workspace_id=a.workspace_id,
        code=a.code,
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


async def _emit(workspace_id: int, accounts, rng, settings, bus) -> None:
    from app.db.session import SessionLocal
    from app.schemas import TransactionIn
    from app.services.transactions import submit

    for payload in scenario(rng, accounts, settings.reporting_threshold, datetime.now(UTC)):
        payload["ts"] = datetime.now(UTC)
        try:
            async with SessionLocal() as session:
                await submit(session, workspace_id, TransactionIn(**payload), bus, settings)
        except Exception:  # noqa: BLE001 - keep simulating
            log.exception("simulated ingest failed (workspace %s)", workspace_id)
        await asyncio.sleep(rng.uniform(0.05, 0.4))


async def run_embedded(settings, bus) -> None:
    """In-process demo simulator for runs without Docker: calls the service layer directly."""
    from sqlalchemy import select

    from app.db.models import DEMO_WORKSPACE_ID, Account
    from app.db.session import SessionLocal

    rng = random.Random()
    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Account).where(Account.workspace_id == DEMO_WORKSPACE_ID)
        )
        accounts = [_seed_from(a) for a in rows]
    log.info("Embedded simulator started: %.1f tx/s", settings.simulator_rate)
    while True:
        await _emit(DEMO_WORKSPACE_ID, accounts, rng, settings, bus)
        await asyncio.sleep(rng.expovariate(settings.simulator_rate))


async def run_workspace_simulators(settings, bus, rate: float = 0.4) -> None:
    """Feed private workspaces whose owner switched the simulator on (it expires by itself)."""
    from sqlalchemy import select

    from app.db.models import Account, Workspace
    from app.db.session import SessionLocal

    rng = random.Random()
    while True:
        await asyncio.sleep(1)
        try:
            async with SessionLocal() as session:
                active = list(
                    await session.scalars(
                        select(Workspace.id).where(Workspace.simulator_until > datetime.now(UTC))
                    )
                )
                for ws_id in active:
                    if rng.random() > rate:
                        continue
                    rows = await session.scalars(
                        select(Account).where(Account.workspace_id == ws_id).limit(300)
                    )
                    accounts = [_seed_from(a) for a in rows]
                    if len(accounts) >= 2:
                        await _emit(ws_id, accounts, rng, settings, bus)
        except Exception:  # noqa: BLE001 - one bad tick must not stop the loop
            log.exception("workspace simulator tick failed")


async def prune_demo_history(settings, every_seconds: int = 600) -> None:
    """Keep the shared demo bounded: drop transactions (and their cases) past retention."""
    from datetime import timedelta

    from sqlalchemy import delete

    from app.db.models import DEMO_WORKSPACE_ID, Transaction
    from app.db.session import SessionLocal

    while True:
        try:
            cutoff = datetime.now(UTC) - timedelta(hours=settings.demo_retention_hours)
            async with SessionLocal() as session:
                result = await session.execute(
                    delete(Transaction).where(
                        Transaction.workspace_id == DEMO_WORKSPACE_ID, Transaction.ts < cutoff
                    )
                )
                await session.commit()
                if result.rowcount:
                    log.info("Pruned %d demo transactions older than %s", result.rowcount, cutoff)
        except Exception:  # noqa: BLE001
            log.exception("demo prune failed")
        await asyncio.sleep(every_seconds)


if __name__ == "__main__":
    main()
