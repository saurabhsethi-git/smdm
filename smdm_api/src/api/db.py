from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import re
import hashlib
from .common import (
    cache_get,
    cache_set,
    cache_delete_pattern,
    get_db_session,
    get_repo_db_session,
)

router = APIRouter()


@router.get("/{app}/getentity/{entity}")
async def get_entity_records_list(entity: str, filters: str = None, repo_select: bool = True, fields: str = None, app: str = None):
    if not re.match(r"^[A-Za-z0-9_]+$", entity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    table_name = entity
    session = get_db_session(app)
    try:
        select_cols = None
        repo_reference = None

        if repo_select:
            repo_table = f"rp_{entity}"
            repo_fields_cache_key = f"repo_fields:{repo_table}/{app}"
            repo_fields_cached = cache_get(repo_fields_cache_key)
            if repo_fields_cached is not None:
                repo_rows = repo_fields_cached
            else:
                repo_db = app + "_repo"
                repo_session = get_repo_db_session(repo_db)
                try:
                    repo_query = text(f"SELECT reference_entity, reference_attribute, COALESCE(reference_entity, '{entity}')||'.'||COALESCE(reference_picker_attribute, field_name) as name FROM {repo_table} WHERE visible = TRUE")
                    repo_rows_sql = repo_session.execute(repo_query).fetchall()
                    repo_rows = [dict(r._mapping) for r in repo_rows_sql]
                    cache_set(repo_fields_cache_key, repo_rows)
                finally:
                    repo_session.close()

            repo_fields = [r["name"] for r in repo_rows]
            repo_reference = [
                {"entity": r["reference_entity"], "attribute": r["reference_attribute"]}
                for r in repo_rows if r.get("reference_entity")
            ]
            select_cols = repo_fields

        elif fields:
            provided = [f.strip() for f in fields.split(",") if f.strip()]
            if not provided:
                raise HTTPException(status_code=400, detail="No valid fields provided")
            select_cols = provided

        if select_cols:
            for col in select_cols:
                if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$", col):
                    raise HTTPException(status_code=400, detail=f"Invalid column name: {col}")
            select_clause = ", ".join(select_cols)
        else:
            select_clause = "*"

        where_clause = ""
        if filters:
            filter_list = filters.split(",")
            where_conditions = [f.strip() for f in filter_list if f.strip()]
            if where_conditions:
                where_clause = " WHERE " + " AND ".join(where_conditions)

        join_sql = ""
        if repo_reference:
            join_clauses = []
            for ref in repo_reference:
                if ref["entity"] and ref["attribute"]:
                    join_clause = (
                        f" LEFT JOIN {ref['entity']} ON {table_name}.{ref['attribute']} = {ref['entity']}.{ref['attribute']}"
                    )
                    join_clauses.append(join_clause)
            join_sql = " ".join(join_clauses)

        key_raw = f"{select_clause}|{join_sql}|{where_clause}"
        cache_hash = hashlib.md5(key_raw.encode()).hexdigest()
        cache_key = f"entity_records:{table_name}/{app}:{cache_hash}"
        cached = cache_get(cache_key)
        if cached is not None:
            return {"records": cached}

        query = text(f"SELECT {select_clause} FROM {table_name} {join_sql}{where_clause}")
        results = session.execute(query).fetchall()

        if not results:
            raise HTTPException(status_code=404, detail=f"No records found in {table_name}")

        records = [dict(row._mapping) for row in results]
        cache_set(cache_key, records)
        return {"records": records}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/{app}/getentity/{entity}/{pk_id}")
async def get_entity_record_by_pk(entity: str, filters: str = None, repo_select: bool = True, fields: str = None, pk_id: str = None, app: str = None):
    if not re.match(r"^[A-Za-z0-9_]+$", entity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    table_name = entity
    session = get_db_session(app)
    try:
        select_cols = None
        repo_reference = None
        pk_fields = []

        if repo_select:
            repo_table = f"rp_{entity}"
            repo_fields_cache_key = f"repo_fields:{repo_table}/{pk_id}/{app}"
            repo_fields_cached = cache_get(repo_fields_cache_key)
            if repo_fields_cached is not None:
                repo_rows = repo_fields_cached
            else:
                repo_db = app + "_repo"
                repo_session = get_repo_db_session(repo_db)
                try:
                    repo_query = text(f"SELECT reference_entity, reference_attribute, COALESCE(reference_entity, '{entity}')||'.'||COALESCE(reference_picker_attribute, field_name) as name, is_pk FROM {repo_table}")
                    repo_rows_sql = repo_session.execute(repo_query).fetchall()
                    repo_rows = [dict(r._mapping) for r in repo_rows_sql]
                    cache_set(repo_fields_cache_key, repo_rows)
                finally:
                    repo_session.close()

            repo_fields = [r["name"] for r in repo_rows]
            pk_fields = [r["name"] for r in repo_rows if r.get("is_pk")]
            repo_reference = [
                {"entity": r["reference_entity"], "attribute": r["reference_attribute"]}
                for r in repo_rows if r.get("reference_entity")
            ]
            select_cols = repo_fields

        elif fields:
            provided = [f.strip() for f in fields.split(",") if f.strip()]
            if not provided:
                raise HTTPException(status_code=400, detail="No valid fields provided")
            select_cols = provided

        if select_cols:
            for col in select_cols:
                if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$", col):
                    raise HTTPException(status_code=400, detail=f"Invalid column name: {col}")
            select_clause = ", ".join(select_cols)
        else:
            select_clause = "*"

        if not pk_fields:
            raise HTTPException(status_code=400, detail="No primary key fields defined in repo table")
        where_clause = " AND ".join([f"{field} = :pk_id" for field in pk_fields])

        join_sql = ""
        if repo_reference:
            join_clauses = []
            for ref in repo_reference:
                if ref["entity"] and ref["attribute"]:
                    join_clause = (
                        f" LEFT JOIN {ref['entity']} ON {table_name}.{ref['attribute']} = {ref['entity']}.{ref['attribute']}"
                    )
                    join_clauses.append(join_clause)
            join_sql = " ".join(join_clauses)

        key_raw = f"{select_clause}|{join_sql}|{where_clause}|{pk_id}"
        cache_hash = hashlib.md5(key_raw.encode()).hexdigest()
        cache_key = f"entity_records:{table_name}:pk:{cache_hash}/{app}:{pk_id}"
        cached = cache_get(cache_key)
        if cached is not None:
            return {"records": cached}

        query = text(f"SELECT {select_clause} FROM {table_name} {join_sql} WHERE {where_clause}")
        results = session.execute(query, {"pk_id": pk_id}).fetchall()

        if not results:
            raise HTTPException(status_code=404, detail=f"No records found in {table_name}")

        records = [dict(row._mapping) for row in results]
        cache_set(cache_key, records)
        return {"records": records}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/{app}/getentity/all/{entity}")
async def get_entity_all_records(entity: str, filters: str = None, app: str = None):
    cache_key = f"entity_all:{entity}/{app}:{hashlib.md5(str(filters or '').encode()).hexdigest()}"
    cached = cache_get(cache_key)
    if cached is not None:
        return {"entity": entity, "records": cached}
    session = get_db_session(app)
    try:
        where_clause = ""
        if filters:
            filter_list = filters.split(",")
            where_conditions = []
            for f in filter_list:
                f = f.strip()
                where_conditions.append(f)
            where_clause = " WHERE " + " AND ".join(where_conditions)

        query = text(f"SELECT * FROM {entity}{where_clause}")
        results = session.execute(query).fetchall()

        if not results:
            raise HTTPException(status_code=404, detail=f"No records found in {entity}")

        records = [dict(row._mapping) for row in results]
        cache_set(cache_key, records)
        return {"entity": entity, "records": records}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.post("/{app}/addentity/{table_name}")
async def insert_record(table_name: str, request: Request, app: str):
    session = get_db_session(app)
    try:
        data = await request.json()
        columns = ', '.join(data.keys())
        values_placeholders = ', '.join([f":{key}" for key in data.keys()])
        insert_query = text(f"INSERT INTO {table_name} ({columns}) VALUES ({values_placeholders})")
        print(insert_query)
        session.execute(insert_query, data)
        session.commit()

        cache_delete_pattern(f"entity_records:{table_name}/*")
        cache_delete_pattern(f"entity_records:{table_name}:pk:*")
        cache_delete_pattern(f"entity_all:{table_name}/*")

        return {"message": f"Record inserted into {table_name}."}
    except SQLAlchemyError as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.delete("/{app}/rementity/{table_name}/{pk_name}/{pk_value}")
async def delete_record(table_name: str, pk_name: str, pk_value: str, app: str):
    session = get_db_session(app)
    try:
        delete_query = text(f"DELETE FROM {table_name} WHERE {pk_name} = :pk_value")
        result = session.execute(delete_query, {"pk_value": pk_value})
        session.commit()

        cache_delete_pattern(f"entity_records:{table_name}/*")
        cache_delete_pattern(f"entity_records:{table_name}:pk:*")
        cache_delete_pattern(f"entity_all:{table_name}/*")

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"message": f"Record deleted from {table_name} where {pk_name}={pk_value}."}
    except SQLAlchemyError as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.put("/{app}/updentity/{table_name}/{pk_name}/{pk_value}")
async def update_record(table_name: str, pk_name: str, pk_value: str, request: Request, app: str):
    session = get_db_session(app)
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

        cache_delete_pattern(f"entity_records:{table_name}/*")
        cache_delete_pattern(f"entity_records:{table_name}:pk:*")
        cache_delete_pattern(f"entity_all:{table_name}/*")

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"message": f"Record updated in {table_name} where {pk_name}={pk_value}."}
    except SQLAlchemyError as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
