from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.super_repo import router as super_repo_router
from src.api.repo import router as repo_router
from src.api.db import router as db_router
from src.db.database import connect_to_db, disconnect_from_db

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    connect_to_db()

@app.on_event("shutdown")
async def shutdown():
    disconnect_from_db()

app.include_router(super_repo_router)
app.include_router(repo_router)
app.include_router(db_router)