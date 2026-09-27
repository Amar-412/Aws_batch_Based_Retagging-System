import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { WorkflowProvider } from './context/WorkflowContext.jsx';
import BatchJobPage from './pages/BatchJobPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import JobStatusPage from './pages/JobStatusPage.jsx';
import JobsPage from './pages/JobsPage.jsx';
import PreviewPage from './pages/PreviewPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <WorkflowProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/preview" element={<PreviewPage />} />
            <Route path="/batch-job" element={<BatchJobPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/job/:jobId" element={<JobStatusPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </WorkflowProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
