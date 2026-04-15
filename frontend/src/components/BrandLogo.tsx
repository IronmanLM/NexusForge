type BrandLogoVariant = 'icon' | 'wordmark' | 'auth';

export default function BrandLogo({
  variant = 'wordmark',
  className = '',
  alt = 'Nexus Forge'
}: {
  variant?: BrandLogoVariant;
  className?: string;
  alt?: string;
}) {
  const ratioClass = variant === 'icon' ? 'brand-logo--icon' : variant === 'auth' ? 'brand-logo--auth' : 'brand-logo--wordmark';
  const src = variant === 'icon' ? '/brand/nexus_forge_symbol.svg' : '/brand/nexus_forge_with_text.svg';

  return (
    <span className={`brand-logo ${ratioClass} ${className}`.trim()} aria-label={alt}>
      <img src={src} alt={alt} className="brand-logo__image" />
    </span>
  );
}
