import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home      from './pages/Home';
import HostSetup from './pages/HostSetup';
import Host      from './pages/Host';
import Join      from './pages/Join';
import Play      from './pages/Play';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<Home />}      />
        <Route path="/create" element={<HostSetup />} />
        <Route path="/host"   element={<Host />}      />
        <Route path="/join"   element={<Join />}      />
        <Route path="/play"   element={<Play />}      />
      </Routes>
    </BrowserRouter>
  );
}
