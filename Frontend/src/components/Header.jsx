import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import SecondaryButton from './SecondaryButton';

export default function Header({ onMenu }) {
  const { theme, setTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="topbar">
      <button type="button" className="menu-btn" onClick={onMenu} aria-label="Open navigation">
        Menu
      </button>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          Cu
        </span>
        <span className="brand-name">Cupid</span>
      </div>
      <div className="topbar-actions">
        <div className="theme-toggle" role="group" aria-label="Color theme">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            Light
          </button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            Dark
          </button>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setHelpOpen(true)}>
          Help
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen((open) => !open)}
        >
          Workspace
        </button>
        {profileOpen && (
          <div className="popover" role="dialog" aria-label="Workspace">
            <p className="popover-title">Local workspace</p>
            <p>This browser session stores the current upload, rules, and preview. AWS credentials stay on the server and are not shown here.</p>
            <SecondaryButton onClick={() => setProfileOpen(false)}>Close</SecondaryButton>
          </div>
        )}
      </div>

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="help-title">How retagging works</h2>
            <ol className="help-list">
              <li>Upload a CSV of bucket and object key references.</li>
              <li>Validate that those objects exist. This does not change them.</li>
              <li>Build rules that propose tags. Conflicts do not pick a winner.</li>
              <li>Preview the plan. Proposed tags are not applied yet.</li>
              <li>Create one S3 Batch Operations job. Creation does not retag objects.</li>
              <li>Open job status for the completion report and actual S3 tags.</li>
            </ol>
            <div className="button-row">
              <SecondaryButton onClick={() => setHelpOpen(false)}>Close</SecondaryButton>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
