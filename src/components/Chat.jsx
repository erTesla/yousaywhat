import { useState, useEffect, useRef } from 'react';
import { ref, push, update, onChildAdded } from 'firebase/database';
import { db } from '../firebase';

const MAX_LEN = 200;
const COOLDOWN_MS = 3000;

export default function Chat({ pin, user, playerName, isHost, chatEnabled }) {
  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [open, setOpen]         = useState(false);
  const [unread, setUnread]     = useState(0);
  const [lastSent, setLastSent] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!pin) return;
    const chatRef = ref(db, `games/${pin}/chat`);
    const unsub = onChildAdded(chatRef, snap => {
      const msg = { id: snap.key, ...snap.val() };
      setMessages(prev => {
        if (prev.some(m => m.id === snap.key)) return prev;
        return [...prev, msg];
      });
      if (!open) setUnread(n => n + 1);
    });
    return unsub;
  }, [pin, open]);

  // Scroll to bottom when chat is opened or new message arrives
  useEffect(() => {
    if (open) {
      setUnread(0);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || !user || !chatEnabled) return;

    const now = Date.now();
    if (now - lastSent < COOLDOWN_MS) return;

    setText('');
    setLastSent(now);

    try {
      await push(ref(db, `games/${pin}/chat`), {
        uid:     user.uid,
        name:    playerName || 'Anonymous',
        text:    trimmed.slice(0, MAX_LEN),
        sentAt:  now,
      });
      // The DB cooldown rule reads players/{uid}/lastMessageAt. Nothing wrote it
      // before, so the rule's "not set" branch was always true and the
      // server-side limit never actually applied. Written after the push so the
      // rule evaluates against the previous timestamp.
      if (!isHost) {
        await update(ref(db, `games/${pin}/players/${user.uid}`), { lastMessageAt: now });
      }
    } catch {
      // DB rule rejected (cooldown enforced server-side too) — silently drop
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const cooldownLeft = Math.max(0, COOLDOWN_MS - (Date.now() - lastSent));
  const onCooldown   = cooldownLeft > 0;

  return (
    <div className={`chat-widget${open ? ' chat-open' : ''}`}>
      {/* Toggle button */}
      <button className="chat-toggle" onClick={() => setOpen(o => !o)} aria-label="Toggle chat">
        💬
        {unread > 0 && !open && <span className="chat-badge">{unread}</span>}
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <span>Live Chat</span>
            {isHost && (
              <span className="chat-host-tag">Host</span>
            )}
            <button className="chat-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">No messages yet. Say hi! 👋</p>
            )}
            {messages.map(m => (
              <div key={m.id} className={`chat-msg${m.uid === user?.uid ? ' chat-mine' : ''}`}>
                <span className="chat-name">{m.uid === user?.uid ? 'You' : m.name}</span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {!chatEnabled ? (
            <p className="chat-disabled">Chat is disabled by the host.</p>
          ) : (
            <div className="chat-input-row">
              <input
                className="chat-input"
                value={text}
                onChange={e => setText(e.target.value.slice(0, MAX_LEN))}
                onKeyDown={onKey}
                placeholder={onCooldown ? 'Wait a moment…' : 'Say something…'}
                disabled={onCooldown}
                maxLength={MAX_LEN}
              />
              <button
                className="chat-send"
                onClick={send}
                disabled={!text.trim() || onCooldown}
              >
                ➤
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
