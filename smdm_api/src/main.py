from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from src.api.super_repo import router as super_repo_router
from src.api.repo import router as repo_router
from src.api.db import router as db_router
from src.db.database import connect_to_db, disconnect_from_db
import logging
import sys

# Basic logging to stdout so API calls and app logs appear in the terminal
root_logger = logging.getLogger()
if not root_logger.handlers:
    handler = logging.StreamHandler(stream=sys.stdout)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
root_logger.setLevel(logging.INFO)

# Make sure uvicorn loggers are not quieter than INFO
logging.getLogger("uvicorn.error").setLevel(logging.INFO)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger = logging.getLogger("smdm.api")
    logger.setLevel(logging.INFO)
    # ensure at least one handler so logs appear in child processes
    if not logger.handlers:
        logger.addHandler(logging.StreamHandler(stream=sys.stdout))

    msg_in = f"Incoming request: {request.method} {request.url}"
    logger.info(msg_in)
    response = await call_next(request)
    msg_out = f"Completed response: {request.method} {request.url} -> {response.status_code}"
    logger.info(msg_out)
    return response

@app.on_event("startup")
async def startup():
    connect_to_db()

@app.on_event("shutdown")
async def shutdown():
    disconnect_from_db()

app.include_router(super_repo_router)
app.include_router(repo_router)
app.include_router(db_router)