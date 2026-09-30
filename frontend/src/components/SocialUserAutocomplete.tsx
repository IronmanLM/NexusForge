import { useEffect, useState } from 'react';
import { searchSocialUsersService } from '../services/socialService';
import { SocialUser } from '../types/social';

type SocialUserAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (user: SocialUser) => void;
  placeholder?: string;
  minChars?: number;
  disabled?: boolean;
  emptyMessage?: string;
  hintMessage?: string;
  filterResults?: (users: SocialUser[]) => SocialUser[];
};

export default function SocialUserAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Rechercher un utilisateur',
  minChars = 3,
  disabled = false,
  emptyMessage = 'Aucun utilisateur trouvé.',
  hintMessage,
  filterResults
}: SocialUserAutocompleteProps) {
  const [results, setResults] = useState<SocialUser[]>([]);
  const trimmed = value.trim();
  const hasEnoughChars = trimmed.length >= minChars;

  useEffect(() => {
    if (disabled || !hasEnoughChars) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchSocialUsersService(trimmed)
        .then((items) => {
          if (cancelled) {
            return;
          }
          setResults(filterResults ? filterResults(items) : items);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [disabled, filterResults, hasEnoughChars, trimmed]);

  return (
    <div className="social-user-autocomplete">
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />
      {!disabled && trimmed.length > 0 && !hasEnoughChars ? (
        <p className="social-user-autocomplete__hint">{hintMessage || `Tape au moins ${minChars} lettres.`}</p>
      ) : null}
      {hasEnoughChars ? (
        results.length > 0 ? (
          <div className="social-user-autocomplete__results">
            {results.map((user) => (
              <button
                key={user.id}
                type="button"
                className="social-user-autocomplete__option"
                onClick={() => onSelect(user)}
              >
                <strong>{user.displayName}</strong>
                <span>@{user.nickname || user.id}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="social-user-autocomplete__hint">{emptyMessage}</p>
        )
      ) : null}
    </div>
  );
}
