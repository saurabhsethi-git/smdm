import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

/**
 * Reusable form component for create/update.
 * Exported so other pages (EntityPage) can import and reuse.
 */
export function EntityForm({ columns = [], initialValues = {}, pkField, onSubmit, onCancel, submitLabel = 'Save', submitting = false }) {
  const [values, setValues] = useState(() => {
    const initial = {};
    columns.forEach((c) => {
      initial[c] = Object.prototype.hasOwnProperty.call(initialValues, c) ? (initialValues[c] ?? '') : '';
    });
    return initial;
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    // update when initialValues or columns change
    const init = {};
    columns.forEach((c) => {
      init[c] = Object.prototype.hasOwnProperty.call(initialValues, c) ? (initialValues[c] ?? '') : '';
    });
    setValues(init);
    setError(null);
  }, [initialValues, columns]);

  const handleChange = (field, v) => setValues((p) => ({ ...p, [field]: v }));

  const handleSubmit = async (e) => {
    e && e.preventDefault();
    setError(null);
    try {
      const res = await onSubmit(values);
      if (!res || !res.ok) {
        setError(res && res.error ? res.error : 'Submit failed');
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  if (!columns || columns.length === 0) return <div style={{ color: '#666' }}>No fields available.</div>;

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16, border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      {columns.map((col) => (
        <div key={col} style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{col}</label>
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
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: submitting ? 'not-allowed' : 'pointer'
          }}
        >
          {submitting ? 'Saving...' : submitLabel}
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

function EntityDetails() {
  const { name, pk, repoName } = useParams(); // route: /entity/:name/record/:pk
  const navigate = useNavigate();
  const location = useLocation();
  const decoded = name ? decodeURIComponent(name) : '';
  const decodedRepo = repoName ? decodeURIComponent(repoName) : '';
  const pkValue = pk ? decodeURIComponent(pk) : '';
  const statePkField = location.state && location.state.pkField ? location.state.pkField : null;

  const [pkField, setPkField] = useState(statePkField);
  const [record, setRecord] = useState(null);
  const [loadingPk, setLoadingPk] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  // Fetch primary key if not provided via navigation state
  useEffect(() => {
    if (!decoded) return;
    if (statePkField) {
      setPkField(statePkField);
      return;
    }

    let mounted = true;
    (async () => {
      setLoadingPk(true);
      setError(null);
      try {
        const res = await fetch(`http://localhost:8000/${decodedRepo}/getentitypk/${encodeURIComponent(decoded)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`PK fetch failed (HTTP ${res.status}): ${text}`);
        }
        const json = await res.json();
        const field = json && json.result ? json.result : null;
        if (!field) throw new Error('Primary key field missing in response');
        if (!mounted) return;
        setPkField(field);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || String(err));
        setPkField(null);
      } finally {
        if (!mounted) return;
        setLoadingPk(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded, statePkField, decodedRepo]);

  // Fetch the single record
  useEffect(() => {
    if (!decoded || !pkValue) {
      setError('Missing entity name or primary key value');
      setLoadingRecord(false);
      return;
    }
    let mounted = true;
    (async () => {
      setLoadingRecord(true);
      setError(null);
      try {
        const res = await fetch(`http://localhost:8000/${decodedRepo}/getentity/${encodeURIComponent(decoded)}/${encodeURIComponent(pkValue)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Record fetch failed (HTTP ${res.status}): ${text}`);
        }
        const json = await res.json();
        const rec = json && Array.isArray(json.records) && json.records.length > 0 ? json.records[0] : (typeof json === 'object' && !Array.isArray(json) ? json : null);
        if (!mounted) return;
        setRecord(rec);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || String(err));
        setRecord(null);
      } finally {
        if (!mounted) return;
        setLoadingRecord(false);
      }
    })();
    return () => { mounted = false; };
  }, [decoded, pkValue, decodedRepo]);

  const columns = record ? Object.keys(record) : [];

  // Submit handler for edit - uses /updentity/{table_name}/{pk_name}/{pk_value}
  const handleEditSubmit = async (values) => {
    if (!decoded || !pkField || !pkValue) {
      setEditError('Missing entity or primary key info');
      return { ok: false, error: 'Missing entity or primary key' };
    }
    setEditError(null);
    setEditSubmitting(true);
    try {
      const res = await fetch(
        `http://localhost:8000/${decodedRepo}/updentity/${encodeURIComponent(decoded)}/${encodeURIComponent(pkField)}/${encodeURIComponent(pkValue)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(values)
        }
      );
      const raw = await res.text();
      if (!res.ok) {
        const errMsg = raw || `HTTP ${res.status}`;
        setEditError(errMsg);
        return { ok: false, error: errMsg };
      }

      // refresh record
      try {
        const recRes = await fetch(`http://localhost:8000/${decodedRepo}/getentity/${encodeURIComponent(decoded)}/${encodeURIComponent(pkValue)}`);
        if (recRes.ok) {
          const recJson = await recRes.json();
          const updated = recJson && Array.isArray(recJson.records) && recJson.records.length > 0 ? recJson.records[0] : (typeof recJson === 'object' && !Array.isArray(recJson) ? recJson : null);
          setRecord(updated || values);
        } else {
          setRecord(values);
        }
      } catch (e) {
        setRecord(values);
      }

      setEditing(false);
      return { ok: true, data: raw ? JSON.parse(raw) : {} };
    } catch (err) {
      const msg = err.message || String(err);
      setEditError(msg);
      return { ok: false, error: msg };
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Entity Record Details</h3>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => navigate(-1)}
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
          </div>
        </div>

        <div>
          <button
            onClick={() => { setEditing((s) => !s); setEditError(null); }}
            disabled={loadingRecord}
            style={{
              padding: '8px 12px',
              background: editing ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              opacity: loadingRecord ? 0.5 : 1
            }}
          >
            {editing ? 'Close Edit' : 'Edit Record'}
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 0 }}>Record Details</h2>
      <p><strong>Entity:</strong> {decoded}</p>
      <p><strong>Primary Key Field:</strong> {pkField || '—'}</p>

      {(loadingPk || loadingRecord) && <div>Loading...</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}

      {!loadingRecord && !error && (
        <div>
          {!record ? (
            <p style={{ color: '#666' }}>No record found</p>
          ) : (
            <>
              <form style={{ marginTop: 16 }}>
                {Object.entries(record).map(([key, val]) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>{key}</label>
                    <input
                      type="text"
                      value={val === null ? '' : (typeof val === 'object' ? JSON.stringify(val) : String(val))}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        background: '#f9f9f9'
                      }}
                    />
                  </div>
                ))}
              </form>

              {editing && (
                <div>
                  <h4 style={{ marginTop: 16 }}>Edit Record</h4>
                  <EntityForm
                    columns={columns}
                    initialValues={record}
                    pkField={pkField}
                    onSubmit={handleEditSubmit}
                    onCancel={() => setEditing(false)}
                    submitLabel="Save"
                    submitting={editSubmitting}
                  />
                  {editError && <div style={{ color: 'red', marginTop: 8 }}>{editError}</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EntityDetails;