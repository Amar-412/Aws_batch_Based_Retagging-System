import PageHeader from '../components/PageHeader';
import { useWorkflow } from '../context/WorkflowContext';

export default function SettingsPage() {
  const { validatedObjects, rules, previewConfirmed, batchJobs } = useWorkflow();

  return (
    <>
      <PageHeader
        title="Settings"
        description="This workspace keeps the current workflow in the browser session. Server credentials are not available here."
      />
      <section className="card card-pad">
        <h2 className="section-title">Current session</h2>
        <dl className="kv">
          <div>
            <dt>Validated objects</dt>
            <dd>{validatedObjects.length}</dd>
          </div>
          <div>
            <dt>Saved rules</dt>
            <dd>{rules.length}</dd>
          </div>
          <div>
            <dt>Preview confirmed</dt>
            <dd>{previewConfirmed ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Jobs created in this session</dt>
            <dd>{batchJobs?.jobs?.length ?? 0}</dd>
          </div>
        </dl>
        <p className="hint">AWS access keys, secret keys, and role credentials are used only by the backend. They are not stored in this page.</p>
      </section>
    </>
  );
}
