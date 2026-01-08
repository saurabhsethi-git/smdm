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
    } catch (err) {
      setFieldsError(err.message || String(err));
      setEntityFields([]);
    } finally {
      setLoadingFields(false);
    }
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
              <h3 style={{ marginTop: 0 }}>Entity: {selectedEntity}</h3>
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
                          {entityFields.length > 0 && Object.keys(entityFields[0]).map((key) => (
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
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entityFields.map((field, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid #eee',
                              background: idx % 2 === 0 ? 'white' : '#fafafa',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f0f0f0';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa';
                            }}
                          >
                            {Object.entries(field).map(([key, value]) => {
                              const isPk = key === 'is_pk' && value === true;
                              //const isVisible = key === 'visible' && value === true;
                              const isBooleanField = typeof value === 'boolean';
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
                        ))}
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