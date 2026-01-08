# FastAPI PostgreSQL Table Copy

This project is a FastAPI application that allows users to copy tables from a specified PostgreSQL source database and create new tables with a specific naming convention.

## Project Structure

```
fastapi-postgres-table-copy
├── src
│   ├── main.py               # Entry point of the FastAPI application
│   ├── api
│   │   └── endpoints.py      # Defines the API endpoints
│   ├── db
│   │   └── database.py       # Handles database connections and operations
│   └── models
│       └── __init__.py       # Placeholder for data models
├── requirements.txt          # Project dependencies
└── README.md                 # Project documentation
```

## Setup Instructions

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd fastapi-postgres-table-copy
   ```

2. **Create a virtual environment:**
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install the required dependencies:**
   ```
   pip install -r requirements.txt
   ```

4. **Configure the database connection:**
   Update the database connection settings in `src/db/database.py` to match your PostgreSQL setup.

## Usage

To run the FastAPI application, execute the following command:

```
uvicorn src.main:app --reload
```

You can then access the API documentation at `http://127.0.0.1:8000/docs`.

## API Endpoint

### POST /copy-tables

This endpoint accepts parameters for the source PostgreSQL database and copies the tables to new tables prefixed with "rp_". The new tables will have the following columns:

- `field_name`: Contains the column names of the source database table.
- `label_name`: Set to null.
- `visible`: Set to TRUE.

### Example Request

```json
{
  "db_name": "source_database",
  "user": "username",
  "password": "password",
  "host": "localhost",
  "port": 5432
}
```

## License

This project is licensed under the MIT License. See the LICENSE file for more details.