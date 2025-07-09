import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './App.css'; // For basic styling

const API_BASE_URL = "https://scriptwriter-3.onrender.com/api"; // Backend URL

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [screenplays, setScreenplays] = useState([]);
  const [currentScreenplay, setCurrentScreenplay] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [saveStatus, setSaveStatus] = useState(''); // New state for save status

  // Refs to hold the latest state values for auto-save without making useEffect re-run
  const editingTitleRef = useRef('');
  const editingContentRef = useRef('');
  const currentScreenplayRef = useRef(null); // Ref for currentScreenplay stability in callbacks
  const saveTimerRef = useRef(null); // Ref for the auto-save timer

  // Update refs whenever the state changes
  useEffect(() => {
    editingTitleRef.current = editingTitle;
  }, [editingTitle]);

  useEffect(() => {
    editingContentRef.current = editingContent;
  }, [editingContent]);

  useEffect(() => {
    currentScreenplayRef.current = currentScreenplay;
  }, [currentScreenplay]);


  /* ══════════════════════ Memoized callbacks ══════════════════════ */

  const handleLogout = useCallback(() => {
    console.log('Logging out...');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setScreenplays([]);
    setCurrentScreenplay(null);
    setEditingTitle('');
    setEditingContent('');
    setUserDisplayName('');
    setSaveStatus(''); // Clear save status on logout
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
  }, []);

  // Define fetchScreenplays FIRST, as it's a dependency for other callbacks and initial useEffect
  const fetchScreenplays = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('fetchScreenplays: No token found, returning.');
      return;
    }

    console.log('fetchScreenplays: Attempting to fetch screenplays...');
    try {
      const response = await axios.get(`${API_BASE_URL}/screenplays`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('fetchScreenplays: Received response:', response.data);
      setScreenplays(response.data);

      if (response.data.length > 0) {
        let screenplayToSelect = response.data[0]; // Default to first screenplay

        // If a current screenplay exists and is still in the fetched list, keep it selected
        // IMPORTANT: Check if the reference is different to avoid unnecessary state updates
        const previouslySelectedId = currentScreenplayRef.current?.id;
        if (previouslySelectedId) {
          const foundInList = response.data.find((sp) => sp.id === previouslySelectedId);
          if (foundInList) {
            screenplayToSelect = foundInList;
            console.log('fetchScreenplays: Keeping current screenplay selected.');
          } else {
            // Previously selected screenplay not found (e.g., deleted by another user/tab)
            console.log('fetchScreenplays: Previously selected screenplay not found, selecting first.');
          }
        } else {
          console.log('fetchScreenplays: No current screenplay, selecting first.');
        }

        // Only update currentScreenplay state if the object reference is actually different
        // This is key to preventing re-renders if the content hasn't changed but was re-fetched
        if (!currentScreenplayRef.current || screenplayToSelect.id !== currentScreenplayRef.current.id || screenplayToSelect !== currentScreenplayRef.current) {
          setCurrentScreenplay(screenplayToSelect);
          setEditingTitle(screenplayToSelect.title);
          setEditingContent(screenplayToSelect.content || '');
          console.log('fetchScreenplays: Editor state set for:', screenplayToSelect.title);
        } else {
          // If the screenplay is the same object reference, just ensure editor content is up to date
          // This handles cases where a background save might have updated 'updated_at' but content is same
          setEditingTitle(screenplayToSelect.title);
          setEditingContent(screenplayToSelect.content || '');
          console.log('fetchScreenplays: Current screenplay reference is stable, updated editor content.');
        }


      } else {
        // No screenplays, reset editor
        setCurrentScreenplay(null);
        setEditingTitle('');
        setEditingContent('');
        console.log('fetchScreenplays: No screenplays, resetting editor state.');
      }
    } catch (error) {
      console.error('fetchScreenplays: Error fetching screenplays:', error);
      if (
        error.response &&
        (error.response.status === 401 || error.response.status === 403)
      ) {
        handleLogout();
        alert('Session expired. Please log in again.');
      } else {
        alert('Failed to fetch screenplays. Please ensure the backend is running and reachable.');
      }
    }
  }, [handleLogout]); // Dependencies are now more stable


  // handleSaveScreenplay no longer depends on editingTitle or editingContent state directly
  // It takes them as arguments. This makes the useCallback more stable.
  const handleSaveScreenplay = useCallback(
    async (silent = false, titleToSave, contentToSave) => {
      const screenplayToSave = currentScreenplayRef.current; // Get current screenplay from ref
      const actualTitle = titleToSave !== undefined ? titleToSave : editingTitleRef.current;
      const actualContent = contentToSave !== undefined ? contentToSave : editingContentRef.current;

      if (!screenplayToSave) {
        console.log('handleSaveScreenplay: No screenplay selected to save.');
        if (!silent) alert('No screenplay selected to save. Please create a new one or select an existing one.');
        return;
      }
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('handleSaveScreenplay: No token found.');
        if (!silent) alert('You must be logged in to save a screenplay.');
        return;
      }

      console.log(`handleSaveScreenplay: Attempting to save screenplay ID: ${screenplayToSave.id}, Title: "${actualTitle}", Content length: ${actualContent.length}`);
      setSaveStatus('Saving...'); // Indicate saving is in progress
      try {
        const response = await axios.put(
          `${API_BASE_URL}/screenplays/${screenplayToSave.id}`,
          {
            title: actualTitle,
            content: actualContent
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        console.log('handleSaveScreenplay: Save successful!', response.data);
        setSaveStatus('Saved!'); // Indicate success
        setTimeout(() => setSaveStatus(''), 2000); // Clear status after 2 seconds
        // IMPORTANT: Re-fetch screenplays to update the sidebar with latest title/updated_at
        // Also ensures currentScreenplay state is updated with the latest from server if needed
        fetchScreenplays();
      } catch (error) {
        console.error('handleSaveScreenplay: Error saving screenplay:', error.response?.data || error.message);
        setSaveStatus('Save Failed!'); // Indicate failure
        setTimeout(() => setSaveStatus(''), 3000); // Clear status after 3 seconds
        if (
          error.response &&
          (error.response.status === 401 || error.response.status === 403)
        ) {
          handleLogout();
          alert('Session expired. Please log in again.');
        } else {
          if (!silent) alert(`Failed to save screenplay: ${error.response?.data?.message || error.message}`);
        }
      }
    },
    [fetchScreenplays, handleLogout] // Dependencies are now more stable
  );


  const handleAuth = useCallback(
    async (isRegister) => {
      console.log(`handleAuth: Attempting ${isRegister ? 'registration' : 'login'} for user: ${username}`);
      try {
        const endpoint = isRegister ? 'auth/register' : 'auth/login';
        const response = await axios.post(`${API_BASE_URL}/${endpoint}`, {
          username,
          password
        });

        if (response.status === 200 || response.status === 201) {
          const { token, user } = response.data;
          console.log(`handleAuth: ${isRegister ? 'Registration' : 'Login'} successful for ${user.username}.`);
          localStorage.setItem('token', token);
          localStorage.setItem('username', user.username);
          setIsLoggedIn(true);
          setUserDisplayName(user.username);
          setUsername('');
          setPassword('');
          setIsRegistering(false);
          fetchScreenplays(); // fetchScreenplays is now defined
        }
        alert(response.data.message);
      } catch (error) {
        console.error(
          'handleAuth: Authentication error:',
          error.response ? error.response.data : error.message
        );
        alert(error.response?.data?.message || 'Authentication failed. Please try again.');
      }
    },
    [username, password, fetchScreenplays]
  );

  const handleNewScreenplay = useCallback(async () => {
    console.log('handleNewScreenplay: Initiating new screenplay creation.');
    const token = localStorage.getItem('token');
    if (!token) {
      alert('You must be logged in to create a new screenplay.');
      return;
    }

    // Save current screenplay before creating a new one, if there is one
    // Access currentScreenplay from ref for latest value without dependency
    if (currentScreenplayRef.current) {
      console.log('handleNewScreenplay: Saving current screenplay before creating new.');
      // Pass the current state values to handleSaveScreenplay
      await handleSaveScreenplay(true, editingTitleRef.current, editingContentRef.current);
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/screenplays`,
        {
          title: 'New Screenplay',
          content: ''
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      console.log('handleNewScreenplay: New screenplay created:', response.data);
      // Prepend to the list to show it immediately at the top
      setScreenplays((prev) => [response.data, ...prev.filter(sp => sp.id !== response.data.id)]);
      setCurrentScreenplay(response.data);
      setEditingTitle(response.data.title);
      setEditingContent(response.data.content || '');
      setSaveStatus('New script created!');
      setTimeout(() => setSaveStatus(''), 2000); // Clear status after 2 seconds
    } catch (error) {
      console.error('handleNewScreenplay: Error creating screenplay:', error.response?.data || error.message);
      if (
        error.response &&
        (error.response.status === 401 || error.response.status === 403)
      ) {
        handleLogout();
        alert('Session expired. Please log in again.');
      } else {
        alert('Failed to create screenplay. Check backend logs.');
      }
    }
  }, [handleLogout, handleSaveScreenplay]); // Dependencies for this callback are now stable

  const handleDeleteScreenplay = useCallback(
    async (screenplayId) => {
      const confirmDelete = window.confirm(
        'Are you sure you want to delete this screenplay? This action cannot be undone.'
      );
      if (!confirmDelete) return;

      console.log(`handleDeleteScreenplay: Attempting to delete screenplay ID: ${screenplayId}`);
      const token = localStorage.getItem('token');
      if (!token) {
        alert('You must be logged in to delete a screenplay.');
        return;
      }

      try {
        await axios.delete(`${API_BASE_URL}/screenplays/${screenplayId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('handleDeleteScreenplay: Screenplay deleted successfully!');
        alert('Screenplay deleted successfully!');
        // After deletion, re-fetch to update the list and potentially select a new default
        fetchScreenplays();
      } catch (error) {
        console.error('handleDeleteScreenplay: Error deleting screenplay:', error.response?.data || error.message);
        if (
          error.response &&
          (error.response.status === 401 || error.response.status === 403)
        ) {
          handleLogout();
          alert('Session expired. Please log in again.');
        } else {
          alert('Failed to delete screenplay.');
        }
      }
    },
    [fetchScreenplays, handleLogout]
  );

  const handlePDFSave = useCallback(
    async () => {
      if (!currentScreenplayRef.current) { // Use ref for currentScreenplay
        alert('No screenplay selected to save as PDF.');
        return;
      }
      console.log(`handlePDFSave: Attempting to generate PDF for screenplay ID: ${currentScreenplayRef.current.id}`);
      const token = localStorage.getItem('token');
      if (!token) {
        alert('You must be logged in to export a PDF.');
        return;
      }

      try {
        const response = await axios.get(
          `${API_BASE_URL}/screenplays/${currentScreenplayRef.current.id}/pdf`,
          {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          }
        );

        console.log('handlePDFSave: PDF blob received, initiating download.');
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute(
          'download',
          `${editingTitleRef.current.replace(/\s/g, '_') || 'screenplay'}.pdf` // Use ref for title
        );
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        alert('PDF generation initiated (check downloads).');
      } catch (error) {
        console.error('handlePDFSave: Error generating PDF:', error.response?.data || error.message);
        if (
          error.response &&
          (error.response.status === 401 || error.response.status === 403)
        ) {
          handleLogout();
          alert('Session expired. Please log in again.');
        } else {
          alert('Failed to generate PDF. Ensure backend PDF generation is working.');
        }
      }
    },
    [handleLogout] // Stable dependencies
  );

  const handleSelectScreenplay = useCallback((screenplay) => {
    console.log('handleSelectScreenplay: Selecting screenplay:', screenplay.title);
    // Clear any pending auto-save before switching screenplays
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      console.log('handleSelectScreenplay: Cleared pending auto-save timer.');
    }

    // Attempt to save current screenplay before switching, ONLY IF it's a different screenplay
    if (currentScreenplayRef.current && currentScreenplayRef.current.id !== screenplay.id) {
      console.log('handleSelectScreenplay: Attempting to save previous screenplay before switching.');
      // Pass the current state values to handleSaveScreenplay
      handleSaveScreenplay(true, editingTitleRef.current, editingContentRef.current);
    }

    // Only update state if the selected screenplay is actually different to prevent unnecessary re-renders
    if (!currentScreenplayRef.current || currentScreenplayRef.current.id !== screenplay.id) {
      setCurrentScreenplay(screenplay);
      setEditingTitle(screenplay.title);
      setEditingContent(screenplay.content || '');
      setSaveStatus(''); // Clear status when switching
      console.log('handleSelectScreenplay: Editor state set for:', screenplay.title);
    } else {
      console.log('handleSelectScreenplay: Selected screenplay is already current, no state change needed.');
    }
  }, [handleSaveScreenplay]); // Stable dependencies


  /* ══════════════════════ Auto-Save Logic ══════════════════════ */
  useEffect(() => {
    // Only set up auto-save if a screenplay is currently selected
    if (currentScreenplay) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // Set a new timer to save after 2 seconds of no typing
      saveTimerRef.current = setTimeout(() => {
        console.log('useEffect (Auto-save): Timer triggered, attempting to save.');
        // Call save function silently, passing current values from state (or refs if preferred)
        handleSaveScreenplay(true, editingTitle, editingContent);
      }, 2000); // 2-second debounce
    }

    // Cleanup function: clear timer if component unmounts or currentScreenplay changes
    return () => {
      if (saveTimerRef.current) {
        console.log('useEffect (Auto-save cleanup): Clearing timer.');
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [editingTitle, editingContent, currentScreenplay, handleSaveScreenplay]); // Dependencies are necessary here to trigger debounce


  /* ══════════════════════ Initial login check ══════════════════════ */
  useEffect(() => {
    console.log('useEffect (Initial): Checking local storage for token.');
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');

    if (token && token !== 'undefined' && storedUsername && storedUsername !== 'undefined') {
      setIsLoggedIn(true);
      setUserDisplayName(storedUsername);
      console.log('useEffect (Initial): Found token, fetching screenplays.');
      fetchScreenplays();
    } else {
      console.log('useEffect (Initial): No valid token found, remaining logged out.');
    }
  }, [fetchScreenplays]); // fetchScreenplays is stable


  /* ══════════════════════ Render ══════════════════════ */

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <h1>Screenplay App</h1>
        <div className="auth-form">
          <h2>{isRegistering ? 'Register' : 'Login'}</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={() => handleAuth(isRegistering)}>
            {isRegistering ? 'Register' : 'Login'}
          </button>
          <p>
            {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span className="toggle-auth" onClick={() => setIsRegistering(!isRegistering)}>
              {isRegistering ? 'Login here' : 'Register here'}
            </span>
          </p>
          <div className="demo-credentials">
            <p>You can register with **any** username and password.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>ScriptWriter</h1>
        <div className="header-user-info">
          <span>Welcome, {userDisplayName}!</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
        <div className="header-actions">
          <button onClick={handleNewScreenplay}>New Script</button>
          {/* Explicitly pass the current values for manual save */}
          <button onClick={() => handleSaveScreenplay(false, editingTitle, editingContent)} disabled={!currentScreenplay}>
            Save Script
          </button>
          {saveStatus && <span className="save-status">{saveStatus}</span>} {/* Status indicator */}
          <button onClick={handlePDFSave} disabled={!currentScreenplay}>
            Export PDF
          </button>
        </div>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <h2>Your Scripts</h2>
          <ul className="screenplay-list">
            {screenplays.length === 0 ? (
              <li className="no-screenplays">No screenplays yet. Create one!</li>
            ) : (
              screenplays.map((sp) => (
                <li
                  key={sp.id}
                  className={currentScreenplay && currentScreenplay.id === sp.id ? 'active' : ''}
                >
                  <span
                    onClick={() => handleSelectScreenplay(sp)}
                    className="screenplay-title-link"
                  >
                    {sp.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent selection when deleting
                      handleDeleteScreenplay(sp.id);
                    }}
                    className="delete-screenplay-btn"
                    title="Delete Screenplay"
                  >
                    &times;
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <div className="editor-area">
          {currentScreenplay ? (
            <>
              <input
                type="text"
                className="screenplay-title-edit"
                value={editingTitle}
                onChange={(e) => {
                  // console.log('Input onChange: Title changed:', e.target.value); // Specific log
                  setEditingTitle(e.target.value);
                }}
                placeholder="Enter Screenplay Title"
              />

              <textarea
                className="screenplay-content-textarea"
                value={editingContent}
                onChange={(e) => {
                  // console.log('Input onChange: Content changed:', e.target.value); // Specific log
                  setEditingContent(e.target.value);
                }}
                placeholder="Start writing your screenplay here..."
                rows="20"
              />
            </>
          ) : (
            <p className="no-screenplay-selected">
              Select a screenplay from the left or create a new one to start writing.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
