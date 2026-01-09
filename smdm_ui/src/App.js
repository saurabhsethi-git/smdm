import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import logo from './logo.svg';
import './App.css';
import Launcher from './pages/Launcher';
import Admin from './pages/Admin';
import SetupRepo from './pages/SetupRepo';

// Helper function to find primary key field
function findPkField(row, entityName) {
  if (!row || typeof row !== 'object') return null;
  const singular = entityName.replace(/s$/, '');
  const keys = Object.keys(row);

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

// Reusable form component
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
      if (!res || !res.ok) {
        setSubmitError(res && res.error ? res.error : 'Submit failed');
      }
      // If submission was successful, don't reset - let parent handle the navigation
    } catch (err) {
      setSubmitError(err.message || String(err));
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

// Right pane component - handles list, details, and edit views
function RightPane({ entityName, repoName, view, selectedRecord, selectedPkField, onViewChange }) {
  const [data, setData] = useState([]);
  const [pkField, setPkField] = useState(selectedPkField);
  const [loading, setLoading] = useState(true);
  const [loadingPk, setLoadingPk] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [currentRecord, setCurrentRecord] = useState(selectedRecord);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState(null);

  const fetchRecords = async () => {
    if (!entityName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:8000/${repoName}/getentity/${encodeURIComponent(entityName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const records = json && Array.isArray(json.records)
        ? json.records
        : Array.isArray(json)
          ? json
          : json.data && Array.isArray(json.data) ? json.data : [];
      setData(records);
      setSelectedRows(new Set());
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!entityName) return;
    let mounted = true;
    setLoadingPk(true);
    (async () => {
      try {
        const res = await fetch(`http://localhost:8000/${repoName}/getentitypk/${encodeURIComponent(entityName)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!mounted) return;
        const field = json && typeof json.result === 'string' ? json.result : null;
        setPkField(field);
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
  }, [entityName, repoName]);

  useEffect(() => {
    fetchRecords();
    onViewChange('list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName]);

  useEffect(() => {
    setCurrentRecord(selectedRecord);
  }, [selectedRecord]);

  const handleRowClick = (row) => {
    const field = pkField || findPkField(row, entityName);
    if (!field) {
      console.warn('Primary key not found for row', row);
      return;
    }
    onViewChange('details', row, field);
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

  const handleCreateClick = () => {
    onViewChange('create');
  };

  const handleCreate = async (values) => {
    try {
      const res = await fetch(`http://localhost:8000/${repoName}/addentity/${encodeURIComponent(entityName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(values)
      });
      const raw = await res.text();
      if (!res.ok) {
        return { ok: false, error: raw || `HTTP ${res.status}` };
      }
      
      // Fetch fresh records after successful creation
      await fetchRecords();
      
      // Switch back to list view
      onViewChange('list');
      return { ok: true, data: raw ? JSON.parse(raw) : {} };
    } catch (err) {
      console.error('Create record error:', err);
      return { ok: false, error: err.message || String(err) };
    }
  };

  const handleEditSubmit = async (values) => {
    if (!entityName || !pkField) {
      setEditError('Missing entity or primary key info');
      return { ok: false, error: 'Missing entity or primary key' };
    }
    const pkValue = currentRecord && pkField ? currentRecord[pkField] : null;
    if (!pkValue) {
      setEditError('Missing primary key value');
      return { ok: false, error: 'Missing primary key value' };
    }

    setEditError(null);
    setEditSubmitting(true);
    try {
      const res = await fetch(
        `http://localhost:8000/${repoName}/updentity/${encodeURIComponent(entityName)}/${encodeURIComponent(pkField)}/${encodeURIComponent(pkValue)}`,
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

      setCurrentRecord(values);
      // Refresh records list after successful update
      await fetchRecords();
      onViewChange('details', values, pkField);
      return { ok: true, data: raw ? JSON.parse(raw) : {} };
    } catch (err) {
      const msg = err.message || String(err);
      setEditError(msg);
      return { ok: false, error: msg };
    } finally {
      setEditSubmitting(false);
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
      const field = pkField || findPkField(row, entityName);
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
          `http://localhost:8000/${repoName}/rementity/${encodeURIComponent(entityName)}/${encodeURIComponent(field)}/${encodeURIComponent(String(pkValue))}`,
          { method: 'DELETE' }
        );
        const raw = await res.text();
        if (!res.ok) {
          errors.push(`Failed to delete row (${field}=${pkValue}): ${raw || `HTTP ${res.status}`}`);
        } else {
          successCount++;
        }
      } catch (err) {
        errors.push(`Error deleting row (${field}=${pkValue}): ${err.message}`);
      }
    }

    setDeleting(false);

    if (errors.length > 0) {
      setDeleteError(`${successCount} deleted, ${errors.length} failed: ${errors.join('; ')}`);
    } else {
      setDeleteError(null);
    }

    await fetchRecords();
  };

  const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

  // View: List
  if (view === 'list') {
    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Entity: {entityName}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreateClick}
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
              + Create Record
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd', background: '#f8f9fa' }}>
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

  // View: Details
  if (view === 'details') {
    const pkValue = currentRecord && pkField ? currentRecord[pkField] : null;
    const recordColumns = currentRecord ? Object.keys(currentRecord) : [];

    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>Record Details</h2>
            <button
              onClick={() => onViewChange('list')}
              style={{
                marginTop: 8,
                padding: '8px 12px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              ← Back to Records
            </button>
          </div>

          <button
            onClick={() => onViewChange('edit')}
            style={{
              padding: '8px 12px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            ✎ Edit Record
          </button>
        </div>

        <p style={{ marginBottom: 16 }}><strong>Entity:</strong> {entityName} | <strong>Primary Key Field:</strong> {pkField || '—'}</p>

        {currentRecord ? (
          <form style={{ marginTop: 16 }}>
            {Object.entries(currentRecord).map(([key, val]) => (
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
        ) : (
          <p style={{ color: '#666' }}>No record selected</p>
        )}
      </div>
    );
  }

  // View: Create/Edit
  if (view === 'create' || view === 'edit') {
    const isCreate = view === 'create';
    // For create: exclude the PK field from form columns; for edit: include all columns
    const allFormColumns = isCreate ? columns : (currentRecord ? Object.keys(currentRecord) : []);
    const formColumns = isCreate && pkField ? allFormColumns.filter(col => col !== pkField) : allFormColumns;
    const initialValues = isCreate ? {} : (currentRecord || {});

    return (
      <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
        <h2 style={{ margin: 0, marginBottom: 16 }}>{isCreate ? 'Create' : 'Edit'} Record</h2>
        <button
          onClick={() => onViewChange(isCreate ? 'list' : 'details', currentRecord, pkField)}
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>

        {editError && <div style={{ color: 'red', marginBottom: 12 }}>{editError}</div>}

        <EntityForm
          columns={formColumns}
          initialValues={initialValues}
          pkField={isCreate ? null : pkField}
          onSubmit={isCreate ? handleCreate : handleEditSubmit}
          onCancel={() => onViewChange(isCreate ? 'list' : 'details', currentRecord, pkField)}
          submitLabel={isCreate ? 'Create' : 'Save'}
        />
      </div>
    );
  }

  return <div style={{ padding: 24 }}>Select an entity to view records</div>;
}

function MainLayout({ entities, loading, error, isRepoReady, isRepoActive, refreshPage, repoSetup, handleClick, repoName }) {
  const navigate = useNavigate();
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [rightPaneView, setRightPaneView] = useState('list'); // 'list', 'details', 'create', 'edit'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedPkField, setSelectedPkField] = useState(null);

  const handleEntityClick = (entityLabel) => {
    setSelectedEntity(entityLabel);
    setRightPaneView('list');
    setSelectedRecord(null);
    setSelectedPkField(null);
  };

  const handleViewChange = (view, record = null, pkField = null) => {
    setRightPaneView(view);
    if (record) setSelectedRecord(record);
    if (pkField) setSelectedPkField(pkField);
  };

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #e0e0e0', padding: '16px 24px', background: '#f8f9fa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} className="App-logo" alt="logo" style={{ width: 40, height: 40 }} />
          <h1 style={{ margin: 0, fontSize: 24 }}>Data Management System</h1>
          <span style={{ marginLeft: 'auto', color: '#666' }}>Repo: <strong>{repoName}</strong></span>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              background: '#f0f0f0',
              cursor: 'pointer',
              borderRadius: 4,
              fontWeight: 'bold'
            }}
          >
            ← Back to Apps
          </button>
        </div>
      </header>

      {/* Main Content Area - 2 Panes */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Pane - Fixed */}
        <aside style={{ width: 260, borderRight: '1px solid #e0e0e0', padding: 16, boxSizing: 'border-box', overflowY: 'auto', background: '#f9f9f9' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Entities</h3>
          {loading && <div>Loading...</div>}
          {isRepoReady === 1 && isRepoActive && error && <div style={{ color: 'red' }}>Error: {error}</div>}
          {!loading && !error && isRepoReady === 1 && isRepoActive && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {entities.length === 0 && <li style={{ color: '#666' }}>No entities found</li>}
              {entities.map((item, idx) => {
                const label = typeof item === 'string'
                  ? item.replace(/^rp_/, '')
                  : (item.name || item.table || item.id || JSON.stringify(item));
                const key = typeof item === 'string' ? item : idx;
                const isSelected = selectedEntity === label;
                return (
                  <li key={key} style={{ padding: '4px 0', marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleEntityClick(label)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: isSelected ? '2px solid #007bff' : '1px solid #ddd',
                        background: isSelected ? '#e7f3ff' : '#ffffff',
                        cursor: 'pointer',
                        borderRadius: 4,
                        fontWeight: isSelected ? 'bold' : 'normal',
                        color: isSelected ? '#007bff' : '#333',
                        transition: 'all 0.2s'
                      }}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && !error && isRepoReady === 1 && !isRepoActive && (
            <button
              type="button"
              onClick={handleClick}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: '1px solid transparent',
                background: 'transparent',
                cursor: !isRepoActive ? 'pointer' : 'not-allowed',
                borderRadius: 4,
                opacity: !isRepoActive ? 1 : 0.5
              }}
              title={!isRepoActive ? 'Setup Repo' : 'Repo not ready'}
            >
              Setup Repo
            </button>
          )}
          {repoSetup === 1 && <button onClick={refreshPage} style={{ marginTop: 16, width: '100%', padding: '8px 12px' }}>Refresh Page</button>}
        </aside>

        {/* Right Pane - Dynamic Content */}
        <main style={{ flex: 1, overflow: 'hidden', background: '#fff' }}>
          {!selectedEntity ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 16 }}>
              <p>Select an entity from the left to view records</p>
            </div>
          ) : (
            <RightPane
              entityName={selectedEntity}
              repoName={repoName}
              view={rightPaneView}
              selectedRecord={selectedRecord}
              selectedPkField={selectedPkField}
              onViewChange={handleViewChange}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function AppDashboard() {
  const { repoName } = useParams();
  const decodedRepo = repoName ? decodeURIComponent(repoName) : '';
  const [isRepoReady, setIsRepoReady] = useState(null);
  const [isRepoActive, setIsRepoActive] = useState(null);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [repoSetup, setRepoSetup] = useState(null);

  const refreshPage = () => {
    window.location.reload();
  };

  const handleClick = async () => {
    try {
      const res = await fetch(`http://localhost:8000/${decodedRepo}/setuprepo`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      });

      const raw = await res.text();

      if (!res.ok) {
        console.error('Setup repo request failed', res.status, raw);
        setRepoSetup(0);
        return;
      }

      let data;
      try { data = raw ? JSON.parse(raw) : {}; } catch (err) {
        console.warn('setup_repo returned non-JSON body:', raw);
        data = {};
      }

      const setupStatus = (data && typeof data.status === 'number') ? data.status : 0;
      setRepoSetup(setupStatus);

      try {
        const statusRes = await fetch(`http://localhost:8000/getrepo/${decodedRepo}`);
        const statusText = await statusRes.text();
        let statusData;
        try { statusData = statusText ? JSON.parse(statusText) : {}; } catch (err) {
          statusData = {};
        }
        const status = (statusData && typeof statusData.repo_status === 'number') ? statusData.repo_status : 0;
        const activeStatus = (statusData && typeof statusData.active_status === 'boolean') ? statusData.active_status : false;
        setIsRepoReady(status);
        setIsRepoActive(activeStatus);
      } catch (err) {
        console.error('Error fetching repo status:', err);
        setIsRepoReady(0);
        setIsRepoActive(false);
      }
    } catch (error) {
      console.error("Error calling setup_repo API:", error);
      setRepoSetup(0);
      setIsRepoActive(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetch(`http://localhost:8000/${decodedRepo}/entities`)
      .then((res) => {
        if (!res.ok) if (res.status === 500);
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const source = data && Array.isArray(data.tables) ? data.tables : data;
        const list = Array.isArray(source) ? source.map((item) => item) : [];
        setEntities(list);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [decodedRepo]);

  useEffect(() => {
    let mounted = true;
    fetch(`http://localhost:8000/getrepo/${decodedRepo}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const status = (data && typeof data.repo_status === 'number') ? data.repo_status : 0;
        const activeStatus = (data && typeof data.active_status === 'boolean') ? data.active_status : false;
        setIsRepoReady(status);
        setIsRepoActive(activeStatus);
      })
      .catch((err) => {
        if (!mounted) return;
        setIsRepoReady(0);
        setIsRepoActive(false);
      });
    return () => { mounted = false; };
  }, [decodedRepo]);

  return (
    <MainLayout
      entities={entities}
      loading={loading}
      error={error}
      isRepoReady={isRepoReady}
      isRepoActive={isRepoActive}
      repoSetup={repoSetup}
      refreshPage={refreshPage}
      handleClick={handleClick}
      repoName={decodedRepo}
    />
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Launcher />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/setup-repo/:repoName" element={<SetupRepo />} />
      <Route path="/app/:repoName" element={<AppDashboard />} />
    </Routes>
  );
}

export default App;