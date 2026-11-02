"""users and workspaces (multi-tenancy)

Existing data is moved into the demo workspace (id=1), and account codes are
back-filled from account ids, so the upgrade is safe on a populated database.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMO = 1


def _replace_fk(table: str, old: str, new: str, column: str, target: str, ondelete: str | None):
    op.drop_constraint(old, table, type_="foreignkey")
    op.create_foreign_key(new, table, target, [column], ["id"], ondelete=ondelete)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    workspaces = op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.Enum("demo", "private", name="workspace_kind"), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("api_key_hash", sa.String(length=64), nullable=True),
        sa.Column("api_key_prefix", sa.String(length=16), nullable=True),
        sa.Column("simulator_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("api_key_hash"),
    )
    op.create_index("ix_workspaces_owner_id", "workspaces", ["owner_id"])
    op.execute(
        workspaces.insert().values(id=DEMO, name="Демо-банк", kind="demo", created_at=sa.func.now())
    )
    op.execute(
        "SELECT setval(pg_get_serial_sequence('workspaces', 'id'), (SELECT MAX(id) FROM workspaces))"
    )

    # Every tenant-owned table gets workspace_id; existing rows belong to the demo.
    for table in ("accounts", "transactions", "alerts"):
        op.add_column(
            table,
            sa.Column("workspace_id", sa.Integer(), nullable=False, server_default=str(DEMO)),
        )
        op.alter_column(table, "workspace_id", server_default=None)
        op.create_foreign_key(
            f"fk_{table}_workspace",
            table,
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.add_column("accounts", sa.Column("code", sa.String(length=64), nullable=True))
    op.execute("UPDATE accounts SET code = id")
    op.alter_column("accounts", "code", nullable=False)
    op.create_unique_constraint("uq_accounts_workspace_code", "accounts", ["workspace_id", "code"])

    # external_id is unique per workspace, not globally.
    op.drop_constraint("transactions_external_id_key", "transactions", type_="unique")
    op.create_unique_constraint(
        "uq_transactions_workspace_external", "transactions", ["workspace_id", "external_id"]
    )
    op.drop_index("ix_transactions_ts", table_name="transactions")
    op.create_index("ix_transactions_workspace_ts", "transactions", ["workspace_id", "ts"])
    op.drop_index("ix_alerts_status_created", table_name="alerts")
    op.create_index(
        "ix_alerts_workspace_status_created", "alerts", ["workspace_id", "status", "created_at"]
    )

    # Cascade deletes so a workspace can be wiped in one statement.
    _replace_fk("transactions", "transactions_sender_id_fkey", "fk_transactions_sender",
                "sender_id", "accounts", "CASCADE")  # fmt: skip
    _replace_fk("transactions", "transactions_receiver_id_fkey", "fk_transactions_receiver",
                "receiver_id", "accounts", "CASCADE")  # fmt: skip
    _replace_fk("alerts", "alerts_transaction_id_fkey", "fk_alerts_transaction",
                "transaction_id", "transactions", "CASCADE")  # fmt: skip
    _replace_fk("alerts", "alerts_account_id_fkey", "fk_alerts_account",
                "account_id", "accounts", "CASCADE")  # fmt: skip


def downgrade() -> None:
    # Only the demo workspace maps back onto the single-tenant schema.
    op.execute("DELETE FROM alerts WHERE workspace_id <> 1")
    op.execute("DELETE FROM transactions WHERE workspace_id <> 1")
    op.execute("DELETE FROM accounts WHERE workspace_id <> 1")

    _replace_fk("alerts", "fk_alerts_account", "alerts_account_id_fkey",
                "account_id", "accounts", None)  # fmt: skip
    _replace_fk("alerts", "fk_alerts_transaction", "alerts_transaction_id_fkey",
                "transaction_id", "transactions", None)  # fmt: skip
    _replace_fk("transactions", "fk_transactions_receiver", "transactions_receiver_id_fkey",
                "receiver_id", "accounts", None)  # fmt: skip
    _replace_fk("transactions", "fk_transactions_sender", "transactions_sender_id_fkey",
                "sender_id", "accounts", None)  # fmt: skip

    op.drop_index("ix_alerts_workspace_status_created", table_name="alerts")
    op.create_index("ix_alerts_status_created", "alerts", ["status", "created_at"])
    op.drop_index("ix_transactions_workspace_ts", table_name="transactions")
    op.create_index("ix_transactions_ts", "transactions", ["ts"])
    op.drop_constraint("uq_transactions_workspace_external", "transactions", type_="unique")
    op.create_unique_constraint("transactions_external_id_key", "transactions", ["external_id"])

    op.drop_constraint("uq_accounts_workspace_code", "accounts", type_="unique")
    op.drop_column("accounts", "code")
    for table in ("alerts", "transactions", "accounts"):
        op.drop_constraint(f"fk_{table}_workspace", table, type_="foreignkey")
        op.drop_column(table, "workspace_id")

    op.drop_index("ix_workspaces_owner_id", table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_table("users")
    sa.Enum(name="workspace_kind").drop(op.get_bind(), checkfirst=True)
