import { useState } from 'react';
import { ref, set, update, get } from 'firebase/database';
import { db } from '../firebase';

function genTeamCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

// basePath is `sessions/{code}` inside a session (so teams survive between
// games) or `games/{pin}` for a one-off game.
export default function TeamLobby({ basePath, user, playerName, teams, myTeamCode }) {
  const [joinCode, setJoinCode]   = useState('');
  const [teamName, setTeamName]   = useState('');
  const [error, setError]         = useState('');
  const [busy, setBusy]           = useState(false);

  const myTeam = myTeamCode ? teams?.[myTeamCode] : null;
  const teamList = Object.entries(teams || {});

  async function createTeam() {
    if (!teamName.trim()) { setError('Enter a team name'); return; }
    if (teamList.length >= 10) { setError('Max 10 teams per session'); return; }
    setBusy(true); setError('');
    const code = genTeamCode();
    try {
      await set(ref(db, `${basePath}/teams/${code}`), {
        name: teamName.trim().slice(0, 30),
        captainUid: user.uid,
        members: { [user.uid]: true },
      });
      await update(ref(db, `${basePath}/players/${user.uid}`), { teamCode: code });
    } catch (e) {
      setError('Could not create team');
    } finally {
      setBusy(false);
    }
  }

  async function joinTeam() {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('Enter a team code'); return; }
    setBusy(true); setError('');
    try {
      const snap = await get(ref(db, `${basePath}/teams/${code}`));
      if (!snap.exists()) { setError('Team not found'); setBusy(false); return; }
      await update(ref(db, `${basePath}/teams/${code}/members`), { [user.uid]: true });
      await update(ref(db, `${basePath}/players/${user.uid}`), { teamCode: code });
    } catch {
      setError('Could not join team');
    } finally {
      setBusy(false);
    }
  }

  async function leaveTeam() {
    if (!myTeamCode) return;
    setBusy(true);
    try {
      await set(ref(db, `${basePath}/teams/${myTeamCode}/members/${user.uid}`), null);
      await update(ref(db, `${basePath}/players/${user.uid}`), { teamCode: null });
    } finally {
      setBusy(false);
    }
  }

  if (myTeam) {
    return (
      <div className="team-box">
        <div className="team-joined">
          <span className="team-badge">Team: {myTeam.name}</span>
          <span className="team-code-display">Code: <strong>{myTeamCode}</strong></span>
          <span className="team-member-count">
            {Object.keys(myTeam.members || {}).length} member{Object.keys(myTeam.members || {}).length !== 1 ? 's' : ''}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '6px 14px' }} onClick={leaveTeam} disabled={busy}>
            Leave team
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="team-box">
      <p className="team-box-title">Teams (optional)</p>
      <div className="team-actions">
        <div className="team-create">
          <input
            className="text-input"
            placeholder="Team name"
            value={teamName}
            onChange={e => setTeamName(e.target.value.slice(0, 30))}
            style={{ fontSize: '0.9rem', padding: '8px 12px' }}
          />
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={createTeam} disabled={busy}>
            Create
          </button>
        </div>
        <div className="team-or">or join</div>
        <div className="team-join">
          <input
            className="text-input"
            placeholder="Team code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.slice(0, 4).toUpperCase())}
            style={{ fontSize: '0.9rem', padding: '8px 12px', letterSpacing: '3px', textTransform: 'uppercase' }}
            maxLength={4}
          />
          <button className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={joinTeam} disabled={busy}>
            Join
          </button>
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      {teamList.length > 0 && (
        <div className="team-list">
          {teamList.map(([code, t]) => (
            <div key={code} className="team-chip">
              {t.name} <span className="team-chip-code">#{code}</span>
              <span className="team-chip-count">{Object.keys(t.members || {}).length}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
