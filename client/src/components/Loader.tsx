import '../styles/loader.css';

interface LoaderProps {
  message?: string;
}

export function Loader({ message = 'Loading…' }: LoaderProps) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-spinner" aria-hidden="true" />
      <span className="loader-message">{message}</span>
    </div>
  );
}

export default Loader;
