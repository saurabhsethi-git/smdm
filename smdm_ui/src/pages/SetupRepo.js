import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function SetupRepo() {
  const { repoName } = useParams();
  const navigate = useNavigate();
  const decodedRepo = repoName ? decodeURIComponent(repoName) : '';

  const [activeStatus, setactiveStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState(null);

  const [entities, setEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [entitiesError, setEntitiesError] = useState(null);

  const [selectedEntity, setSelectedEntity] = useState(null);
  const [entityFields, setEntityFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldsError, setFieldsError] = useState(null);

  // Bulk update / selection state
  const [selectedRecords, setSelectedRecords] = useState([]); // will store pk values
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkEdits, setBulkEdits] = useState({}); // pkValue -> { label, visible, reference }
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUpdateResults, setBulkUpdateResults] = useState(null);
  const [editingCell, setEditingCell] = useState({ pk: null, key: null });

  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [setupError, setSetupError] = useState(null);

  // Fetch repo status
  useEffect(() => {
    if (!decodedRepo) return;
    let mounted = true;
    setLoadingStatus(true);
    setStatusError(null);
    fetch(`http://localhost:8000/getrepo/${encodeURIComponent(decodedRepo)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!mounted) return;
        const status = json && typeof json.active_status === 'boolean' ? json.active_status : false;
        setactiveStatus(status);
      })
      .catch((err) => {
        if (!mounted) return;
        setStatusError(err.message || String(err));
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingStatus(false);
      });
    return () => { mounted = false; };
  }, [decodedRepo]);

  // Fetch entities if repo is active
  useEffect(() => {
    if (!decodedRepo || !activeStatus) return;
    let mounted = true;
    setLoadingEntities(true);
    setEntitiesError(null);
    fetch(`http://localhost:8000/${encodeURIComponent(decodedRepo)}/entities`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!mounted) return;
        const source = json && Array.isArray(json.tables) ? json.tables : (Array.isArray(json) ? json : []);
        setEntities(source);
      })
      .catch((err) => {
        if (!mounted) return;
        setEntitiesError(err.message || String(err));
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingEntities(false);
      });
    return () => { mounted = false; };
  }, [decodedRepo, activeStatus]);

  // Fetch entity fields when entity is selected
  const handleEntitySelect = async (entityName) => {
    if (!decodedRepo || !entityName) return;
    setSelectedEntity(entityName);
    setLoadingFields(true);
    setFieldsError(null);
    try {
      const res = await fetch(
        `http://localhost:8000/${encodeURIComponent(decodedRepo)}/getrepoentity/${encodeURIComponent(entityName)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Expecting json to be array of fields or { fields: [...] }
      const fields = json && Array.isArray(json.columns) ? json.columns : [];
      setEntityFields(fields);
      // Debug: log detected keys
      if (fields && fields.length > 0) {
        const sample = fields[0];
        console.log('Entity Fields Keys:', Object.keys(sample));
        console.log('Detected labelKey:', detectLabelKey(sample));
        console.log('Detected visibleKey:', detectVisibleKey(sample));
        console.log('Detected referenceKey:', detectReferenceKey(sample));
      }
      // clear selection when new entity is loaded
      setSelectedRecords([]);
      setShowBulkEdit(false);
      setBulkEdits({});
      setBulkUpdateResults(null);
    } catch (err) {
      setFieldsError(err.message || String(err));
      setEntityFields([]);
    } finally {
      setLoadingFields(false);
    }
  };

  // Helpers to identify keys in field objects
  // PK is always 'id'

  const detectLabelKey = (obj) => {
    const candidates = ['label_name', 'label', 'display_label', 'labelName', 'field_label', 'display_name', 'column_label', 'columnLabel'];
    for (const c of candidates) if (c in obj) return c;
    // fallback: any string-like key that isn't likely a pk or type marker
    const exclude = ['field_name', 'id', 'name', 'type', 'is_pk', 'visible', 'reference_picker_attribute', 'reference_picker', 'reference'];
    return Object.keys(obj).find(k => typeof obj[k] === 'string' && !exclude.includes(k)) || null;
  };

  const detectReferenceKey = (obj) => {
    const candidates = ['reference_picker_attribute', 'reference_picker', 'reference_attribute', 'ref_picker', 'reference'];
    for (const c of candidates) if (c in obj) return c;
    return Object.keys(obj).find(k => k.toLowerCase().includes('reference')) || null;
  };

  const detectVisibleKey = (obj) => {
    if ('visible' in obj) return 'visible';
    return Object.keys(obj).find(k => k.toLowerCase() === 'visible') || null;
  };

  const toggleSelect = (pkValue) => {
    setSelectedRecords(prev => {
      if (prev.includes(pkValue)) return prev.filter(v => v !== pkValue);
      return [...prev, pkValue];
    });
  };

  const updateEntityFieldValue = (pkValue, key, newValue) => {
    setEntityFields(prev => prev.map(item => {
      const curPk = item.id || null;
      if (curPk === pkValue) {
        return { ...item, [key]: newValue };
      }
      return item;
    }));
  };

  const openBulkEdit = () => {
    if (!selectedRecords || selectedRecords.length === 0) return;
    // initialize bulkEdits per selected record from entityFields
    const pkKey = 'id';
    const labelKey = entityFields && entityFields.length > 0 ? detectLabelKey(entityFields[0]) : null;
    const refKey = entityFields && entityFields.length > 0 ? detectReferenceKey(entityFields[0]) : null;
    const visKey = entityFields && entityFields.length > 0 ? detectVisibleKey(entityFields[0]) : null;

    const edits = {};
    for (const rec of entityFields) {
      const pk = rec[pkKey] || null;
      if (pk && selectedRecords.includes(pk)) {
        edits[pk] = {
          label: labelKey ? rec[labelKey] : '',
          visible: visKey ? !!rec[visKey] : false,
          reference: refKey ? (rec[refKey] || '') : ''
        };
      }
    }
    setBulkEdits(edits);
    setShowBulkEdit(true);
    setBulkUpdateResults(null);
  };

  const startEditingCell = (pk, key) => {
    setEditingCell({ pk, key });
  };

  const stopEditingCell = () => {
    setEditingCell({ pk: null, key: null });
  };

  const handleCellInputBlur = (pk, key, e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    updateEntityFieldValue(pk, key, val);
    stopEditingCell();
  };

  const handleCellInputKeyDown = (pk, key, e) => {
    if (e.key === 'Enter') {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      updateEntityFieldValue(pk, key, val);
      stopEditingCell();
    }
    if (e.key === 'Escape') {
      stopEditingCell();
    }
  };

  const handleBulkChange = (pk, field, value) => {
    setBulkEdits(prev => ({ ...prev, [pk]: { ...prev[pk], [field]: value } }));
  };

  const handleBulkUpdateSubmit = async () => {
    if (!selectedRecords || selectedRecords.length === 0) return;
    setBulkUpdating(true);
    setBulkUpdateResults(null);
    const results = [];
    const pkKey = 'id';
    const labelKey = entityFields && entityFields.length > 0 ? detectLabelKey(entityFields[0]) : null;
    const refKey = entityFields && entityFields.length > 0 ? detectReferenceKey(entityFields[0]) : null;
    const visKey = entityFields && entityFields.length > 0 ? detectVisibleKey(entityFields[0]) : null;

    for (const pkValue of selectedRecords) {
      try {
        // Find the record with this pkValue using pkKey
        const rec = entityFields.find(r => r[pkKey] === pkValue) || {};
        const edit = bulkEdits[pkValue] || {};
        const payload = {};
        
        // Helper to convert empty string to null
        const getNullableValue = (val) => (val === '' || val === null || val === undefined) ? null : val;
        
        if (labelKey) {
          const labelVal = (typeof rec[labelKey] !== 'undefined') ? rec[labelKey] : edit.label;
          payload[labelKey] = getNullableValue(labelVal);
        }
        if (refKey) {
          const refVal = (typeof rec[refKey] !== 'undefined') ? rec[refKey] : edit.reference;
          payload[refKey] = getNullableValue(refVal);
        }
        if (visKey) {
          payload[visKey] = (typeof rec[visKey] !== 'undefined') ? !!rec[visKey] : !!edit.visible;
        }

        const app = decodedRepo;
        const table = selectedEntity;
        const pkValueInt = typeof pkValue === 'string' ? parseInt(pkValue, 10) : pkValue;
        const url = `http://localhost:8000/${encodeURIComponent(app)}/updrepoentity/${encodeURIComponent(table)}/${encodeURIComponent(pkKey)}/${pkValueInt}`;

        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
        results.push({ pk: pkValue, success: true });
      } catch (err) {
        results.push({ pk: pkValue, success: false, error: err.message || String(err) });
      }
    }

    setBulkUpdateResults(results);
    setBulkUpdating(false);
    // refresh fields
    await handleEntitySelect(selectedEntity);
    setShowBulkEdit(false);
    setSelectedRecords([]);
  };

  const handleSetupRepo = async () => {
    if (!decodedRepo) return;
    setSetupSubmitting(true);
    setSetupError(null);
    try {
      const res = await fetch(`http://localhost:8000/${encodeURIComponent(decodedRepo)}/setuprepo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `HTTP ${res.status}`);
      }
      // Success: refresh page to reload repo status
      window.location.reload();
    } catch (err) {
      setSetupError(err.message || String(err));
      setSetupSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 60, background: 'white', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', paddingLeft: 24, zIndex: 100 }}>
        <button
          onClick={() => navigate('/admin')}
          style={{
            padding: '8px 12px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          ← Back to Admin
        </button>
        <h2 style={{ margin: '0 0 0 24px', flex: 1 }}>Setup Repository: {decodedRepo}</h2>
      </div>

      {/* Main Content */}
      <main style={{ flex: 1, marginTop: 60, padding: 24, overflowY: 'auto', display: 'flex', gap: 24 }}>
        {/* Left Panel - Repo Status & Setup / Entities List */}
        <aside style={{ width: 300, background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0 }}>Repository Status</h3>
          {loadingStatus && <div>Loading status...</div>}
          {statusError && <div style={{ color: 'red' }}>Error: {statusError}</div>}

          {!loadingStatus && activeStatus && (
            <>
              <div style={{ marginBottom: 16, padding: 12, background: activeStatus ? '#d4edda' : '#fff3cd', borderRadius: 6 }}>
                <strong>Status:</strong>{' '}
                <span style={{ color: activeStatus ? '#155724' : '#856404' }}>
                  {activeStatus ? '✓ Active' : '✗ Inactive'}
                </span>
              </div>

              {!activeStatus && (
                <button
                  onClick={handleSetupRepo}
                  disabled={setupSubmitting}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: setupSubmitting ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: setupSubmitting ? 0.7 : 1,
                    marginBottom: 12
                  }}
                >
                  {setupSubmitting ? 'Setting up...' : '⚙️ Setup Repo'}
                </button>
              )}
              {setupError && <div style={{ color: 'red', fontSize: 12, marginTop: 8 }}>{setupError}</div>}
            </>
          )}

          {/* Entities List - Show if active */}
          {activeStatus && (
            <>
              <hr style={{ margin: '16px 0' }} />
              <h4 style={{ marginTop: 0 }}>Entities</h4>
              {loadingEntities && <div>Loading entities...</div>}
              {entitiesError && <div style={{ color: 'red', fontSize: 12 }}>Error: {entitiesError}</div>}
              {!loadingEntities && !entitiesError && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {entities.length === 0 ? (
                    <li style={{ color: '#666' }}>No entities found</li>
                  ) : (
                    entities.map((entity, idx) => {
                      const label = typeof entity === 'string' ? entity : (entity.name || entity.table || entity.id || `Entity ${idx}`);
                      return (
                        <li key={idx} style={{ marginBottom: 6 }}>
                          <button
                            onClick={() => handleEntitySelect(label)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '10px 12px',
                              border: selectedEntity === label ? '2px solid #007bff' : '1px solid #ddd',
                              background: selectedEntity === label ? '#e7f3ff' : 'white',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: selectedEntity === label ? 'bold' : 'normal',
                              fontSize: 12
                            }}
                          >
                            {label}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </>
          )}
        </aside>

        {/* Right Panel - Entity Fields Form */}
        <div style={{ flex: 1 }}>
          {selectedEntity ? (
            <div style={{ background: 'white', padding: 20, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ marginTop: 0 }}>Entity: {selectedEntity}</h3>
                <div>
                  <button
                    onClick={handleBulkUpdateSubmit}
                    disabled={selectedRecords.length === 0 || bulkUpdating}
                    style={{
                      padding: '8px 12px',
                      background: selectedRecords.length === 0 ? '#ccc' : (bulkUpdating ? '#6c757d' : '#17a2b8'),
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: selectedRecords.length === 0 || bulkUpdating ? 'not-allowed' : 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {bulkUpdating ? `Updating... (${selectedRecords.length})` : `✎ Update Selected (${selectedRecords.length})`}
                  </button>
                </div>
              </div>
              {/* Inline editing only; Update Selected uses current grid values directly. */}
              {loadingFields && <div>Loading fields...</div>}
              {fieldsError && <div style={{ color: 'red' }}>Error: {fieldsError}</div>}

              {!loadingFields && !fieldsError && (
                <>
                  {entityFields.length === 0 ? (
                    <p style={{ color: '#666' }}>No fields found</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #007bff', background: '#f8f9fa' }}>
                          {/* Select column */}
                          <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#333', borderRight: '1px solid #ddd' }}>Select</th>
                          {entityFields.length > 0 && (() => {
                            const keys = Object.keys(entityFields[0]);
                            return keys.map((key) => (
                              <th
                                key={key}
                                style={{
                                  padding: '12px',
                                  textAlign: key === 'id' || key === 'is_pk' || key === 'visible' ? 'center' : 'left',
                                  fontWeight: 'bold',
                                  color: '#333',
                                  borderRight: '1px solid #ddd'
                                }}
                              >
                                {key.replace(/_/g, ' ').toUpperCase()}
                              </th>
                            ));
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {entityFields.map((field, idx) => {
                          // PK is always 'id'
                          const pkVal = field.id || idx;
                          const isSelected = selectedRecords.includes(pkVal);
                          // detect editable keys from sample row
                          const sample = entityFields[0] || {};
                          const labelKey = detectLabelKey(sample);
                          const refKey = detectReferenceKey(sample);
                          const visKey = detectVisibleKey(sample);

                          return (
                            <tr
                              key={idx}
                              style={{
                                borderBottom: '1px solid #eee',
                                background: idx % 2 === 0 ? 'white' : '#fafafa',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f0f0'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'; }}
                            >
                              <td style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #eee' }}>
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(pkVal)} />
                              </td>
                              {Object.entries(field).map(([key, value]) => {
                                const isPk = key === 'is_pk' && value === true;
                                const isBooleanField = typeof value === 'boolean';

                                // Inline editable for LABEL NAME / VISIBLE / REFERENCE PICKER ATTRIBUTE
                                if (labelKey && key === labelKey) {
                                  const editing = editingCell.pk === pkVal && editingCell.key === key;
                                  const displayVal = value !== null && value !== undefined ? String(value) : '';
                                  return (
                                    <td key={key} style={{ padding: '12px', borderRight: '1px solid #eee', background: editing ? '#e8f4f8' : '#fffbf0' }}>
                                      {editing ? (
                                        <input
                                          autoFocus
                                          defaultValue={displayVal}
                                          onBlur={(e) => handleCellInputBlur(pkVal, key, e)}
                                          onKeyDown={(e) => handleCellInputKeyDown(pkVal, key, e)}
                                          style={{ width: '100%', padding: '6px 8px', border: '2px solid #17a2b8' }}
                                        />
                                      ) : (
                                        <div>
                                          <div onClick={() => startEditingCell(pkVal, key)} style={{ cursor: 'pointer', color: '#333', fontWeight: 500, minHeight: '20px' }}>
                                            {displayVal || <em style={{ color: '#ccc' }}>empty</em>}
                                          </div>
                                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>(click to edit)</div>
                                        </div>
                                      )}
                                    </td>
                                  );
                                }

                                if (refKey && key === refKey) {
                                  const editing = editingCell.pk === pkVal && editingCell.key === key;
                                  const displayVal = value !== null && value !== undefined ? String(value) : '';
                                  return (
                                    <td key={key} style={{ padding: '12px', borderRight: '1px solid #eee', background: editing ? '#e8f4f8' : '#fffbf0' }}>
                                      {editing ? (
                                        <input
                                          autoFocus
                                          defaultValue={displayVal}
                                          onBlur={(e) => handleCellInputBlur(pkVal, key, e)}
                                          onKeyDown={(e) => handleCellInputKeyDown(pkVal, key, e)}
                                          style={{ width: '100%', padding: '6px 8px', border: '2px solid #17a2b8' }}
                                        />
                                      ) : (
                                        <div>
                                          <div onClick={() => startEditingCell(pkVal, key)} style={{ cursor: 'pointer', color: '#333', fontWeight: 500, minHeight: '20px' }}>
                                            {displayVal || <em style={{ color: '#ccc' }}>empty</em>}
                                          </div>
                                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>(click to edit)</div>
                                        </div>
                                      )}
                                    </td>
                                  );
                                }

                                if (visKey && key === visKey) {
                                  const editing = editingCell.pk === pkVal && editingCell.key === key;
                                  return (
                                    <td key={key} style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #eee' }} onClick={() => startEditingCell(pkVal, key)}>
                                      <input
                                        type="checkbox"
                                        checked={!!value}
                                        disabled={!editing}
                                        onChange={(e) => { updateEntityFieldValue(pkVal, key, e.target.checked); if (editing) stopEditingCell(); }}
                                      />
                                      {!editing && <div style={{ fontSize: 12, color: '#666' }}>(click to edit)</div>}
                                    </td>
                                  );
                                }

                                const displayValue = isBooleanField
                                  ? (value ? <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓</span> : <span style={{ color: '#dc3545' }}>✗</span>)
                                  : (value === null ? '—' : String(value));

                                return (
                                  <td
                                    key={key}
                                    style={{
                                      padding: '12px',
                                      color: '#333',
                                      textAlign: key === 'id' || key === 'is_pk' || key === 'visible' ? 'center' : 'left',
                                      fontWeight: isPk ? 'bold' : 'normal',
                                      borderRight: '1px solid #eee'
                                    }}
                                  >
                                    {displayValue}
                                    {isPk && key === 'field_name' && <span style={{ color: '#dc3545', marginLeft: 6 }}>🔑</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ background: 'white', padding: 20, borderRadius: 8, textAlign: 'center', color: '#999' }}>
              {!activeStatus ? (
                <p>Setup the repository first, then select an entity to view fields.</p>
              ) : (
                <p>Select an entity from the left to view and configure fields.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default SetupRepo;