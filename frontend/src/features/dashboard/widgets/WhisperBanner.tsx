type WhisperBannerProps = {
  fromName: string;
  preview: string;
  onOpen: () => void;
  onDismiss: () => void;
};

export default function WhisperBanner({ fromName, preview, onOpen, onDismiss }: WhisperBannerProps) {
  return (
    <div className="whisper-banner" role="status" aria-live="polite">
      <div>
        <strong>Message prive de {fromName}</strong>
        <p style={{ margin: '0.25rem 0 0' }}>{preview}</p>
      </div>
      <div className="whisper-banner__actions">
        <button className="button" type="button" onClick={onOpen}>
          Ouvrir dans le chat
        </button>
        <button className="button secondary" type="button" onClick={onDismiss}>
          Plus tard
        </button>
      </div>
    </div>
  );
}
