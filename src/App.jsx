import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home          from './pages/Home';
import HostSetup     from './pages/HostSetup';
import Host          from './pages/Host';
import Join          from './pages/Join';
import Play          from './pages/Play';
import GlobalLeaderboard from './pages/GlobalLeaderboard';
import FeedbackHub    from './pages/FeedbackEntry';
import FeedbackCreate from './pages/FeedbackCreate';
import FeedbackSubmit from './pages/FeedbackSubmit';
import FeedbackView   from './pages/FeedbackView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Home />}          />
        <Route path="/create"          element={<HostSetup />}     />
        <Route path="/host"            element={<Host />}          />
        <Route path="/join"            element={<Join />}          />
        <Route path="/play"            element={<Play />}          />
        <Route path="/leaderboard"     element={<GlobalLeaderboard />} />
        <Route path="/feedback"        element={<FeedbackHub />}   />
        <Route path="/feedback-create" element={<FeedbackCreate />}/>
        <Route path="/feedback-submit" element={<FeedbackSubmit />}/>
        <Route path="/feedback-view"   element={<FeedbackView />}  />
      </Routes>
    </BrowserRouter>
  );
}
