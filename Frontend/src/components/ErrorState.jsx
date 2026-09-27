import SecondaryButton from './SecondaryButton';

export default function ErrorState({ title = 'Something went wrong', message, details = [], onRetry }) {
  return (
    <div className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {details.length > 0 && (
        <ul>
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {onRetry && <SecondaryButton onClick={onRetry}>Try Again</SecondaryButton>}
    </div>
  );
}
