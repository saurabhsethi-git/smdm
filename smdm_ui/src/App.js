import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import logo from './logo.svg';
import './App.css';
import EntityPage from './pages/EntityPage';
import EntityDetails from './pages/EntityDetails';
import Launcher from './pages/Launcher';
import Admin from './pages/Admin';
import SetupRepo from './pages/SetupRepo';

function MainLayout({ entities, loading, error, isRepoReady, isRepoActive, refreshPage, repoSetup, handleClick, repoName }) {
  const navigate = useNavigate();

  return (
    <div className="App" style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 260, borderRight: '1px solid #e0e0e0', padding: 16, boxSizing: 'border-box' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            border: '1px solid #ddd',
            background: '#f0f0f0',
            cursor: 'pointer',
            borderRadius: 4,
            marginBottom: 16,
            fontWeight: 'bold'
          }}
        >
          ← Back to Apps
        </button>

        <h3 style={{ marginTop: 0 }}>Repo: {repoName}</h3>

        {isRepoReady === 1 && isRepoActive && <h4>Entities</h4>}
        {loading && <div>Loading...</div>}
        {isRepoReady === 1 && isRepoActive && error && <div style={{ color: 'red' }}>Error: {error}</div>}
        {!loading && !error && isRepoReady === 1 && isRepoActive &&(
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {entities.length === 0 && <li style={{ color: '#666' }}>No entities found</li>}
            {entities.map((item, idx) => {
              const label = typeof item === 'string'
                ? item.replace(/^rp_/, '')
                : (item.name || item.table || item.id || JSON.stringify(item));
              const key = typeof item === 'string' ? item : idx;
              return (
                <li key={key} style={{ padding: '4px 0' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/${encodeURIComponent(repoName)}/entity/${encodeURIComponent(label)}`)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      border: '1px solid transparent',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderRadius: 4
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
        {repoSetup === 1 && <button onClick={refreshPage}>Refresh Page</button>}
      </aside>

      <main style={{ flex: 1, padding: 24 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} className="App-logo" alt="logo" style={{ width: 40, height: 40 }} />
          <h2>Welcome</h2>
        </header>
        <p>Choose an entity from the left to view details.</p>
      </main>
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
      <Route path="/app/:repoName/entity/:name" element={<EntityPage />} />
      <Route path="/app/:repoName/entity/:name/record/:pk" element={<EntityDetails />} />
    </Routes>
  );
}

export default App;