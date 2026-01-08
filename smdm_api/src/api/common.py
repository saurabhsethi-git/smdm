from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
import os
import json
import redis
from dotenv import load_dotenv

load_dotenv()

SUPER_REPO = os.getenv("SUPER_REPO")
DB_URL = os.getenv("DB_URL")
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
        except Exception:
            _redis_client = None
    return _redis_client

def cache_get(key):
    try:
        rc = get_redis_client()
        if rc:
            value = rc.get(key)
            if value:
                return json.loads(value)
    except Exception:
        pass
    return None

def cache_set(key, value, ttl=REDIS_TTL):
    try:
        rc = get_redis_client()
        if rc:
            rc.set(key, json.dumps(value), ex=ttl)
    except Exception:
        pass

def cache_delete_pattern(pattern):
    try:
        rc = get_redis_client()
        if rc:
            for k in rc.scan_iter(match=pattern):
                rc.delete(k)
    except Exception:
        pass

def get_db_session(app: str):
    engine = create_engine(DB_URL + app)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    if SessionLocal:
        return SessionLocal()
    else:
        raise HTTPException(status_code=500, detail="Database doesn't exist or not available")

def get_repo_db_session(app: str):
    engine = create_engine(DB_URL + app)
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
