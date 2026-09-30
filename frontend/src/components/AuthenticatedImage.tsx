import { CSSProperties } from 'react';
import { useProtectedResourceUrl } from '../hooks/useProtectedResourceUrl';

type AuthenticatedImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  resourceId?: string | null;
};

export default function AuthenticatedImage({ src, alt, className, style, resourceId }: AuthenticatedImageProps) {
  const resolvedSrc = useProtectedResourceUrl(src, resourceId);

  if (!resolvedSrc) {
    return null;
  }

  return <img src={resolvedSrc} alt={alt} className={className} style={style} />;
}
