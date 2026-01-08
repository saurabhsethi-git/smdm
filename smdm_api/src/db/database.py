from sqlalchemy import create_engine, MetaData, Table, Column, String, Boolean
from sqlalchemy.exc import SQLAlchemyError
import os

#DATABASE_URL = "postgresql://avnadmin:AVNS_vT7E3n5x9mZnvQMZLuu@pgtest-sourabh444-1437.e.aivencloud.com:15561/smdm"  # Update with your database URL
DATABASE_URL = os.getenv("SUPER_REPO")

ENGINE = None

def get_engine():
    global ENGINE
    print("Connecting to database...")
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL is not set.")
    print(f"Using database URL: {DATABASE_URL}")
    # Create and return the SQLAlchemy engine
    ENGINE = create_engine(DATABASE_URL)
    return ENGINE

def connect_to_db():
    return get_engine()

def disconnect_from_db():
    global ENGINE
    if ENGINE is not None:
        try:
            ENGINE.dispose()
        finally:
            ENGINE = None

def create_tables_from_source(source_db_url):
    engine = create_engine(source_db_url)
    metadata = MetaData(bind=engine)

    try:
        metadata.reflect()
        with engine.connect() as connection:
            for table_name in metadata.tables.keys():
                new_table_name = f"rp_{table_name}"
                new_table = Table(new_table_name, metadata,
                                  Column('field_name', String),
                                  Column('label_name', String, nullable=True),
                                  Column('visible', Boolean, default=True))
                new_table.create(connection)
    except SQLAlchemyError as e:
        print(f"An error occurred: {e}")