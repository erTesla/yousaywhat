import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home          from './pages/Home';
import HostSetup     from './pages/HostSetup';
import Create        from './pages/Create';
import Host          from './pages/Host';
import Join          from './pages/Join';
import Play          from './pages/Play';
import GlobalLeaderboard from './pages/GlobalLeaderboard';
import Results from './pages/Results';
import FeedbackHub    from './pages/FeedbackEntry';
import FeedbackCreate from './pages/FeedbackCreate';
import FeedbackSubmit from './pages/FeedbackSubmit';
import FeedbackView   from './pages/FeedbackView';
import SessionCreate  from './pages/SessionCreate';
import SessionHost    from './pages/SessionHost';
import SessionJoin    from './pages/SessionJoin';
import SessionPlay    from './pages/SessionPlay';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Home />}          />
        <Route path="/create"          element={<Create />}        />
        <Route path="/create/setup"    element={<HostSetup />}     />
        <Route path="/host"            element={<Host />}          />
        <Route path="/join"            element={<Join />}          />
        <Route path="/play"            element={<Play />}          />
        <Route path="/leaderboard"     element={<GlobalLeaderboard />} />
        <Route path="/results"         element={<Results />} />
        <Route path="/feedback"        element={<FeedbackHub />}   />
        <Route path="/feedback-create" element={<FeedbackCreate />}/>
        <Route path="/feedback-submit" element={<FeedbackSubmit />}/>
        <Route path="/feedback-view"   element={<FeedbackView />}  />
        <Route path="/session/create"  element={<SessionCreate />} />
        <Route path="/session/host"    element={<SessionHost />}   />
        <Route path="/session/join"    element={<SessionJoin />}   />
        <Route path="/session/play"    element={<SessionPlay />}   />
      </Routes>
    </BrowserRouter>
  );
}
