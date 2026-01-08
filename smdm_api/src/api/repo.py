from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text, MetaData
from sqlalchemy.exc import SQLAlchemyError
import re
from .common import (
    cache_get,
    cache_set,
    cache_delete_pattern,
    get_repo_db_session,
)

router = APIRouter()


@router.get("/{app}/getentitypk/{entity}")
async def get_entity_pk(entity: str, app: str):
    cache_key = f"entity_pk:{entity}/{app}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    repo_db = app + "_repo"
    session = get_repo_db_session(repo_db)
    try:
        query = text(f"SELECT field_name FROM rp_{entity} WHERE is_pk = TRUE")
        result = session.execute(query, {"entity": entity}).fetchone()
        resp = {"result": result._mapping["field_name"]} if result else {"result": None}
        cache_set(cache_key, resp)
        return resp
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/{app}/getrepoentity/{repoentity}")
async def get_repo_entity(repoentity: str, app: str):
    if not re.match(r"^[A-Za-z0-9_]+$", repoentity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    repo_table = f"{repoentity}"
    cache_key = f"repo_entity:{repo_table}/{app}"
    cached = cache_get(cache_key)
    repo_db = app + "_repo"
    repo_session = get_repo_db_session(repo_db)
    try:
        query = text(f"SELECT * FROM {repo_table}")
        results = repo_session.execute(query).fetchall()
        if not results:
            raise HTTPException(status_code=404, detail=f"No columns found in repo table {repo_table}")
        columns = [dict(row._mapping) for row in results]
        cache_set(cache_key, columns)
        return {"entity": repoentity, "repo_table": repo_table, "columns": columns}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        repo_session.close()


@router.get("/{app}/entities")
async def list_tables(app: str):
    cache_key = f"repo_entities:{app}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"tables": cached}
    repo_db = app + "_repo"
    session = get_repo_db_session(repo_db)
    try:
        engine = session.bind
        if engine is None:
            raise HTTPException(status_code=500, detail="No engine bound to session")

        metadata = MetaData()
        metadata.reflect(bind=engine)
        if metadata is None:
            raise HTTPException(status_code=201, detail="No metadata found")
        table_list = list(metadata.tables.keys())
        tables = [item for item in table_list if item.startswith('rp_')]
        cache_set(cache_key, tables)
        return {"tables": tables}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/{app}/getentityfields/{entity}")
async def get_entity_fields_repo(entity: str, app: str):
    if not re.match(r"^[A-Za-z0-9_]+$", entity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    table_name = f"rp_{entity}"
    cache_key = f"entity_fields:{table_name}/{app}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"records": cached}

    repo_db = app + "_repo"
    session = get_repo_db_session(repo_db)
    try:
        query = text(
            f"SELECT COALESCE(NULLIF(label_name, ''), field_name) AS name "
            f"FROM {table_name} WHERE visible = TRUE"
        )
        results = session.execute(query).fetchall()
        records = [row._mapping["name"] for row in results]
        cache_set(cache_key, records)
        return {"records": records}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.put("/{app}/updrepoentity/{table_name}/{pk_name}/{pk_value}")
async def update_repo_record(table_name: str, pk_name: str, pk_value: str, request: Request = None, app: str = None):
    # This endpoint updates rows in a repo DB table
    session = get_repo_db_session(app)
    try:
        data = await request.json()
        if not data:
            raise HTTPException(status_code=400, detail="No data provided for update")
        set_clause = ', '.join([f"{key} = :{key}" for key in data.keys()])
        update_query = text(
            f"UPDATE {table_name} SET {set_clause} WHERE {pk_name} = :pk_value"
        )
        params = data.copy()
        params["pk_value"] = pk_value
        result = session.execute(update_query, params)
        session.commit()

        cache_delete_pattern(f"entity_records:{table_name}:*")
        cache_delete_pattern(f"entity_all:{table_name}:*")
        cache_delete_pattern(f"entity:{table_name}:*")

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"message": f"Record updated in {table_name} where {pk_name}={pk_value}."}
    except SQLAlchemyError as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
