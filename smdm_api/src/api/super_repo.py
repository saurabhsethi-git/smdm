from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
import uuid
from .common import (
    cache_get,
    cache_set,
    cache_delete_pattern,
    get_repo_db_session,
    get_super_repo_session,
)

router = APIRouter()


@router.get("/getrepo/{app}")
async def get_repo_status(app: str):
    cache_key = f"repo_status:{app}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    session = get_super_repo_session()
    try:
        query = text("SELECT status FROM sy_repo_details WHERE repo_name = :app")
        result = session.execute(query, {"app": app}).fetchone()
        resp = {"repo_status": 1, "active_status": result._mapping["status"]} if result else {"repo_status": 0, "active_status": False}
        cache_set(cache_key, resp)
        return resp
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/apps/list")
async def list_app_details():
    cache_key = "app_list:sy_repo_details"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"records": cached}

    session = get_super_repo_session()
    try:
        query = text("SELECT repo_id, repo_name, app_name, last_updated FROM sy_repo_details")
        rows = session.execute(query).fetchall()
        records = [dict(r._mapping) for r in rows]
        cache_set(cache_key, records)
        return {"records": records}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.post("/create/app")
async def create_app_details(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict) or not payload:
        raise HTTPException(status_code=400, detail="JSON body must be an object with column:value pairs")

    super_repo_session = get_super_repo_session()
    try:
        if "app_name" not in payload or "repo_name" not in payload:
            raise HTTPException(status_code=400, detail="Missing required fields: app_name and repo_name")
        payload["repo_id"] = str(uuid.uuid4())

        super_repo_session.execute(text(
            "CREATE TABLE IF NOT EXISTS sy_repo_details ("
            "repo_id VARCHAR PRIMARY KEY, "
            "repo_name VARCHAR, "
            "app_name VARCHAR, "
            "last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        ))

        cols = ", ".join(payload.keys())
        placeholders = ", ".join([f":{k}" for k in payload.keys()])
        update_clause = ", ".join([f"{k}=EXCLUDED.{k}" for k in payload.keys() if k != "repo_id"])
        insert_q = text(
            f"INSERT INTO sy_repo_details ({cols}) VALUES ({placeholders}) "
            f"ON CONFLICT (repo_id) DO UPDATE SET {update_clause}"
        )

        super_repo_session.execute(insert_q, payload)
        super_repo_session.commit()

        cache_delete_pattern("app_list:*")
        cache_delete_pattern("super:sy_repo_details")
        return {"status": 200, "message": "App record created/updated", "repo_id": payload["repo_id"]}
    except SQLAlchemyError as e:
        super_repo_session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        super_repo_session.close()


@router.post("/{app}/setuprepo/")
async def setup_repo(app: str):
    source_engine = create_engine((get_repo_db_session.__module__ and "") or "")
    # Create engine and session for source DB (use DB_URL+app in caller environment)
    source_engine = create_engine(get_repo_db_session.__defaults__[0] if False else None) if False else None
    # To avoid duplicating logic here we will recreate the original behavior using DB URL from common
    from .common import DB_URL
    source_engine = create_engine(DB_URL + app)
    SourceSession = sessionmaker(autocommit=False, autoflush=False, bind=source_engine)
    source_session = SourceSession()

    repo_db = app + "_repo"
    repo_session = get_repo_db_session(repo_db)
    super_repo_session = get_super_repo_session()
    try:
        source_metadata = MetaData()
        source_metadata.reflect(bind=source_engine)

        try:
            repo_id = uuid.uuid4()
            super_repo_session.execute(text(f"CREATE TABLE IF NOT EXISTS sy_repo_details (repo_id VARCHAR PRIMARY KEY, repo_name VARCHAR, last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"));
            check_query = text("SELECT 1 FROM sy_repo_details WHERE repo_name = :repo_name")
            exists = super_repo_session.execute(check_query, {"repo_name": app}).fetchone()

            if not exists:
                insert_query = text(
                    "INSERT INTO sy_repo_details (repo_id, repo_name) VALUES (:repo_id, :repo_name)"
                )
                super_repo_session.execute(insert_query, {"repo_id": repo_id, "repo_name": app})
            super_repo_session.commit();
        except SQLAlchemyError as e:
            super_repo_session.rollback()
            raise HTTPException(status_code=500, detail=f"Error setting up sy_repo_details: {str(e)}")

        for table_name, table in source_metadata.tables.items():
            new_table_name = f"rp_{table_name}"
            repo_session.execute(text(f"DROP TABLE IF EXISTS {new_table_name}"))

            create_table_query = f"""
            CREATE TABLE {new_table_name} (
                id SERIAL PRIMARY KEY,
                field_name VARCHAR,
                label_name VARCHAR,
                is_pk BOOLEAN DEFAULT FALSE,
                visible BOOLEAN DEFAULT TRUE,
                reference_entity VARCHAR,
                reference_attribute VARCHAR,
                reference_picker_attribute VARCHAR
            );
            """
            repo_session.execute(text(create_table_query))

            fk_map = {}
            pk_list = []
            for constraint in table.constraints:
                if constraint.__class__.__name__ == "ForeignKeyConstraint":
                    for element in constraint.elements:
                        local_col = element.parent.name
                        ref_table = element.column.table.name
                        ref_col = element.column.name
                        fk_map[local_col] = (ref_table, ref_col)
                elif constraint.__class__.__name__ == "PrimaryKeyConstraint":
                    for column in constraint.columns:
                        pk_list.append(column.name)

            for column in table.columns:
                ref_entity, ref_attr = None, None
                pk_col = False
                if column.name in fk_map:
                    ref_entity, ref_attr = fk_map[column.name]
                if column.name in pk_list:
                    pk_col = True

                insert_query = text(f"""
                    INSERT INTO {new_table_name} (field_name, label_name, is_pk, visible, reference_entity, reference_attribute, reference_picker_attribute)
                    VALUES (:field_name, NULL, :pk_col, TRUE, :reference_entity, :reference_attribute, :reference_attribute)
                """)
                repo_session.execute(insert_query, {
                    "field_name": column.name,
                    "reference_entity": ref_entity,
                    "reference_attribute": ref_attr,
                    "pk_col": pk_col
                })

        repo_session.commit()

        cache_delete_pattern("repo_entities*")
        cache_delete_pattern("entity_fields:rp_*")
        cache_delete_pattern("entity_records:*")
        cache_delete_pattern("entity:*")
        cache_delete_pattern("entity_pk:*")
        cache_delete_pattern("repo_status:*")

        super_repo_session.execute(text(f"UPDATE sy_repo_details SET last_updated = CURRENT_TIMESTAMP, status = TRUE WHERE repo_name = :app"), {"app": app})
        super_repo_session.commit()
        return {"status": 1}

    except SQLAlchemyError as e:
        repo_session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        source_session.close()
        repo_session.close()
        super_repo_session.close()
