from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import create_engine, MetaData, Table, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
import os
import re
from dotenv import load_dotenv
import uuid
import json
import hashlib
import redis

router = APIRouter()
load_dotenv()  # take environment variables from .env.

SUPER_REPO = os.getenv("SUPER_REPO")
DB_URL = os.getenv("DB_URL")
#DATABASE_URL = os.getenv("DATABASE_URL")
#REPO_DATABASE_URL = os.getenv("REPO_DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
REDIS_TTL = int(os.getenv("REDIS_TTL", "300"))

# Redis client (lazy-init)
_redis_client = None
def get_redis_client():
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            _redis_client.ping()
        except Exception as ex:
            _redis_client = None
    return _redis_client

def _cache_get(key):
    try:
        rc = get_redis_client()
        if rc:
            value = rc.get(key)
            if value:
                return json.loads(value)
    except Exception:
        pass
    return None

def _cache_set(key, value, ttl=REDIS_TTL):
    try:
        rc = get_redis_client()
        if rc:
            rc.set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass

def _cache_delete_pattern(pattern):
    try:
        rc = get_redis_client()
        if rc:
            # safe - scan_iter is better than keys for big DBs
            for k in rc.scan_iter(match=pattern):
                rc.delete(k)
    except Exception:
        pass

def get_db_session(app: str):
    engine = create_engine(DB_URL+app)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if SessionLocal:
        return SessionLocal()
    else:
        raise HTTPException(status_code=500, detail="Database doesn't exist or not available")

def get_repo_db_session(app: str):
    engine = create_engine(DB_URL+app)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if SessionLocal:
        return SessionLocal()
    else:
        raise HTTPException(status_code=500, detail="Repository DB doesn't exist or not available")

def get_super_repo_session():
    engine = create_engine(SUPER_REPO)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if SessionLocal:
        return SessionLocal()
    else:
        raise HTTPException(status_code=500, detail="Super Repository DB doesn't exist or not available")

@router.get("/getrepo/{app}")
async def get_repo_status(app: str):
    """
    Return 1 if repo exists in sy_repo_details table, else 0
    """
    cache_key = f"repo_status:{app}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    session = get_super_repo_session()
    try:
        query = text(
            f"SELECT status FROM sy_repo_details WHERE repo_name = :app"
        )
        result = session.execute(query, {"app": app}).fetchone()
        resp = {"repo_status": 1, "active_status": result._mapping["status"]} if result else {"repo_status": 0, "active_status": False}
        _cache_set(cache_key, resp)
        return resp
    
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/{app}/getentitypk/{entity}")
async def get_entity_pk(entity: str, app: str):
    cache_key = f"entity_pk:{entity}/{app}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    repo_db = app+"_repo"
    session = get_repo_db_session(repo_db)
    try:
        query = text(f"SELECT field_name FROM rp_{entity} WHERE is_pk = TRUE")
        result = session.execute(query, {"entity": entity}).fetchone()
        resp = {"result": result._mapping["field_name"]} if result else {"result": None}
        _cache_set(cache_key, resp)
        return resp
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
# ...existing code...

@router.get("/apps/list")
async def list_app_details():
    """
    List records from sy_repo_details using the SUPER_REPO connection.
    """
    cache_key = "app_list:sy_repo_details"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"records": cached}

    session = get_super_repo_session()
    try:
        query = text("SELECT repo_id, repo_name, app_name, last_updated FROM sy_repo_details")
        rows = session.execute(query).fetchall()
        records = [dict(r._mapping) for r in rows]
        _cache_set(cache_key, records)
        return {"records": records}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.post("/create/app")
async def create_app_details(request: Request):
    """
    Create or update a sy_repo_details record in SUPER_REPO.
    JSON body must contain column:value pairs. If repo_id is not provided one is generated.
    The path param `app` will be used as app_name if not present in the JSON.
    """
    payload = await request.json()
    if not isinstance(payload, dict) or not payload:
        raise HTTPException(status_code=400, detail="JSON body must be an object with column:value pairs")

    super_repo_session = get_super_repo_session()
    try:
        # normalize common fields
        if "app_name" not in payload or "repo_name" not in payload:
            raise HTTPException(status_code=500, detail=f"Error setting up sy_repo_details: {str(e)}")
        payload["repo_id"] = str(uuid.uuid4())

        # ensure table exists
        super_repo_session.execute(text(
            "CREATE TABLE IF NOT EXISTS sy_repo_details ("
            "repo_id VARCHAR PRIMARY KEY, "
            "repo_name VARCHAR, "
            "app_name VARCHAR, "
            "last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        ))

        cols = ", ".join(payload.keys())
        placeholders = ", ".join([f":{k}" for k in payload.keys()])

        # upsert: update non-pk columns on conflict
        update_clause = ", ".join([f"{k}=EXCLUDED.{k}" for k in payload.keys() if k != "repo_id"])
        insert_q = text(
            f"INSERT INTO sy_repo_details ({cols}) VALUES ({placeholders}) "
            f"ON CONFLICT (repo_id) DO UPDATE SET {update_clause}"
        )

        super_repo_session.execute(insert_q, payload)
        super_repo_session.commit()

        # invalidate related cache
        _cache_delete_pattern("app_list:*")
        _cache_delete_pattern("super:sy_repo_details")
        return {"status": 200, "message": "App record created/updated", "repo_id": payload["repo_id"]}

    except SQLAlchemyError as e:
        super_repo_session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        super_repo_session.close()

@router.post("/{app}/setuprepo/")
async def setup_repo(app: str):
    # Create engine and session for source DB
    source_engine = create_engine(DB_URL+app)
    SourceSession = sessionmaker(autocommit=False, autoflush=False, bind=source_engine)
    source_session = SourceSession()

    # Session for target (repo) DB
    repo_db = app+"_repo"
    repo_session = get_repo_db_session(repo_db)
    super_repo_session = get_super_repo_session()
    try:
        # Reflect source DB tables
        source_metadata = MetaData()
        source_metadata.reflect(bind=source_engine)

        # Setup repo table for repo details
        try:
            repo_id=uuid.uuid4()
            super_repo_session.execute(text(f"CREATE TABLE IF NOT EXISTS sy_repo_details (repo_id VARCHAR PRIMARY KEY, repo_name VARCHAR, last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"));
            # Check if repo_name exists, then insert only if not
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

            # Drop table if exists to avoid errors (optional)
            repo_session.execute(text(f"DROP TABLE IF EXISTS {new_table_name}"))

            # Create new table in repo DB
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

            # Build a lookup of foreign key columns → (referenced table, referenced column)
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

            # Insert column names from source table into new table
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

        # Invalidate related caches
        _cache_delete_pattern("repo_entities*")
        _cache_delete_pattern("entity_fields:rp_*")
        _cache_delete_pattern("entity_records:*")
        _cache_delete_pattern("entity:*")
        _cache_delete_pattern("entity_pk:*")
        _cache_delete_pattern("repo_status:*")

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

@router.get("/{app}/getrepoentity/{repoentity}")
async def get_repo_entity(repoentity: str, app: str):
    """
    Fetch all columns and their metadata from the repo entity table (rp_{entity}).
    Connects using get_repo_db_session for the app's repo database.
    
    Example: GET /myapp/getrepoentity/customers
    """
    # validate entity name to avoid SQL injection
    if not re.match(r"^[A-Za-z0-9_]+$", repoentity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    repo_table = f"{repoentity}"
    cache_key = f"repo_entity:{repo_table}/{app}"
    cached = _cache_get(cache_key)
    #if cached is not None:
    #   return {"entity": repoentity, "repo_table": repo_table, "columns": cached}
    repo_db = app + "_repo"
    repo_session = get_repo_db_session(repo_db)
    try:
        query = text(f"SELECT * FROM {repo_table}")
        results = repo_session.execute(query).fetchall()
        if not results:
            raise HTTPException(status_code=404, detail=f"No columns found in repo table {repo_table}")
        
        columns = [dict(row._mapping) for row in results]
        _cache_set(cache_key, columns)
        return {"entity": repoentity, "repo_table": repo_table, "columns": columns}
    
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        repo_session.close()

@router.get("/{app}/entities")
async def list_tables(app: str):
    """
    Return list of tables in the database referenced by URL
    (uses the existing get_db_session connection).
    """
    cache_key = f"repo_entities:{app}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"tables": cached}
    repo_db = app+"_repo"
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
        _cache_set(cache_key, tables)
        return {"tables": tables}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/{app}/getentityfields/{entity}")
async def get_entity_fields_repo(entity: str, app: str):
    """
    Return list of values from repo table column `label_name` (or `field_name`
    when label_name is NULL or blank) where visible is true.
    The entity parameter is appended with 'rp_' to form the repo table name.
    Example: GET /getentityfields/customers  -> queries rp_customers
    """
    # simple whitelist validation to avoid SQL injection via table name
    if not re.match(r"^[A-Za-z0-9_]+$", entity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    table_name = f"rp_{entity}"
    cache_key = f"entity_fields:{table_name}/{app}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"records": cached}

    repo_db = app+"_repo"
    session = get_repo_db_session(repo_db)
    try:
        query = text(
            f"SELECT COALESCE(NULLIF(label_name, ''), field_name) AS name "
            f"FROM {table_name} WHERE visible = TRUE"
        )
        results = session.execute(query).fetchall()
        records = [row._mapping["name"] for row in results]
        _cache_set(cache_key, records)
        return {"records": records}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/{app}/getentity/{entity}")
async def get_entity_records(entity: str, filters: str = None, repo_select: bool = True, fields: str = None, app: str = None):
    """
    Fetch records from a table (entity) with optional WHERE clause filters.
    If repo_select=True the select list is taken from the repo table (rp_{entity})'s
    field_name values where visible = TRUE. Alternatively pass comma-separated
    `fields` to control the select list.

    Example:
      GET /getentity/customers?repo_select=true
      GET /getentity/customers?fields=id,name,email&filters=id=1
    """
    
    # validate table/entity name to avoid SQL injection
    if not re.match(r"^[A-Za-z0-9_]+$", entity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    table_name = entity  # source table name used in FROM

    session = get_db_session(app)
    try:
        # Determine select list
        select_cols = None
        repo_reference = None

        if repo_select:
            repo_table = f"rp_{entity}"
            repo_fields_cache_key = f"repo_fields:{repo_table}/{app}"
            repo_fields_cached = _cache_get(repo_fields_cache_key)
            if repo_fields_cached is not None:
                repo_rows = repo_fields_cached
            else:
                repo_db = app+"_repo"
                repo_session = get_repo_db_session(repo_db)
                try:
                    repo_query = text(f"SELECT reference_entity, reference_attribute, COALESCE(reference_entity, '{entity}')||'.'||COALESCE(reference_picker_attribute, field_name) as name FROM {repo_table} WHERE visible = TRUE")
                    repo_rows_sql = repo_session.execute(repo_query).fetchall()
                    repo_rows = [dict(r._mapping) for r in repo_rows_sql]
                    _cache_set(repo_fields_cache_key, repo_rows)
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

        # If no select columns determined, default to all columns
        if select_cols:
            for col in select_cols:
                if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$", col):
                    raise HTTPException(status_code=400, detail=f"Invalid column name: {col}")
            select_clause = ", ".join(select_cols)
        else:
            select_clause = "*"

        # Build WHERE clause from filters (caller-provided expressions)
        where_clause = ""
        if filters:
            filter_list = filters.split(",")
            where_conditions = [f.strip() for f in filter_list if f.strip()]
            if where_conditions:
                where_clause = " WHERE " + " AND ".join(where_conditions)

        # Build joins
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

        # compute cache key
        key_raw = f"{select_clause}|{join_sql}|{where_clause}"
        cache_hash = hashlib.md5(key_raw.encode()).hexdigest()
        cache_key = f"entity_records:{table_name}/{app}:{cache_hash}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return {"records": cached}
        
        query = text(f"SELECT {select_clause} FROM {table_name} {join_sql}{where_clause}")
        results = session.execute(query).fetchall()

        if not results:
            raise HTTPException(status_code=404, detail=f"No records found in {table_name}")

        records = [dict(row._mapping) for row in results]
        _cache_set(cache_key, records)
        return {"records": records}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/{app}/getentity/{entity}/{pk_id}")
async def get_entity_records(entity: str, filters: str = None, repo_select: bool = True, fields: str = None, pk_id: str = None, app: str = None):
    # validate table/entity name to avoid SQL injection
    if not re.match(r"^[A-Za-z0-9_]+$", entity):
        raise HTTPException(status_code=400, detail="Invalid entity name")

    table_name = entity  # source table name used in FROM

    session = get_db_session(app)
    try:
        select_cols = None
        repo_reference = None
        pk_fields = []

        if repo_select:
            repo_table = f"rp_{entity}"
            repo_fields_cache_key = f"repo_fields:{repo_table}/{pk_id}/{app}"
            repo_fields_cached = _cache_get(repo_fields_cache_key)
            if repo_fields_cached is not None:
                repo_rows = repo_fields_cached
            else:
                repo_db = app+"_repo"
                repo_session = get_repo_db_session(repo_db)
                try:
                    repo_query = text(f"SELECT reference_entity, reference_attribute, COALESCE(reference_entity, '{entity}')||'.'||COALESCE(reference_picker_attribute, field_name) as name, is_pk FROM {repo_table}")
                    repo_rows_sql = repo_session.execute(repo_query).fetchall()
                    repo_rows = [dict(r._mapping) for r in repo_rows_sql]
                    _cache_set(repo_fields_cache_key, repo_rows)
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

        # ensure pk fields exist
        if not pk_fields:
            raise HTTPException(status_code=400, detail="No primary key fields defined in repo table")
        where_clause = " AND ".join([f"{field} = :pk_id" for field in pk_fields])

        # Build joins
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
        cached = _cache_get(cache_key)
        if cached is not None:
            return {"records": cached}

        query = text(f"SELECT {select_clause} FROM {table_name} {join_sql} WHERE {where_clause}")
        results = session.execute(query, {"pk_id": pk_id}).fetchall()

        if not results:
            raise HTTPException(status_code=404, detail=f"No records found in {table_name}")

        records = [dict(row._mapping) for row in results]
        _cache_set(cache_key, records)
        return {"records": records}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/{app}/getentity/all/{entity}")
async def get_entity_all_records(entity: str, filters: str = None, app: str = None):
    """
    Fetch records from a table (entity) with optional WHERE clause filters.
    
    Parameters:
    - entity: table name
    - filters: comma-separated key=value pairs (e.g., "id=2,name='Test'")
    
    Example: GET /entity/customers?filters=id=1,status='active'
    """
    cache_key = f"entity_all:{entity}/{app}:{hashlib.md5(str(filters or '').encode()).hexdigest()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"entity": entity, "records": cached}
    session = get_db_session(app)
    try:
        # Build WHERE clause from filters
        where_clause = ""
        if filters:
            # Parse comma-separated filters into AND conditions
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
        
        # Convert rows to dictionaries
        records = [dict(row._mapping) for row in results]
        _cache_set(cache_key, records)
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
        # Build columns and values for SQL
        columns = ', '.join(data.keys())
        values_placeholders = ', '.join([f":{key}" for key in data.keys()])
        insert_query = text(f"INSERT INTO {table_name} ({columns}) VALUES ({values_placeholders})")
        session.execute(insert_query, data)
        session.commit()
        
        # Invalidate caches for this table
        _cache_delete_pattern(f"entity_records:{table_name}:*")
        _cache_delete_pattern(f"entity_all:{table_name}:*")
        _cache_delete_pattern(f"entity:{table_name}:*")
        
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

        # Invalidate caches for this table
        _cache_delete_pattern(f"entity_records:{table_name}:*")
        _cache_delete_pattern(f"entity_all:{table_name}:*")
        _cache_delete_pattern(f"entity:{table_name}:*")

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

        # Invalidate caches for this table
        _cache_delete_pattern(f"entity_records:{table_name}:*")
        _cache_delete_pattern(f"entity_all:{table_name}:*")
        _cache_delete_pattern(f"entity:{table_name}:*")

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"message": f"Record updated in {table_name} where {pk_name}={pk_value}."}
    except SQLAlchemyError as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.put("/{app}/updrepoentity/{table_name}/{pk_name}/{pk_value}")
async def update_record(table_name: str, pk_name: str, pk_value: str, request: Request, app: str):
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

        # Invalidate caches for this table
        _cache_delete_pattern(f"entity_records:{table_name}:*")
        _cache_delete_pattern(f"entity_all:{table_name}:*")
        _cache_delete_pattern(f"entity:{table_name}:*")

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"message": f"Record updated in {table_name} where {pk_name}={pk_value}."}
    except SQLAlchemyError as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()