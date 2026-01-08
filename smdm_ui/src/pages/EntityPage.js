import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function findPkField(row, entityName) {
  if (!row || typeof row !== 'object') return null;
  const singular = entityName.replace(/s$/, '');
  const keys = Object.keys(row);

  // Common candidates
  const candidates = [
    'id',
    `${singular}_id`,
    `${entityName}_id`,
    ...keys.filter((k) => k.endsWith('_id'))
  ];

  for (const k of candidates) {
    if (k in row && (row[k] !== null && row[k] !== undefined)) return k;
  }

  for (const k of keys) {
    if (typeof row[k] === 'number' || typeof row[k] === 'string') return k;
  }

  return null;
}

/**
 * Reusable form component to create/update entity records.
 */
function EntityForm({ columns, initialValues = {}, pkField, onSubmit, onCancel, submitLabel = 'Submit' }) {
  const [values, setValues] = useState(() => {
    const initial = {};
    (columns || []).forEach((c) => {
      if (initialValues && Object.prototype.hasOwnProperty.call(initialValues, c)) {
        initial[c] = initialValues[c] ?? '';
      } else {
        initial[c] = '';
      }
    });
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      setValues((prev) => {
        const copy = { ...prev };
        columns.forEach((c) => {
          if (Object.prototype.hasOwnProperty.call(initialValues, c)) copy[c] = initialValues[c] ?? '';
        });
        return copy;
      });
    }
  }, [initialValues, columns]);

  const handleChange = (field, newValue) => {
    setValues((prev) => ({ ...prev, [field]: newValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await onSubmit(values);
      if (!res.ok) {
        setSubmitError(res.error || 'Failed to submit');
      }
    } catch (err) {
      setSubmitError(err.message || 'Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!columns || columns.length === 0) {
    return <div style={{ color: '#666' }}>No fields available for this form.</div>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16, border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
      {submitError && <div style={{ color: 'red', marginBottom: 8 }}>{submitError}</div>}
      {columns.map((col) => (
        <div key={col} style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: '600' }}>{col}</label>
          <input
            type="text"
            value={values[col] === null || values[col] === undefined ? '' : String(values[col])}
            onChange={(e) => handleChange(col, e.target.value)}
            disabled={col === pkField}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 4,
              border: '1px solid #ddd',
              background: col === pkField ? '#f3f3f3' : 'white'
            }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '8px 12px',
            background: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: submitting ? 'not-allowed' : 'pointer'
          }}
        >
          {submitting ? 'Submitting...' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '8px 12px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: submitting ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function EntityPage() {
  const { name, repoName } = useParams();
  const navigate = useNavigate();
  const decoded = name ? decodeURIComponent(name) : '';
  const decodedRepo = repoName ? decodeURIComponent(repoName) : '';
  const [data, setData] = useState([]);
  const [pkField, setPkField] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingPk, setLoadingPk] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set()); // track selected row indices
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // fetchRecords refactor so we can call it on create success
  const fetchRecords = async () => {
    if (!decoded) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8000/${decodedRepo}/getentity/${encodeURIComponent(decoded)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const records = json && Array.isArray(json.records)
        ? json.records
        : Array.isArray(json)
          ? json
          : json.data && Array.isArray(json.data) ? json.data : [];
      setData(records);
      setSelectedRows(new Set()); // clear selections on refresh
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // Fetch the primary key field for this entity
  useEffect(() => {
    if (!decoded) return;
    if (!decodedRepo) return;
    let mounted = true;
    setLoadingPk(true);
    (async () => {
      try {
        const res = await fetch(`http://localhost:8000/${decodedRepo}/getentitypk/${encodeURIComponent(decoded)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!mounted) return;
        if (json && typeof json.result === 'string') {
          setPkField(json.result);
        } else {
          setPkField(null);
        }
      } catch (err) {
        if (!mounted) return;
        console.warn('Error fetching PK field:', err);
        setPkField(null);
      } finally {
        if (!mounted) return;
        setLoadingPk(false);
      }
    })();
    return () => { mounted = false; };
  }, [decoded, decodedRepo]);

  // Fetch entity records (initial + refresh)
  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded]);

  const handleRowClick = (row) => {
    const field = pkField || findPkField(row, decoded);
    if (!field) {
      console.warn('Primary key not found for row, cannot navigate to details', row);
      return;
    }
    const pkValue = row[field];
    if (pkValue === undefined || pkValue === null) {
      console.warn('Primary key value missing from row', field, row);
      return;
    }
    navigate(`/app/${encodeURIComponent(decodedRepo)}/entity/${encodeURIComponent(decoded)}/record/${encodeURIComponent(String(pkValue))}`, { state: { pkField: field } });
  };

  const handleCheckboxChange = (idx) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  const handleCreate = async (values) => {
    try {
      const res = await fetch(`http://localhost:8000/${decodedRepo}/addentity/${encodeURIComponent(decoded)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(values)
      });
      const raw = await res.text();
      if (!res.ok) {
        console.error('Create record failed', res.status, raw);
        return { ok: false, error: raw || `HTTP ${res.status}` };
      }
      let json;
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch (err) {
        json = {};
      }
      await fetchRecords();
      setShowForm(false);
      return { ok: true, data: json };
    } catch (err) {
      console.error('Create record error', err);
      return { ok: false, error: err.message || String(err) };
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) {
      setDeleteError('No rows selected');
      return;
    }

    if (!window.confirm(`Delete ${selectedRows.size} record(s)? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    const rowsToDelete = Array.from(selectedRows).map((idx) => data[idx]);
    let successCount = 0;
    const errors = [];

    for (const row of rowsToDelete) {
      const field = pkField || findPkField(row, decoded);
      if (!field) {
        errors.push(`Row missing primary key: ${JSON.stringify(row)}`);
        continue;
      }

      const pkValue = row[field];
      if (pkValue === undefined || pkValue === null) {
        errors.push(`Row missing primary key value: ${JSON.stringify(row)}`);
        continue;
      }

      try {
        const res = await fetch(
          `http://localhost:8000/${decodedRepo}/rementity/${encodeURIComponent(decoded)}/${encodeURIComponent(field)}/${encodeURIComponent(String(pkValue))}`,
          { method: 'DELETE' }
        );
        const raw = await res.text();
        if (!res.ok) {
          errors.push(`Failed to delete row (${pkField}=${pkValue}): ${raw || `HTTP ${res.status}`}`);
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push(`Error deleting row (${pkField}=${pkValue}): ${err.message}`);
      }
    }

    setDeleting(false);

    if (errors.length > 0) {
      setDeleteError(`${successCount} deleted, ${errors.length} failed: ${errors.join('; ')}`);
    } else {
      setDeleteError(null);
    }

    // refresh records
    await fetchRecords();
  };

  const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div style={{ padding: 24 }}>
      <p style={{ marginTop: 16 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '8px 12px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          &larr; Back
        </button>
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Entity: {decoded}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowForm((s) => !s)}
            disabled={loading}
            style={{
              padding: '8px 12px',
              background: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            {showForm ? 'Close Form' : 'Create Record'}
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedRows.size === 0 || deleting}
            style={{
              padding: '8px 12px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: selectedRows.size === 0 || deleting ? 'not-allowed' : 'pointer',
              opacity: selectedRows.size === 0 || deleting ? 0.5 : 1
            }}
          >
            {deleting ? `Deleting (${selectedRows.size})...` : `Delete Selected (${selectedRows.size})`}
          </button>
        </div>
      </div>

      {loadingPk ? <div>Loading primary key...</div> : (pkField ? <div>Primary key: <strong>{pkField}</strong></div> : <div style={{ color: '#666' }}>Primary key not found.</div>)}

      {showForm && (
        <EntityForm
          columns={columns}
          initialValues={{}}
          pkField={pkField}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          submitLabel="Create"
        />
      )}

      {deleteError && <div style={{ color: 'red', marginTop: 12 }}>Delete Error: {deleteError}</div>}

      {loading && <div>Loading data...</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}

      {!loading && !error && (
        <div>
          <h3>Records ({data.length})</h3>
          {data.length === 0 ? (
            <p style={{ color: '#666' }}>No records found</p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ textAlign: 'center', padding: '8px', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={selectedRows.size === data.length && data.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(new Set(data.map((_, idx) => idx)));
                          } else {
                            setSelectedRows(new Set());
                          }
                        }}
                      />
                    </th>
                    {Object.keys(data[0]).map((key) => (
                      <th key={key} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ textAlign: 'center', padding: '8px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(idx)}
                          onChange={() => handleCheckboxChange(idx)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      {Object.keys(data[0]).map((colKey, colIdx) => {
                        const value = row[colKey];
                        return (
                          <td
                            key={colIdx}
                            style={{ padding: '8px', borderBottom: '1px solid #eee', cursor: 'pointer' }}
                            onClick={() => handleRowClick(row)}
                          >
                            {value === null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EntityPage;