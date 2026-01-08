from fastapi import APIRouter
from .super_repo import router as super_repo_router
from .repo import router as repo_router
from .db import router as db_router

router = APIRouter()

router.include_router(super_repo_router)
router.include_router(repo_router)
router.include_router(db_router)