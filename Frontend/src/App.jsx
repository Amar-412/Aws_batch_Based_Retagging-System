import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WorkflowProvider } from './context/WorkflowContext.jsx';
import BatchJobPage from './pages/BatchJobPage.jsx';
import JobStatusPage from './pages/JobStatusPage.jsx';
import JobsPage from './pages/JobsPage.jsx';
import PreviewPage from './pages/PreviewPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <WorkflowProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/batch-job" element={<BatchJobPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/job/:jobId" element={<JobStatusPage />} />
        </Routes>
      </WorkflowProvider>
    </BrowserRouter>
  );
}
